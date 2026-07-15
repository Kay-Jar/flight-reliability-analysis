# Project Setup Guide

## Run on all platforms using Docker
```bash
git clone https://github.com/cs411-alawini/sp26-cs411-team028-blue.git
cd sp26-cs411-team028-blue
```

## Start database (make sure docker is running)
```bash
docker compose up -d
```

## Load data (ORDER MATTERS!!)
> You must load **dimension tables BEFORE fact tables.**  
> Loading facts first will result in **data loss due to cascading deletes** (learned that the hard way).

```bash
python db/loaders/load_dimensions.py
python db/loaders/load_facts.py
```

## Start backend
```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8011
```

## Start frontend (from a new terminal)
```bash
cd frontend
npm install
npm start
```

## Open in browser
```
http://localhost:3000
```
