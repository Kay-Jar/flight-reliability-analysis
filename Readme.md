# Flight Reliability Analysis Platform

Full-stack data analytics platform for exploring U.S. flight delay patterns, built on the official Bureau of Transportation Statistics datasets (590K+ flight records, 2018–2025).

The application lets users filter flights by airline, airport, and delay type, run dynamic analytical queries against a star-schema database, and explore the results through tables and heatmap visualizations. Analyses can be saved as named presets with full CRUD support.

## Live Demo

| Before Filter | After Filter |
|--------------|-------------|
| ![Before Filter](images/PreFilter.PNG) | ![After Filter](images/PostFilter.PNG) |

## Repository structure

```text
.
├── docker-compose.yml
├── backend
│   ├── requirements.txt
│   └── app
│       ├── main.py            # FastAPI app, CORS, health endpoints
│       ├── db.py              # SQLAlchemy engine / DB URL builder
│       └── routes
│           ├── analysis.py    # filters, dashboard, dynamic query endpoints
│           └── presets.py     # saved-preset CRUD
├── frontend                   # React (CoreUI Admin Template, Vite)
├── db
│   ├── init
│   │   ├── 001_schema.sql     # star schema (dims + facts)
│   │   ├── 002_functions.sql  # functions + preset trigger
│   │   ├── 003_indexes.sql
│   │   └── 004_procedures.sql # analytical stored procedures
│   └── loaders
│       ├── load_dimensions.py
│       └── load_facts.py
├── DataSet                    # raw BTS / TranStats source data
├── DataSet2                   # cleaned dim_*/fact_* CSVs
├── doc                        # proposal, DB design, stage reports
└── setup.md
```

## What it does

- Filters flights by marketing airline, operating airline, airport, and delay type
- Builds and executes dynamic SQL from user-selected criteria (`POST /analysis/query`) with whitelisted metrics and table views — no raw SQL from the client
- Aggregates metrics such as average arrival delay and total flights
- Classifies carriers into performance tiers (Excellent / Good / Average / Poor) via a stored procedure
- Saves, lists, updates, and deletes named analysis presets stored as JSON
- Renders results as interactive heatmaps and summary tables

## Architecture

- **Frontend**: React (CoreUI Free Admin Template, Vite), served on port `3000`
- **Backend**: FastAPI + SQLAlchemy, served with uvicorn on port `8011`
- **Database**: MySQL (Cloud SQL in deployment, Dockerized locally)

The frontend talks to the backend through `API_BASE_URL` (see `frontend/src/config/api`). The backend builds parameterized queries with SQLAlchemy `text()` + `bindparam` against a star schema.

## Data model

Star schema defined in `db/init/001_schema.sql`:

- **Fact tables**: `fact_flight`, `fact_flight_delay`
- **Dimension tables**: `dim_carrier`, `dim_airport`, `dim_date`, `dim_delay_type`, `dim_wac`

Source data comes from the BTS On-Time Marketing dataset and TranStats support tables (carrier decode, airport coordinates, world area codes). Cleaned CSVs ready for loading live in `DataSet2/`.

## Setup

### 1. Start the database (make sure Docker is running)

```bash
docker compose up -d
```

### 2. Load data (ORDER MATTERS!!)

> You must load **dimension tables BEFORE fact tables.**
> Loading facts first will result in **data loss due to cascading deletes** (learned that the hard way).

```bash
python db/loaders/load_dimensions.py
python db/loaders/load_facts.py
```

### 3. Start the backend

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8011
```

Port `8011` matches the frontend `API_BASE_URL` configuration — changing one means changing both.

### 4. Start the frontend (from a new terminal)

```bash
cd frontend
npm install
npm start
```

Then open:

```
http://localhost:3000
```

## Environment variables

`backend/app/db.py` builds the connection string from:

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | — | Full SQLAlchemy URL; overrides everything below if set |
| `DB_HOST` | `localhost` | |
| `DB_PORT` | `3306` | MySQL |
| `DB_NAME` | `flights` | |
| `DB_USER` | `root` | |
| `DB_PASSWORD` | (empty) | |

The engine is created with `pool_pre_ping=True` so stale Cloud SQL connections are recycled automatically.

## API reference

### Health

```
GET  /health              -> {"status": "ok"}
GET  /db-health           -> {"database": "connected"}
```

### Filters (populate the sidebar dropdowns)

```
GET  /analysis/filters/airlines
GET  /analysis/filters/op-airlines
GET  /analysis/filters/airports
GET  /analysis/filters/delay-types
```

### Analysis

```
GET  /avg-arr-delay-by-carrier
GET  /analysis/dashboard
GET  /analysis/carriers-above-average
GET  /analysis/carrier-tiers
POST /analysis/query      # dynamic query from filter selections
```

`POST /analysis/query` accepts airlines, op_airlines, airports, delay_types, tiers, a metric (`avg_arr_delay` | `total_flights`), and a table view (`carrier_summary` | `raw_flights`). Metrics and views are validated against server-side whitelists before any SQL is built.

### Presets (CRUD)

```
GET    /presets
POST   /presets
PUT    /presets/{preset_id}
DELETE /presets/{preset_id}
```

## Advanced SQL

Defined in `db/init/` and documented in `doc/TransactionTriggerConstraintsSP.sql`:

- **Stored procedures**: `sp_carriers_above_avg_delay()`, `sp_busiest_airports()`, `sp_top_delay_routes()`, `sp_classify_carrier_delay_tiers()`
- **Trigger**: `trg_saved_preset_touch` — bumps `saved_preset.updated_at` on update, but only when the preset's name or filters actually changed (uses null-safe `<=>` comparison so no-op saves don't touch the timestamp)
- **Indexes**: `003_indexes.sql` covers the common fact-table filter paths

## Deployment

Cloud deployments ran on GCP with Cloud SQL (MySQL) from the `deploy/gcp-mysql-v2` branch. Local development uses the Dockerized database plus the two dev servers


## Development Notes

- The project was originally built using PostgreSQL for local development  
- The deployed system was adapted to MySQL for Cloud SQL compatibility  
- Some SQL queries differ between PostgreSQL and MySQL implementations  
- CORS is configured for cross-origin communication between frontend and backend  
- Cloud deployment uses persistent processes managed via `screen`
- Generative AI was used to aid with frontend development


## Release and Submission

- Each stage submission is tagged as `stage.x`  
- Submissions are tied to specific commit hashes  
- Releases represent frozen versions of the project for evaluation  


## Troubleshooting (common issues we ran into as a team)

### Data loads but queries return nothing / rows disappeared

Check the load order!!! Facts reference dimensions with cascading deletes, so loading facts first silently destroys them. Re-run `load_dimensions.py` then `load_facts.py`.

### Frontend shows empty dropdowns

The frontend expects the backend on port `8011` (see the CORS allowlist in `backend/app/main.py`, which permits localhost ports 3000–3002). If uvicorn is running on a different port, update `API_BASE_URL` in the frontend config!!


## References

- CoreUI React Admin Template ([GitHub](https://github.com/coreui/coreui-free-react-admin-template))  
- Plotly Heatmaps ([Docs](https://plotly.com/python/heatmaps/))  


## License

This project is released under the MIT License.  
CoreUI template is also licensed under MIT.



