import os
import pandas as pd
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/flights"
)

engine = create_engine(DATABASE_URL)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA2_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "DataSet", "Data2"))

TABLE_CONFIG = {
    "dim_wac": {
        "file": "dim_wac.csv",
        "columns": [
            "wac",
            "wac_name",
            "world_area_name",
            "country_short_name",
            "country_code_iso",
            "state_code",
            "state_name",
            "state_fips",
            "is_latest",
        ],
    },
    "dim_date": {
        "file": "dim_date.csv",
        "columns": [
            "date_id",
            "full_date",
            "year",
            "quarter",
            "month",
            "day_of_month",
            "day_of_week",
        ],
    },
    "dim_airport": {
        "file": "dim_airport.csv",
        "columns": [
            "airport_id",
            "airport",
            "display_airport_name",
            "display_airport_city_name_full",
            "airport_state_code",
            "airport_state_name",
            "airport_state_fips",
            "airport_country_name",
            "airport_country_code_iso",
            "airport_wac",
            "latitude",
            "longitude",
            "airport_is_latest",
        ],
    },
    "dim_carrier": {
        "file": "dim_carrier.csv",
        "columns": [
            "airline_id",
            "carrier",
            "carrier_name",
            "unique_carrier",
            "unique_carrier_name",
            "wac",
            "carrier_group",
            "region",
        ],
    },
    "dim_delay_type": {
        "file": "dim_delay_type.csv",
        "columns": [
            "delay_type_id",
            "delay_type_name",
        ],
    },
}


def load_table(table_name: str, config: dict) -> None:
    file_path = os.path.join(DATA2_PATH, config["file"])
    print(f"Loading {config['file']} -> {table_name}")

    df = pd.read_csv(file_path, header=None)
    df.columns = config["columns"]

    #Patch the missing dimension values that other tables depend on
    #Fairly certain similair issue Noah ran into with GCP in MySQL
    if table_name == "dim_wac":
        carrier_path = os.path.join(DATA2_PATH, "dim_carrier.csv")
        carrier_df = pd.read_csv(carrier_path, header=None)
        carrier_wacs = set(carrier_df[5].dropna().astype(int))

        existing_wacs = set(df["wac"].dropna().astype(int))
        missing_wacs = carrier_wacs - existing_wacs

        if missing_wacs:
            print(f"Adding missing WACs: {missing_wacs}")

            extra_wac = pd.DataFrame([
                {
                    "wac": w,
                    "wac_name": f"Unknown ({w})",
                    "world_area_name": None,
                    "country_short_name": None,
                    "country_code_iso": None,
                    "state_code": None,
                    "state_name": None,
                    "state_fips": None,
                    "is_latest": True,
                }
                for w in missing_wacs
            ])

            df = pd.concat([df, extra_wac], ignore_index=True)

        df = df.drop_duplicates(subset=["wac"])

    #Type cleanup necessary!
    if "is_latest" in df.columns:
        df["is_latest"] = df["is_latest"].fillna(0).astype(int).astype(bool)

    if "airport_is_latest" in df.columns:
        df["airport_is_latest"] = df["airport_is_latest"].fillna(0).astype(int).astype(bool)

    if "full_date" in df.columns:
        df["full_date"] = pd.to_datetime(df["full_date"]).dt.date

    #Wipe table before reload
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))

    df.to_sql(table_name, engine, if_exists="append", index=False)
    print(f"Loaded {len(df)} rows into {table_name}")

if __name__ == "__main__":
    for table_name, config in TABLE_CONFIG.items():
        load_table(table_name, config)

    print("Done loading dimension tables!")