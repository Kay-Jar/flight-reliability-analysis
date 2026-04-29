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
    op_carrier_airline_id INT,
    branded_code_share VARCHAR(32),
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
    FOREIGN KEY (op_carrier_airline_id) REFERENCES dim_carrier(airline_id),
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