from fastapi import APIRouter
from sqlalchemy import text
from app.db import engine

router = APIRouter()

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