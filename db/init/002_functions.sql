
-- Runs after 001_schema.sql
-- TRIGGER: auto-touch saved_preset.updated_at only when content actually changes.
-- Event: BEFORE UPDATE on saved_preset
-- Condition: IF preset_name or filters_json differs from the old row
-- Action: update NEW.updated_at to NOW()
CREATE OR REPLACE FUNCTION fn_saved_preset_touch() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.preset_name  IS DISTINCT FROM OLD.preset_name
    OR NEW.filters_json IS DISTINCT FROM OLD.filters_json THEN
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_saved_preset_touch ON saved_preset;
CREATE TRIGGER trg_saved_preset_touch
BEFORE UPDATE ON saved_preset
FOR EACH ROW EXECUTE FUNCTION fn_saved_preset_touch();

-- STORED PROCEDURE: sp_carriers_above_average
-- Parametrized form of Stage 3 Query 1.
-- Returns carriers whose average arrival delay exceeds the overall average,
-- restricted to carriers with at least p_min_flights flights, top p_limit rows.
-- Advanced query 1 (precondition count):
-- JOIN + GROUP BY + HAVING in a derived-table subquery.
-- Advanced query 2 (main body, Stage 3 Q1):
-- JOIN + GROUP BY + HAVING + scalar subquery (overall avg arr_delay).
CREATE OR REPLACE FUNCTION sp_carriers_above_average(
    p_min_flights INT DEFAULT 100,
    p_limit       INT DEFAULT 15
) RETURNS TABLE (
    carrier       VARCHAR,
    carrier_name  VARCHAR,
    total_flights BIGINT,
    avg_arr_delay NUMERIC
) AS $$
DECLARE
    v_eligible_carriers INT;
BEGIN
    IF p_min_flights < 0 OR p_limit < 1 THEN
        RAISE EXCEPTION 'min_flights must be >= 0 and limit must be >= 1';
    END IF;

    -- Advanced query 1: how many carriers meet the min-flights threshold?
    SELECT COUNT(*) INTO v_eligible_carriers
    FROM (
        SELECT c.airline_id
        FROM fact_flight f
        JOIN dim_carrier c ON f.mkt_carrier_airline_id = c.airline_id
        WHERE f.arr_delay IS NOT NULL
        GROUP BY c.airline_id
        HAVING COUNT(*) >= p_min_flights
    ) eligible;

    IF v_eligible_carriers = 0 THEN
        RETURN;
    END IF;

    -- Advanced query 2: carriers with above-overall-avg arr_delay
    RETURN QUERY
    SELECT
        c.carrier,
        c.carrier_name,
        COUNT(*)::BIGINT                         AS total_flights,
        ROUND(AVG(f.arr_delay)::NUMERIC, 2)      AS avg_arr_delay
    FROM fact_flight f
    JOIN dim_carrier c ON f.mkt_carrier_airline_id = c.airline_id
    WHERE f.arr_delay IS NOT NULL
    GROUP BY c.carrier, c.carrier_name
    HAVING COUNT(*) >= p_min_flights
       AND AVG(f.arr_delay) > (
           SELECT AVG(arr_delay) FROM fact_flight WHERE arr_delay IS NOT NULL
       )
    ORDER BY avg_arr_delay DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
