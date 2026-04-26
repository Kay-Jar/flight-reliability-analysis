CREATE TABLE dim_wac 
(
    wac INT PRIMARY KEY,
    wac_name VARCHAR(100),
    world_area_name VARCHAR(200),
    country_short_name VARCHAR(100),
    country_code_iso VARCHAR(10),
    state_code VARCHAR(10),
    state_name VARCHAR(100),
    state_fips VARCHAR(10),
    is_latest BOOLEAN
);

CREATE TABLE dim_date (
    date_id INT PRIMARY KEY,
    full_date DATE,
    year INT,
    quarter INT,
    month INT,
    day_of_month INT,
    day_of_week INT
);

CREATE TABLE dim_airport 
(
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
    latitude NUMERIC(10,6),
    longitude NUMERIC(10,6),
    airport_is_latest BOOLEAN,
    CONSTRAINT fk_airport_wac
        FOREIGN KEY (airport_wac) REFERENCES dim_wac(wac)
);

CREATE TABLE dim_carrier 
(
    airline_id INT PRIMARY KEY,
    carrier VARCHAR(10),
    carrier_name VARCHAR(200),
    unique_carrier VARCHAR(20),
    unique_carrier_name VARCHAR(200),
    wac INT,
    carrier_group VARCHAR(50),
    region VARCHAR(50),
    CONSTRAINT fk_carrier_wac
        FOREIGN KEY (wac) REFERENCES dim_wac(wac)
);

CREATE TABLE dim_delay_type 
(
    delay_type_id INT PRIMARY KEY,
    delay_type_name VARCHAR(50)
);

CREATE TABLE fact_flight
(
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
    dep_delay NUMERIC(8,2),
    arr_delay NUMERIC(8,2),
    arr_del15 BOOLEAN,
    cancelled BOOLEAN,
    diverted BOOLEAN,
    air_time NUMERIC(8,2),
    distance NUMERIC(8,2),
    CONSTRAINT fk_flight_date
        FOREIGN KEY (date_id) REFERENCES dim_date(date_id),
    CONSTRAINT fk_flight_carrier
        FOREIGN KEY (mkt_carrier_airline_id) REFERENCES dim_carrier(airline_id),
    CONSTRAINT fk_flight_op_carrier
        FOREIGN KEY (op_carrier_airline_id) REFERENCES dim_carrier(airline_id),
    CONSTRAINT fk_flight_origin_airport
        FOREIGN KEY (origin_airport_id) REFERENCES dim_airport(airport_id),
    CONSTRAINT fk_flight_dest_airport
        FOREIGN KEY (dest_airport_id) REFERENCES dim_airport(airport_id),
    CONSTRAINT fk_flight_origin_wac
        FOREIGN KEY (origin_wac) REFERENCES dim_wac(wac),
    CONSTRAINT fk_flight_dest_wac
        FOREIGN KEY (dest_wac) REFERENCES dim_wac(wac),
    CONSTRAINT chk_flight_distance_nonneg
        CHECK (distance IS NULL OR distance >= 0),
    CONSTRAINT chk_flight_air_time_nonneg
        CHECK (air_time IS NULL OR air_time >= 0)
);

CREATE TABLE fact_flight_delay 
(
    flight_id BIGINT,
    delay_type_id INT,
    delay_minutes NUMERIC(10,2),
    PRIMARY KEY (flight_id, delay_type_id),
    CONSTRAINT fk_flight_delay_flight
        FOREIGN KEY (flight_id) REFERENCES fact_flight(flight_id),
    CONSTRAINT fk_flight_delay_type
        FOREIGN KEY (delay_type_id) REFERENCES dim_delay_type(delay_type_id),
    CONSTRAINT chk_delay_minutes_positive
        CHECK (delay_minutes > 0)
);

CREATE TABLE saved_preset
(
    preset_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    preset_name VARCHAR(200) NOT NULL,
    filters_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_preset_name_nonblank
        CHECK (char_length(btrim(preset_name)) > 0),
    CONSTRAINT chk_preset_filters_nonblank
        CHECK (char_length(btrim(filters_json)) > 0)
);

-- Support table for the transaction in /analysis/query.
-- The transaction will INSERT one row per successful run.
CREATE TABLE query_log
(
    query_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ran_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_count INT NOT NULL,
    heatmap_count INT NOT NULL
);