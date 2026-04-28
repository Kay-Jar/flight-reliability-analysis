from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, text
from app.db import engine

router = APIRouter()


class AnalysisQueryRequest(BaseModel):
    airlines: list[str] = Field(default_factory=list)
    op_airlines: list[str] = Field(default_factory=list)
    airports: list[str] = Field(default_factory=list)
    delay_types: list[str] = Field(default_factory=list)
    metric: str = 'avg_arr_delay'
    table_view: str = 'carrier_summary'


ALLOWED_METRICS = {
    'avg_arr_delay': 'ROUND(AVG(ff.arr_delay), 2)',
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
    bindparams: list = []

    if filters.airlines:
        where_clauses.append('dc.carrier_name IN :airlines')
        params['airlines'] = filters.airlines
        bindparams.append(bindparam('airlines', expanding=True))

    if filters.op_airlines:
        # Subquery rather than a join so this works for every caller of _build_filter_clauses
        # (carrier_summary, raw_flights, and heatmap queries) without forcing a new join.
        where_clauses.append(
            'ff.op_carrier_airline_id IN ('
            'SELECT airline_id FROM dim_carrier WHERE carrier_name IN :op_airlines'
            ')'
        )
        params['op_airlines'] = filters.op_airlines
        bindparams.append(bindparam('op_airlines', expanding=True))

    if filters.airports:
        # Airport filters intentionally match flights where the selected airport is either origin or destination.
        where_clauses.append('(origin_airport.airport IN :airports OR dest_airport.airport IN :airports)')
        params['airports'] = filters.airports
        bindparams.append(bindparam('airports', expanding=True))

    if filters.delay_types:
        where_clauses.append(
            '''EXISTS (
                SELECT 1
                FROM fact_flight_delay ffd
                JOIN dim_delay_type ddt ON ddt.delay_type_id = ffd.delay_type_id
                WHERE ffd.flight_id = ff.flight_id
                  AND ddt.delay_type_name IN :delay_types
            )'''
        )
        params['delay_types'] = filters.delay_types
        bindparams.append(bindparam('delay_types', expanding=True))

    return where_clauses, params, bindparams


def _build_query(filters: AnalysisQueryRequest):
    selected_metric = filters.metric if filters.metric in ALLOWED_METRICS else 'avg_arr_delay'
    selected_table_view = _normalize_table_view(filters.table_view)

    select_columns = [
        'dc.carrier_name AS carrier_name',
        'ROUND(AVG(ff.arr_delay), 2) AS avg_arr_delay',
        'COUNT(*) AS total_flights',
    ]

    where_clauses, params, bindparams = _build_filter_clauses(filters)

    if selected_table_view == 'raw_flights':
        raw_query = text(
            f'''
            SELECT
                ff.flight_id AS flight_id,
                dd.full_date AS full_date,
                dc.carrier_name AS carrier_name,
                op_dc.carrier_name AS op_carrier_name,
                ff.branded_code_share AS branded_code_share,
                origin_airport.airport AS origin_airport,
                dest_airport.airport AS destination_airport,
                ff.arr_delay AS arr_delay,
                ff.dep_delay AS dep_delay,
                ff.distance AS distance,
                ff.air_time AS air_time
            FROM fact_flight ff
            JOIN dim_carrier dc
                ON ff.mkt_carrier_airline_id = dc.airline_id
            LEFT JOIN dim_carrier op_dc
                ON ff.op_carrier_airline_id = op_dc.airline_id
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
        if bindparams:
            raw_query = raw_query.bindparams(*bindparams)

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
    if bindparams:
        query = query.bindparams(*bindparams)

    return query, params, selected_metric, selected_table_view


def _build_heatmap_query(filters: AnalysisQueryRequest, selected_metric: str):
    where_clauses, params, bindparams = _build_filter_clauses(filters)
    heatmap_where_clauses = list(where_clauses)
    heatmap_params = dict(params)
    heatmap_bindparams = list(bindparams)
    x_expression = "COALESCE(origin_airport.airport, 'Unknown')"
    y_expression = "COALESCE(ddt.delay_type_name, 'Unknown')"
    value_expression = (
        'COUNT(DISTINCT ff.flight_id)'
        if selected_metric == 'total_flights'
        else 'ROUND(AVG(ff.arr_delay), 2)'
    )

    if filters.airports:
        # Keep table filters broad (origin OR destination) but constrain heatmap columns to selected airports.
        heatmap_where_clauses.append('origin_airport.airport IN :heatmap_airports')
        heatmap_params['heatmap_airports'] = filters.airports
        heatmap_bindparams.append(bindparam('heatmap_airports', expanding=True))

    if filters.delay_types:
        # Constrain heatmap rows to only the delay types selected by the user.
        heatmap_where_clauses.append('ddt.delay_type_name IN :heatmap_delay_types')
        heatmap_params['heatmap_delay_types'] = filters.delay_types
        heatmap_bindparams.append(bindparam('heatmap_delay_types', expanding=True))

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
    if heatmap_bindparams:
        query = query.bindparams(*heatmap_bindparams)

    return query, heatmap_params


@router.get('/analysis/filters/airlines')
def list_airline_filters(q: str = Query(default='', max_length=100)):
    search_term = q.strip()
    query = text(
        '''
        SELECT DISTINCT dc.carrier_name AS value
        FROM dim_carrier dc
        WHERE dc.carrier_name IS NOT NULL
          AND (:search_term = '' OR dc.carrier_name LIKE :search_pattern)
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


@router.get('/analysis/filters/op-airlines')
def list_op_airline_filters(q: str = Query(default='', max_length=100)):
    # Constrained via EXISTS to carriers that actually appear as operators in fact_flight,
    # so the dropdown can't surface dead-end picks (the Mall Airways problem in reverse).
    search_term = q.strip()
    query = text(
        '''
        SELECT DISTINCT dc.carrier_name AS value
        FROM dim_carrier dc
        WHERE dc.carrier_name IS NOT NULL
          AND (:search_term = '' OR dc.carrier_name LIKE :search_pattern)
          AND EXISTS (
            SELECT 1 FROM fact_flight ff WHERE ff.op_carrier_airline_id = dc.airline_id
          )
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
                ELSE CONCAT(da.airport, ' - ', da.display_airport_name)
            END AS label
        FROM dim_airport da
        WHERE da.airport IS NOT NULL
          AND (
            :search_term = ''
            OR da.airport LIKE :search_pattern
            OR da.display_airport_name LIKE :search_pattern
            OR da.display_airport_city_name_full LIKE :search_pattern
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
            ROUND(AVG(ff.arr_delay), 2) AS avg_arr_delay,
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
    # Stage 3 Q2 / Q3 live as stored procedures in db/init/004_procedures.sql
    # (sp_busiest_airports, sp_top_delay_routes).
    conn = engine.connect().execution_options(isolation_level='REPEATABLE READ')
    try:
        with conn.begin():
            busy_all = conn.execute(text('CALL sp_busiest_airports()')).mappings().all()
            route_rows = conn.execute(text('CALL sp_top_delay_routes()')).mappings().all()

            # SP returns Origin and Destination interleaved; take top-N per role.
            origins = sorted(
                (dict(r) for r in busy_all if r['role'] == 'Origin'),
                key=lambda r: r['flight_count'], reverse=True,
            )[:limit_airports]
            dests = sorted(
                (dict(r) for r in busy_all if r['role'] == 'Destination'),
                key=lambda r: r['flight_count'], reverse=True,
            )[:limit_airports]
            busiest = origins + dests

            # Retoractively apply LIMIT 15 in Python (so we don't flood the output page)
            top_routes = [dict(r) for r in route_rows][:15]

            conn.execute(
                text('INSERT INTO query_log (row_count, heatmap_count) VALUES (:r, :h)'),
                {'r': len(busiest), 'h': len(top_routes)},
            )
    finally:
        conn.close()

    return {
        'busiest_airports': busiest,
        'top_routes_by_delay': top_routes,
    }


@router.get('/analysis/carriers-above-average')
def carriers_above_average(min_flights: int = 100, limit: int = 15):
    # Stage 3 Q1 lives in the sp_carriers_above_avg_delay stored procedure
    # (db/init/004_procedures.sql)
    # LIMIT 15 retroactively applied (still, there are not even 15 results from this sp regardless)
    with engine.connect() as conn:
        rows = conn.execute(text('CALL sp_carriers_above_avg_delay()')).mappings().all()
    filtered = [dict(r) for r in rows if (r['total_flights'] or 0) >= min_flights]
    return filtered[:limit]


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
