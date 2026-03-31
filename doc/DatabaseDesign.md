# Database Design

## DDL Commands

```sql
CREATE DATABASE IF NOT EXISTS flights;
USE flights;

-- 1. dim_wac
CREATE TABLE dim_wac (
    wac INT PRIMARY KEY,
    wac_name VARCHAR(100),
    world_area_name VARCHAR(200),
    country_short_name VARCHAR(100),
    country_code_iso VARCHAR(10),
    state_code VARCHAR(10),
    state_name VARCHAR(100),
    state_fips VARCHAR(10),
    is_latest INT
);

-- 2. dim_date
CREATE TABLE dim_date (
    date_id INT PRIMARY KEY,
    full_date DATE,
    year INT,
    quarter INT,
    month INT,
    day_of_month INT,
    day_of_week INT
);

-- 3. dim_airport
CREATE TABLE dim_airport (
    airport_id INT PRIMARY KEY,
    airport VARCHAR(10),
    display_airport_name VARCHAR(200),
    display_airport_city_name_full VARCHAR(200),
    airport_state_code VARCHAR(10),
    airport_state_name VARCHAR(100),
    airport_state_fips VARCHAR(10),
    airport_country_name VARCHAR(100),
    airport_country_code_iso VARCHAR(10),
    airport_wac INT,
    latitude DECIMAL(10,6),
    longitude DECIMAL(10,6),
    airport_is_latest INT,
    FOREIGN KEY (airport_wac) REFERENCES dim_wac(wac)
);

-- 4. dim_carrier
CREATE TABLE dim_carrier (
    airline_id INT PRIMARY KEY,
    carrier VARCHAR(10),
    carrier_name VARCHAR(200),
    unique_carrier VARCHAR(20),
    unique_carrier_name VARCHAR(200),
    wac INT,
    carrier_group VARCHAR(50),
    region VARCHAR(50),
    FOREIGN KEY (wac) REFERENCES dim_wac(wac)
);

-- 5. dim_delay_type
CREATE TABLE dim_delay_type (
    delay_type_id INT PRIMARY KEY,
    delay_type_name VARCHAR(50)
);

-- 6. fact_flight
CREATE TABLE fact_flight (
    flight_id BIGINT PRIMARY KEY,
    date_id INT,
    mkt_carrier_airline_id INT,
    mkt_carrier_fl_num INT,
    origin_airport_id INT,
    dest_airport_id INT,
    origin_wac INT,
    dest_wac INT,
    dep_delay DECIMAL(8,2),
    arr_delay DECIMAL(8,2),
    arr_del15 INT,
    cancelled INT,
    diverted INT,
    air_time DECIMAL(8,2),
    distance DECIMAL(8,2),
    FOREIGN KEY (date_id) REFERENCES dim_date(date_id),
    FOREIGN KEY (mkt_carrier_airline_id) REFERENCES dim_carrier(airline_id),
    FOREIGN KEY (origin_airport_id) REFERENCES dim_airport(airport_id),
    FOREIGN KEY (dest_airport_id) REFERENCES dim_airport(airport_id),
    FOREIGN KEY (origin_wac) REFERENCES dim_wac(wac),
    FOREIGN KEY (dest_wac) REFERENCES dim_wac(wac)
);

-- 7. fact_flight_delay
CREATE TABLE fact_flight_delay (
    flight_id BIGINT,
    delay_type_id INT,
    delay_minutes DECIMAL(10,2),
    PRIMARY KEY (flight_id, delay_type_id),
    FOREIGN KEY (flight_id) REFERENCES fact_flight(flight_id),
    FOREIGN KEY (delay_type_id) REFERENCES dim_delay_type(delay_type_id),
    CHECK (delay_minutes > 0)
);

-- 8. saved_preset
CREATE TABLE saved_preset (
    preset_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    preset_name VARCHAR(200),
    filters_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Advanced Queries

### Query 1: Top 15 carriers by average arrival delay, only for carriers with above-average delay

**Concepts:** JOIN + GROUP BY + Subquery

```sql
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
ORDER BY avg_arr_delay DESC
LIMIT 15;
```

### Query 2: Airports that are top-15 busiest as either origin or destination

**Concepts:** JOIN + GROUP BY + SET Operator (UNION)

```sql
(SELECT a.airport, a.display_airport_name,
        COUNT(*) AS flight_count, 'Origin' AS role
 FROM fact_flight f
 JOIN dim_airport a ON f.origin_airport_id = a.airport_id
 GROUP BY a.airport, a.display_airport_name
 ORDER BY flight_count DESC
 LIMIT 15)
UNION
(SELECT a.airport, a.display_airport_name,
        COUNT(*) AS flight_count, 'Destination' AS role
 FROM fact_flight f
 JOIN dim_airport a ON f.dest_airport_id = a.airport_id
 GROUP BY a.airport, a.display_airport_name
 ORDER BY flight_count DESC
 LIMIT 15);
```

### Query 3: Top 15 routes by total delay minutes broken down by delay type

**Concepts:** JOIN (4 relations) + GROUP BY + Subquery

```sql
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
ORDER BY total_delay_minutes DESC
LIMIT 15;
```
