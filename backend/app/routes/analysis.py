from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from app.db import engine

router = APIRouter()


class AnalysisQueryRequest(BaseModel):
    airlines: list[str] = Field(default_factory=list)
    airports: list[str] = Field(default_factory=list)
    delay_types: list[str] = Field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None
    metric: str = 'avg_arr_delay'
    view: str = 'carrier'


ALLOWED_METRICS = {
    'avg_arr_delay': 'ROUND(AVG(ff.arr_delay)::numeric, 2)',
    'total_flights': 'COUNT(*)',
}

ALLOWED_VIEWS = {
    'carrier': 'dc.carrier_name',
}


def _build_query(filters: AnalysisQueryRequest):
    selected_metric = filters.metric if filters.metric in ALLOWED_METRICS else 'avg_arr_delay'
    selected_view = filters.view if filters.view in ALLOWED_VIEWS else 'carrier'

    select_columns = [
        'dc.carrier_name AS carrier_name',
        'ROUND(AVG(ff.arr_delay)::numeric, 2) AS avg_arr_delay',
        'COUNT(*) AS total_flights',
    ]

    where_clauses = ['ff.arr_delay IS NOT NULL']
    params: dict[str, object] = {}

    if filters.airlines:
        where_clauses.append('dc.carrier_name = ANY(:airlines)')
        params['airlines'] = filters.airlines

    if filters.airports:
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

    if filters.start_date is not None:
        where_clauses.append('dd.full_date >= :start_date')
        params['start_date'] = filters.start_date

    if filters.end_date is not None:
        where_clauses.append('dd.full_date <= :end_date')
        params['end_date'] = filters.end_date

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
        LIMIT 20
        '''
    )

    return query, params, selected_metric, selected_view

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
        LIMIT 20
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return [dict(row) for row in rows]


@router.post('/analysis/query')
def analysis_query(payload: AnalysisQueryRequest):
    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(status_code=400, detail='start_date must be on or before end_date')

    query, params, selected_metric, selected_view = _build_query(payload)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    table_data = [dict(row) for row in rows]

    return {
        'filters_applied': payload.model_dump(),
        'summary': {
            'metric': selected_metric,
            'view': selected_view,
            'row_count': len(table_data),
        },
        'table_data': table_data,
        'heatmap_data': [],
    }