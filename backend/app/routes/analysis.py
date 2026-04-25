from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from app.db import engine

router = APIRouter()


class AnalysisQueryRequest(BaseModel):
    airlines: list[str] = Field(default_factory=list)
    airports: list[str] = Field(default_factory=list)
    delay_types: list[str] = Field(default_factory=list)
    metric: str = 'avg_arr_delay'
    table_view: str = 'carrier_summary'


ALLOWED_METRICS = {
    'avg_arr_delay': 'ROUND(AVG(ff.arr_delay)::numeric, 2)',
    'total_flights': 'COUNT(*)',
}

ALLOWED_TABLE_VIEWS = {
    'carrier_summary',
    'raw_flights',
}


def _normalize_table_view(table_view: str) -> str:
    if table_view in {'carrier', 'summary', 'carrier_summary'}:
        return 'carrier_summary'

    if table_view in {'raw', 'detailed', 'raw_flights'}:
        return 'raw_flights'

    return table_view if table_view in ALLOWED_TABLE_VIEWS else 'carrier_summary'


def _build_filter_clauses(filters: AnalysisQueryRequest):
    where_clauses = ['ff.arr_delay IS NOT NULL']
    params: dict[str, object] = {}

    if filters.airlines:
        where_clauses.append('dc.carrier_name = ANY(:airlines)')
        params['airlines'] = filters.airlines

    if filters.airports:
        # Airport filters intentionally match flights where the selected airport is either origin or destination.
        where_clauses.append('(origin_airport.airport = ANY(:airports) OR dest_airport.airport = ANY(:airports))')
        params['airports'] = filters.airports

    if filters.delay_types:
        where_clauses.append(
            '''EXISTS (
                SELECT 1
                FROM fact_flight_delay ffd
                JOIN dim_delay_type ddt ON ddt.delay_type_id = ffd.delay_type_id
                WHERE ffd.flight_id = ff.flight_id
                  AND ddt.delay_type_name = ANY(:delay_types)
            )'''
        )
        params['delay_types'] = filters.delay_types

    return where_clauses, params


def _build_query(filters: AnalysisQueryRequest):
    selected_metric = filters.metric if filters.metric in ALLOWED_METRICS else 'avg_arr_delay'
    selected_table_view = _normalize_table_view(filters.table_view)

    select_columns = [
        'dc.carrier_name AS carrier_name',
        'ROUND(AVG(ff.arr_delay)::numeric, 2) AS avg_arr_delay',
        'COUNT(*) AS total_flights',
    ]

    where_clauses, params = _build_filter_clauses(filters)

    if selected_table_view == 'raw_flights':
        raw_query = text(
            f'''
            SELECT
                ff.flight_id AS flight_id,
                dd.full_date AS full_date,
                dc.carrier_name AS carrier_name,
                origin_airport.airport AS origin_airport,
                dest_airport.airport AS destination_airport,
                ff.arr_delay AS arr_delay,
                ff.dep_delay AS dep_delay,
                ff.distance AS distance,
                ff.air_time AS air_time
            FROM fact_flight ff
            JOIN dim_carrier dc
                ON ff.mkt_carrier_airline_id = dc.airline_id
            JOIN dim_date dd
                ON ff.date_id = dd.date_id
            LEFT JOIN dim_airport origin_airport
                ON ff.origin_airport_id = origin_airport.airport_id
            LEFT JOIN dim_airport dest_airport
                ON ff.dest_airport_id = dest_airport.airport_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY dd.full_date DESC, ff.flight_id DESC
            '''
        )

        return raw_query, params, selected_metric, selected_table_view

    query = text(
        f'''
        SELECT
            {', '.join(select_columns)}
        FROM fact_flight ff
        JOIN dim_carrier dc
            ON ff.mkt_carrier_airline_id = dc.airline_id
        JOIN dim_date dd
            ON ff.date_id = dd.date_id
        LEFT JOIN dim_airport origin_airport
            ON ff.origin_airport_id = origin_airport.airport_id
        LEFT JOIN dim_airport dest_airport
            ON ff.dest_airport_id = dest_airport.airport_id
        WHERE {' AND '.join(where_clauses)}
        GROUP BY dc.carrier_name
        HAVING COUNT(*) > 0
        ORDER BY {ALLOWED_METRICS[selected_metric]} DESC
        '''
    )

    return query, params, selected_metric, selected_table_view


def _build_heatmap_query(filters: AnalysisQueryRequest, selected_metric: str):
    where_clauses, params = _build_filter_clauses(filters)
    heatmap_where_clauses = list(where_clauses)
    heatmap_params = dict(params)
    x_expression = "COALESCE(origin_airport.airport, 'Unknown')"
    y_expression = "COALESCE(ddt.delay_type_name, 'Unknown')"
    value_expression = (
        'COUNT(DISTINCT ff.flight_id)'
        if selected_metric == 'total_flights'
        else 'ROUND(AVG(ff.arr_delay)::numeric, 2)'
    )

    if filters.airports:
        # Keep table filters broad (origin OR destination) but constrain heatmap columns to selected airports.
        heatmap_where_clauses.append('origin_airport.airport = ANY(:heatmap_airports)')
        heatmap_params['heatmap_airports'] = filters.airports

    if filters.delay_types:
        # Constrain heatmap rows to only the delay types selected by the user.
        heatmap_where_clauses.append('ddt.delay_type_name = ANY(:heatmap_delay_types)')
        heatmap_params['heatmap_delay_types'] = filters.delay_types

    query = text(
        f'''
        SELECT
            {x_expression} AS x,
            {y_expression} AS y,
            {value_expression} AS value
        FROM fact_flight ff
        JOIN dim_carrier dc
            ON ff.mkt_carrier_airline_id = dc.airline_id
        JOIN dim_date dd
            ON ff.date_id = dd.date_id
        LEFT JOIN dim_airport origin_airport
            ON ff.origin_airport_id = origin_airport.airport_id
        LEFT JOIN dim_airport dest_airport
            ON ff.dest_airport_id = dest_airport.airport_id
        LEFT JOIN fact_flight_delay ffd
            ON ff.flight_id = ffd.flight_id
        LEFT JOIN dim_delay_type ddt
            ON ffd.delay_type_id = ddt.delay_type_id
        WHERE {' AND '.join(heatmap_where_clauses)}
        GROUP BY {x_expression}, {y_expression}
        ORDER BY {x_expression}, {y_expression}
        '''
    )

    return query, heatmap_params


@router.get('/analysis/filters/airlines')
def list_airline_filters(q: str = Query(default='', max_length=100)):
    search_term = q.strip()
    query = text(
        '''
        SELECT DISTINCT dc.carrier_name AS value
        FROM dim_carrier dc
        WHERE dc.carrier_name IS NOT NULL
          AND (:search_term = '' OR dc.carrier_name ILIKE :search_pattern)
        ORDER BY dc.carrier_name
        '''
    )
    params = {
        'search_term': search_term,
        'search_pattern': f'%{search_term}%',
    }

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    return [row['value'] for row in rows if row.get('value')]


@router.get('/analysis/filters/airports')
def list_airport_filters(q: str = Query(default='', max_length=100)):
    search_term = q.strip()
    query = text(
        '''
        SELECT DISTINCT
            da.airport AS value,
            CASE
                WHEN COALESCE(da.display_airport_name, '') = '' THEN da.airport
                ELSE da.airport || ' - ' || da.display_airport_name
            END AS label
        FROM dim_airport da
        WHERE da.airport IS NOT NULL
          AND (
            :search_term = ''
            OR da.airport ILIKE :search_pattern
            OR da.display_airport_name ILIKE :search_pattern
            OR da.display_airport_city_name_full ILIKE :search_pattern
          )
        ORDER BY da.airport
        '''
    )
    params = {
        'search_term': search_term,
        'search_pattern': f'%{search_term}%',
    }

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    return [dict(row) for row in rows]


@router.get('/analysis/filters/delay-types')
def list_delay_type_filters():
    query = text(
        '''
        SELECT DISTINCT ddt.delay_type_name AS value
        FROM dim_delay_type ddt
        WHERE ddt.delay_type_name IS NOT NULL
        ORDER BY ddt.delay_type_name
        '''
    )

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return [row['value'] for row in rows if row.get('value')]

@router.get("/avg-arr-delay-by-carrier")
def avg_arr_delay_by_carrier():
    query = text("""
        SELECT
            dc.carrier_name,
            ROUND(AVG(ff.arr_delay)::numeric, 2) AS avg_arr_delay,
            COUNT(*) AS total_flights
        FROM fact_flight ff
        JOIN dim_carrier dc
            ON ff.mkt_carrier_airline_id = dc.airline_id
        WHERE ff.arr_delay IS NOT NULL
        GROUP BY dc.carrier_name
        HAVING COUNT(*) > 100
        ORDER BY avg_arr_delay DESC
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return [dict(row) for row in rows]


@router.get('/analysis/dashboard')
def analysis_dashboard(limit_airports: int = 15, limit_routes: int = 10):
    # Runs Stage 3 Q2 (busiest airports, UNION) and Stage 3 Q3 (top routes by delay type,
    # 4-way JOIN + subquery) inside a single REPEATABLE READ transaction so both panels
    # read from the same snapshot. Also appends one row to query_log.
    q_busiest_airports = text(
        '''
        (SELECT a.airport,
                a.display_airport_name,
                COUNT(*) AS flight_count,
                'Origin' AS role
           FROM fact_flight f
           JOIN dim_airport a ON f.origin_airport_id = a.airport_id
          GROUP BY a.airport, a.display_airport_name
          ORDER BY flight_count DESC
          LIMIT :limit_airports)
        UNION
        (SELECT a.airport,
                a.display_airport_name,
                COUNT(*) AS flight_count,
                'Destination' AS role
           FROM fact_flight f
           JOIN dim_airport a ON f.dest_airport_id = a.airport_id
          GROUP BY a.airport, a.display_airport_name
          ORDER BY flight_count DESC
          LIMIT :limit_airports)
        '''
    )

    q_top_routes_by_delay = text(
        '''
        SELECT origin.airport AS origin_code,
               dest.airport   AS dest_code,
               dt.delay_type_name,
               ROUND(SUM(fd.delay_minutes)::numeric, 2) AS total_delay_minutes,
               COUNT(*)       AS delay_occurrences
          FROM fact_flight_delay fd
          JOIN fact_flight f     ON fd.flight_id      = f.flight_id
          JOIN dim_airport origin ON f.origin_airport_id = origin.airport_id
          JOIN dim_airport dest   ON f.dest_airport_id   = dest.airport_id
          JOIN dim_delay_type dt  ON fd.delay_type_id    = dt.delay_type_id
         WHERE (f.origin_airport_id, f.dest_airport_id) IN (
             SELECT origin_airport_id, dest_airport_id
               FROM fact_flight
              WHERE arr_del15 = TRUE
              GROUP BY origin_airport_id, dest_airport_id
              ORDER BY COUNT(*) DESC
              LIMIT :limit_routes
         )
         GROUP BY origin.airport, dest.airport, dt.delay_type_name
         ORDER BY total_delay_minutes DESC
         LIMIT 15
        '''
    )

    conn = engine.connect().execution_options(isolation_level='REPEATABLE READ')
    try:
        with conn.begin():
            busy_rows  = conn.execute(q_busiest_airports, {'limit_airports': limit_airports}).mappings().all()
            route_rows = conn.execute(q_top_routes_by_delay, {'limit_routes': limit_routes}).mappings().all()
            conn.execute(
                text('INSERT INTO query_log (row_count, heatmap_count) VALUES (:r, :h)'),
                {'r': len(busy_rows), 'h': len(route_rows)},
            )
    finally:
        conn.close()

    return {
        'busiest_airports': [dict(r) for r in busy_rows],
        'top_routes_by_delay': [dict(r) for r in route_rows],
    }


@router.get('/analysis/carriers-above-average')
def carriers_above_average(min_flights: int = 100, limit: int = 15):
    # Thin wrapper over the sp_carriers_above_average stored procedure.
    # All advanced-query logic (JOIN + GROUP BY + HAVING + scalar subquery,
    # plus an eligibility precondition and IF control flow) lives in the proc.
    query = text("SELECT * FROM sp_carriers_above_average(:min_flights, :limit)")
    with engine.connect() as conn:
        rows = conn.execute(query, {"min_flights": min_flights, "limit": limit}).mappings().all()
    return [dict(r) for r in rows]


@router.post('/analysis/query')
def analysis_query(payload: AnalysisQueryRequest):
    query, params, selected_metric, selected_table_view = _build_query(payload)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    table_data = [dict(row) for row in rows]

    heatmap_query, heatmap_params = _build_heatmap_query(payload, selected_metric)

    with engine.connect() as conn:
        heatmap_rows = conn.execute(heatmap_query, heatmap_params).mappings().all()

    heatmap_data = [dict(row) for row in heatmap_rows]

    return {
        'filters_applied': payload.model_dump(),
        'summary': {
            'metric': selected_metric,
            'table_view': selected_table_view,
            'row_count': len(table_data),
            'heatmap_point_count': len(heatmap_data),
        },
        'table_data': table_data,
        'heatmap_data': heatmap_data,
    }