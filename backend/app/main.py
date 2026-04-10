from fastapi import FastAPI
from sqlalchemy import text
from app.db import engine
from app.routes.analysis import router as analysis_router

app = FastAPI()

app.include_router(analysis_router)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/db-health")
def db_health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"database": "connected"}