CREATE TRIGGER trg_saved_preset_touch
BEFORE UPDATE ON saved_preset
FOR EACH ROW
SET NEW.updated_at = IF(
    NEW.preset_name <=> OLD.preset_name
        AND NEW.filters_json <=> OLD.filters_json,
    OLD.updated_at,
    NEW.updated_at
);
