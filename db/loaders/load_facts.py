import os
import pandas as pd
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/flights"
)

engine = create_engine(DATABASE_URL)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA1_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "DataSet", "Data1"))

FACT_CONFIG = {
    "fact_flight": {
        "file": "fact_flight.csv",
        "columns": [
            "flight_id",
            "date_id",
            "mkt_carrier_airline_id",
            "mkt_carrier_fl_num",
            "origin_airport_id",
            "dest_airport_id",
            "origin_wac",
            "dest_wac",
            "dep_delay",
            "arr_delay",
            "arr_del15",
            "cancelled",
            "diverted",
            "air_time",
            "distance",
        ],
    },
    "fact_flight_delay": {
        "file": "fact_flight_delay.csv",
        "columns": [
            "flight_id",
            "delay_type_id",
            "delay_minutes",
        ],
    },
}


def load_table(table_name: str, config: dict) -> None:
    file_path = os.path.join(DATA1_PATH, config["file"])
    print(f"Loading {config['file']} -> {table_name}")

    df = pd.read_csv(file_path, header=None)
    df.columns = config["columns"]

    if "arr_del15" in df.columns:
        df["arr_del15"] = df["arr_del15"].fillna(0).astype(int).astype(bool)

    if "cancelled" in df.columns:
        df["cancelled"] = df["cancelled"].fillna(0).astype(int).astype(bool)

    if "diverted" in df.columns:
        df["diverted"] = df["diverted"].fillna(0).astype(int).astype(bool)

    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))

    df.to_sql(table_name, engine, if_exists="append", index=False, chunksize=5000)
    print(f"Loaded {len(df)} rows into {table_name}")


if __name__ == "__main__":
    load_table("fact_flight", FACT_CONFIG["fact_flight"])
    load_table("fact_flight_delay", FACT_CONFIG["fact_flight_delay"])
    print("Done loading fact tables.")