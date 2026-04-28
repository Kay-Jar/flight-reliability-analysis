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
