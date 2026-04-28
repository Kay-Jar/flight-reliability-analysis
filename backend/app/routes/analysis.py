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
    tiers: list[str] = Field(default_factory=list)
    metric: str = 'avg_arr_delay'
    table_view: str = 'carrier_summary'


VALID_TIERS = {'Excellent', 'Good', 'Average', 'Poor'}


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


def _build_filter_clauses(filters: AnalysisQueryRequest, tier_carriers: list[str] | None = None):
    where_clauses = ['ff.arr_delay IS NOT NULL']
    params: dict[str, object] = {}
    bindparams: list = []

    if filters.tiers and tier_carriers is not None:
        # tier_carriers is the list of carrier_names whose tier matches filters.tiers,
        # resolved by the route via sp_classify_carrier_delay_tiers().
        where_clauses.append('dc.carrier_name IN :tier_carriers')
        params['tier_carriers'] = tier_carriers
        bindparams.append(bindparam('tier_carriers', expanding=True))

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


def _build_query(filters: AnalysisQueryRequest, tier_carriers: list[str] | None = None):
    selected_metric = filters.metric if filters.metric in ALLOWED_METRICS else 'avg_arr_delay'
    selected_table_view = _normalize_table_view(filters.table_view)

    select_columns = [
        'dc.carrier_name AS carrier_name',
        'ROUND(AVG(ff.arr_delay), 2) AS avg_arr_delay',
        'COUNT(*) AS total_flights',
    ]

    where_clauses, params, bindparams = _build_filter_clauses(filters, tier_carriers)

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


def _build_heatmap_query(
    filters: AnalysisQueryRequest,
    selected_metric: str,
    tier_carriers: list[str] | None = None,
):
    where_clauses, params, bindparams = _build_filter_clauses(filters, tier_carriers)
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


def _call_proc(dbapi_conn, sql: str) -> list[dict]:
    # CALL leaves a trailing OK/status packet on the wire that pymysql doesn't
    # auto-consume; the next query on this connection then fails with
    # "Commands out of sync". Drop to the raw cursor so we can call .nextset()
    # until it returns None, draining everything the proc emitted.
    with dbapi_conn.cursor() as cursor:
        cursor.execute(sql)
        cols = [d[0] for d in cursor.description] if cursor.description else []
        rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
        while cursor.nextset():
            pass
    return rows


@router.get('/analysis/dashboard')
def analysis_dashboard(limit_airports: int = 15, limit_routes: int = 10):
    # Stage 3 Q2 / Q3 live as stored procedures in db/init/004_procedures.sql
    # (sp_busiest_airports, sp_top_delay_routes). Both CALLs run inside a
    # single REPEATABLE READ transaction so both panels share a snapshot, and
    # one row is appended to query_log on success.
    conn = engine.connect().execution_options(isolation_level='REPEATABLE READ')
    try:
        with conn.begin():
            dbapi_conn = conn.connection
            busy_all = _call_proc(dbapi_conn, 'CALL sp_busiest_airports()')
            route_rows = _call_proc(dbapi_conn, 'CALL sp_top_delay_routes()')

            # SP returns Origin and Destination interleaved; take top-N per role.
            origins = sorted(
                (r for r in busy_all if r['role'] == 'Origin'),
                key=lambda r: r['flight_count'], reverse=True,
            )[:limit_airports]
            dests = sorted(
                (r for r in busy_all if r['role'] == 'Destination'),
                key=lambda r: r['flight_count'], reverse=True,
            )[:limit_airports]
            busiest = origins + dests

            # Retroactively apply LIMIT 15 in Python (so we don't flood the output page)
            top_routes = route_rows[:15]

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
        rows = _call_proc(conn.connection, 'CALL sp_carriers_above_avg_delay()')
    filtered = [r for r in rows if (r['total_flights'] or 0) >= min_flights]
    return filtered[:limit]


@router.get('/analysis/carrier-tiers')
def carrier_tiers():
    # Q4 lives in the sp_classify_carrier_delay_tiers stored procedure
    # (db/init/004_procedures.sql). Cursor + IF/ELSEIF buckets carriers into
    # Excellent/Good/Average/Poor relative to the global avg arrival delay.
    with engine.connect() as conn:
        return _call_proc(conn.connection, 'CALL sp_classify_carrier_delay_tiers()')


def _resolve_tier_carriers(requested_tiers: list[str]) -> list[str]:
    valid = [t for t in requested_tiers if t in VALID_TIERS]
    if not valid:
        return []
    with engine.connect() as conn:
        rows = _call_proc(conn.connection, 'CALL sp_classify_carrier_delay_tiers()')
    return [r['carrier_name'] for r in rows if r['tier'] in valid]


def _empty_query_response(payload: AnalysisQueryRequest) -> dict:
    selected_metric = payload.metric if payload.metric in ALLOWED_METRICS else 'avg_arr_delay'
    return {
        'filters_applied': payload.model_dump(),
        'summary': {
            'metric': selected_metric,
            'table_view': _normalize_table_view(payload.table_view),
            'row_count': 0,
            'heatmap_point_count': 0,
        },
        'table_data': [],
        'heatmap_data': [],
    }


@router.post('/analysis/query')
def analysis_query(payload: AnalysisQueryRequest):
    tier_carriers: list[str] | None = None
    if payload.tiers:
        tier_carriers = _resolve_tier_carriers(payload.tiers)
        if not tier_carriers:
            # Tiers requested but no carriers fall into them — short-circuit empty.
            return _empty_query_response(payload)

    query, params, selected_metric, selected_table_view = _build_query(payload, tier_carriers)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    table_data = [dict(row) for row in rows]

    heatmap_query, heatmap_params = _build_heatmap_query(payload, selected_metric, tier_carriers)

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
