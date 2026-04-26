-- Runs after 001_schema.sql and 002_functions.sql.
CREATE INDEX IF NOT EXISTS idx_q1_arrdelay_carrier
    ON fact_flight (arr_delay, mkt_carrier_airline_id);
CREATE INDEX IF NOT EXISTS idx_q2_dest_origin
    ON fact_flight (dest_airport_id, origin_airport_id);
CREATE INDEX IF NOT EXISTS idx_q3_origin_dest_del15
    ON fact_flight (origin_airport_id, dest_airport_id, arr_del15);
