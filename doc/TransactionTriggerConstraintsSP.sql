-- Trigger: Used on update of a saved preset to check if the
-- updated filters are the same (if so, we don't update the "updated at" timestamp)
CREATE TRIGGER trg_saved_preset_touch
BEFORE UPDATE ON saved_preset
FOR EACH ROW
SET NEW.updated_at = IF(
    NEW.preset_name <=> OLD.preset_name
        AND NEW.filters_json <=> OLD.filters_json,
    OLD.updated_at,
    NEW.updated_at
);

-- Stage 3 Query 1: carriers whose avg arr_delay exceeds the overall avg.
CREATE PROCEDURE sp_carriers_above_avg_delay()
SELECT c.carrier, c.carrier_name,
       COUNT(*) AS total_flights,
       ROUND(AVG(f.arr_delay), 2) AS avg_arr_delay
FROM fact_flight f
JOIN dim_carrier c ON f.mkt_carrier_airline_id = c.airline_id
WHERE f.arr_delay IS NOT NULL
GROUP BY c.carrier, c.carrier_name
HAVING AVG(f.arr_delay) > (
    SELECT AVG(arr_delay) FROM fact_flight WHERE arr_delay IS NOT NULL
)
ORDER BY avg_arr_delay DESC;

-- Stage 3 Query 2: airports busiest as either origin or destination.
CREATE PROCEDURE sp_busiest_airports()
(SELECT a.airport, a.display_airport_name,
        COUNT(*) AS flight_count, 'Origin' AS role
 FROM fact_flight f
 JOIN dim_airport a ON f.origin_airport_id = a.airport_id
 GROUP BY a.airport, a.display_airport_name
 ORDER BY flight_count DESC)
UNION
(SELECT a.airport, a.display_airport_name,
        COUNT(*) AS flight_count, 'Destination' AS role
 FROM fact_flight f
 JOIN dim_airport a ON f.dest_airport_id = a.airport_id
 GROUP BY a.airport, a.display_airport_name
 ORDER BY flight_count DESC);

-- Stage 3 Query 3: top routes by total delay minutes broken down by delay type.
CREATE PROCEDURE sp_top_delay_routes()
SELECT origin.airport AS origin_code,
       dest.airport AS dest_code,
       dt.delay_type_name,
       ROUND(SUM(fd.delay_minutes), 2) AS total_delay_minutes,
       COUNT(*) AS delay_occurrences
FROM fact_flight_delay fd
JOIN fact_flight f ON fd.flight_id = f.flight_id
JOIN dim_airport origin ON f.origin_airport_id = origin.airport_id
JOIN dim_airport dest ON f.dest_airport_id = dest.airport_id
JOIN dim_delay_type dt ON fd.delay_type_id = dt.delay_type_id
WHERE (f.origin_airport_id, f.dest_airport_id) IN (
    SELECT sub.origin_airport_id, sub.dest_airport_id
    FROM (
        SELECT origin_airport_id, dest_airport_id,
               COUNT(*) AS delay_count
        FROM fact_flight
        WHERE arr_del15 = 1
        GROUP BY origin_airport_id, dest_airport_id
        ORDER BY delay_count DESC
        LIMIT 10
    ) sub
)
GROUP BY origin.airport, dest.airport, dt.delay_type_name
ORDER BY total_delay_minutes DESC;

-- Query 4: classify carriers into delay tiers using a cursor + IF/ELSEIF.
DELIMITER //
CREATE PROCEDURE sp_classify_carrier_delay_tiers()
BEGIN
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_carrier VARCHAR(10);
    DECLARE v_carrier_name VARCHAR(200);
    DECLARE v_total_flights INT;
    DECLARE v_avg_delay DECIMAL(10,2);
    DECLARE v_overall_avg DECIMAL(10,2);
    DECLARE v_tier VARCHAR(20);

    DECLARE cur_carriers CURSOR FOR
        SELECT c.carrier,
               c.carrier_name,
               COUNT(*) AS total_flights,
               ROUND(AVG(f.arr_delay), 2) AS avg_arr_delay
        FROM fact_flight f
        JOIN dim_carrier c ON f.mkt_carrier_airline_id = c.airline_id
        WHERE f.arr_delay IS NOT NULL
        GROUP BY c.carrier, c.carrier_name
        HAVING COUNT(*) > 100;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    SELECT AVG(arr_delay) INTO v_overall_avg
    FROM fact_flight WHERE arr_delay IS NOT NULL;

    DROP TEMPORARY TABLE IF EXISTS tmp_carrier_tiers;
    CREATE TEMPORARY TABLE tmp_carrier_tiers (
        carrier VARCHAR(10),
        carrier_name VARCHAR(200),
        total_flights INT,
        avg_arr_delay DECIMAL(10,2),
        tier VARCHAR(20)
    );

    OPEN cur_carriers;
    read_loop: LOOP
        FETCH cur_carriers INTO v_carrier, v_carrier_name, v_total_flights, v_avg_delay;
        IF v_done = 1 THEN
            LEAVE read_loop;
        END IF;

        IF v_avg_delay < v_overall_avg - 5 THEN
            SET v_tier = 'Excellent';
        ELSEIF v_avg_delay < v_overall_avg THEN
            SET v_tier = 'Good';
        ELSEIF v_avg_delay < v_overall_avg + 5 THEN
            SET v_tier = 'Average';
        ELSE
            SET v_tier = 'Poor';
        END IF;

        INSERT INTO tmp_carrier_tiers
        VALUES (v_carrier, v_carrier_name, v_total_flights, v_avg_delay, v_tier);
    END LOOP;
    CLOSE cur_carriers;

    SELECT carrier, carrier_name, total_flights, avg_arr_delay, tier,
           ROUND(avg_arr_delay - v_overall_avg, 2) AS delay_vs_overall
    FROM tmp_carrier_tiers
    ORDER BY FIELD(tier, 'Poor', 'Average', 'Good', 'Excellent'),
             avg_arr_delay DESC;

    DROP TEMPORARY TABLE IF EXISTS tmp_carrier_tiers;
END //
DELIMITER ;

-- Transaction: dashboard "Load Snapshot" (Stage 3 Q2 + Q3 in one snapshot).
-- Issued by the GET /analysis/dashboard endpoint in backend/app/routes/analysis.py.
-- The endpoint binds a single connection, sets REPEATABLE READ, runs both
-- advanced reads (sp_busiest_airports, sp_top_delay_routes) so they share an
-- InnoDB consistent snapshot, appends one audit row to query_log, and commits.
-- If either CALL fails the INSERT is never reached and the transaction rolls
-- back, so query_log only ever reflects fully-successful dashboard loads.
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

CALL sp_busiest_airports();
CALL sp_top_delay_routes();

INSERT INTO query_log (row_count, heatmap_count)
VALUES (
    :row_count,
    :heatmap_count
);

COMMIT;
