import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.db import engine

router = APIRouter()


class PresetBody(BaseModel):
    preset_name: str
    filters_json: str


def _validate_filters_json(raw: str) -> None:
    try:
        json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="filters_json must be valid JSON")


@router.get("/presets")
def list_presets():
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT preset_id, preset_name, filters_json, created_at, updated_at "
            "FROM saved_preset ORDER BY updated_at DESC"
        )).mappings().all()
    return [dict(r) for r in rows]


@router.post("/presets")
def create_preset(body: PresetBody):
    _validate_filters_json(body.filters_json)

    with engine.connect() as conn:
        row = conn.execute(text(
            "INSERT INTO saved_preset (preset_name, filters_json) "
            "VALUES (:name, :filters) "
            "RETURNING preset_id, preset_name, filters_json, created_at, updated_at"
        ), {"name": body.preset_name, "filters": body.filters_json}).mappings().one()
        conn.commit()
    return dict(row)


@router.put("/presets/{preset_id}")
def update_preset(preset_id: int, body: PresetBody):
    _validate_filters_json(body.filters_json)

    with engine.connect() as conn:
        row = conn.execute(text(
            "UPDATE saved_preset "
            "SET preset_name = :name, filters_json = :filters "
            "WHERE preset_id = :id "
            "RETURNING preset_id, preset_name, filters_json, created_at, updated_at"
        ), {"id": preset_id, "name": body.preset_name, "filters": body.filters_json}).mappings().fetchone()
        conn.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    return dict(row)


@router.delete("/presets/{preset_id}")
def delete_preset(preset_id: int):
    with engine.connect() as conn:
        row = conn.execute(text(
            "DELETE FROM saved_preset WHERE preset_id = :id RETURNING preset_id"
        ), {"id": preset_id}).fetchone()
        conn.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"deleted": True}
