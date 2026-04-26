import glob
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


# Source-column -> destination-column mapping for fact_flight.
# Sourced from the raw T_ONTIME_MARKETING zip (not the hand-trimmed fact_flight.csv)
# so we can pick up operating-carrier columns the trimmed file dropped.
FLIGHT_COLUMN_MAP = {
    "FL_DATE": "fl_date",
    "MKT_CARRIER_AIRLINE_ID": "mkt_carrier_airline_id",
    "MKT_CARRIER_FL_NUM": "mkt_carrier_fl_num",
    "OP_CARRIER_AIRLINE_ID": "op_carrier_airline_id",
    "BRANDED_CODE_SHARE": "branded_code_share",
    "ORIGIN_AIRPORT_ID": "origin_airport_id",
    "DEST_AIRPORT_ID": "dest_airport_id",
    "ORIGIN_WAC": "origin_wac",
    "DEST_WAC": "dest_wac",
    "DEP_DELAY": "dep_delay",
    "ARR_DELAY": "arr_delay",
    "ARR_DEL15": "arr_del15",
    "CANCELLED": "cancelled",
    "DIVERTED": "diverted",
    "AIR_TIME": "air_time",
    "DISTANCE": "distance",
}


def _find_marketing_zip() -> str:
    matches = sorted(glob.glob(os.path.join(DATA1_PATH, "T_ONTIME_MARKETING_*.zip")))
    if not matches:
        raise FileNotFoundError(f"No T_ONTIME_MARKETING_*.zip under {DATA1_PATH}")
    return matches[-1]


def _patch_orphan_op_carriers(op_carrier_ids: set[int]) -> None:
    # Mirrors the ghost-WAC pattern in load_dimensions.py: any OP carrier id referenced
    # by fact_flight that's missing from dim_carrier would FK-violate, so we insert a
    # placeholder dim_carrier row before loading facts.
    if not op_carrier_ids:
        return

    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT airline_id FROM dim_carrier WHERE airline_id = ANY(:ids)"),
            {"ids": list(op_carrier_ids)},
        ).scalars().all()
        missing = sorted(op_carrier_ids - set(existing))

        if not missing:
            return

        print(f"Adding placeholder dim_carrier rows for orphan op carriers: {missing}")
        conn.execute(
            text(
                """
                INSERT INTO dim_carrier (airline_id, carrier_name)
                SELECT airline_id, 'Unknown (' || airline_id || ')' AS carrier_name
                FROM unnest(CAST(:ids AS INT[])) AS airline_id
                """
            ),
            {"ids": missing},
        )


def load_fact_flight() -> None:
    zip_path = _find_marketing_zip()
    print(f"Loading {os.path.basename(zip_path)} -> fact_flight")

    df = pd.read_csv(
        zip_path,
        compression="zip",
        usecols=list(FLIGHT_COLUMN_MAP.keys()),
        dtype={"BRANDED_CODE_SHARE": "string"},
    )
    df = df.rename(columns=FLIGHT_COLUMN_MAP)

    # flight_id is synthesized 1..N to match the existing fact_flight_delay.flight_id values,
    # which were generated from this same source file in source order.
    df.insert(0, "flight_id", range(1, len(df) + 1))

    fl_date = pd.to_datetime(df["fl_date"], errors="coerce")
    df.insert(1, "date_id", fl_date.dt.strftime("%Y%m%d").astype("Int64"))
    df = df.drop(columns=["fl_date"])

    for col in ("arr_del15", "cancelled", "diverted"):
        df[col] = df[col].fillna(0).astype(int).astype(bool)

    df["op_carrier_airline_id"] = df["op_carrier_airline_id"].astype("Int64")

    op_ids = set(df["op_carrier_airline_id"].dropna().astype(int).tolist())
    _patch_orphan_op_carriers(op_ids)

    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE fact_flight RESTART IDENTITY CASCADE"))

    df.to_sql("fact_flight", engine, if_exists="append", index=False, chunksize=5000)
    print(f"Loaded {len(df)} rows into fact_flight")


def load_fact_flight_delay() -> None:
    file_path = os.path.join(DATA1_PATH, "fact_flight_delay.csv")
    print(f"Loading fact_flight_delay.csv -> fact_flight_delay")
    df = pd.read_csv(
        file_path,
        header=None,
        names=["flight_id", "delay_type_id", "delay_minutes"],
    )
    df.to_sql("fact_flight_delay", engine, if_exists="append", index=False, chunksize=5000)
    print(f"Loaded {len(df)} rows into fact_flight_delay")


if __name__ == "__main__":
    load_fact_flight()
    load_fact_flight_delay()
    print("Done loading fact tables.")
