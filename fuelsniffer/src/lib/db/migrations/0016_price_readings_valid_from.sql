-- Migration 0016: valid_from column on price_readings
-- Enables WA T+1 (day-ahead) pricing semantics.
-- For all non-WA providers: valid_from = recorded_at (no semantic change).
-- For WA: valid_from = upstream "PriceUpdatedFrom" (06:00 WST of effective day).
--
-- Query patterns after this migration:
--   "Current price": WHERE valid_from <= NOW() ORDER BY valid_from DESC LIMIT 1
--   "Announced (tomorrow)": WHERE valid_from > NOW() ORDER BY valid_from ASC LIMIT 1
--
-- Rollback: ALTER TABLE price_readings DROP COLUMN valid_from;
--           DROP INDEX IF EXISTS price_readings_valid_from_idx;

ALTER TABLE price_readings ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;

-- Backfill existing rows: valid_from = recorded_at
UPDATE price_readings SET valid_from = recorded_at WHERE valid_from IS NULL;

-- Set NOT NULL and default after backfill
ALTER TABLE price_readings ALTER COLUMN valid_from SET NOT NULL;
ALTER TABLE price_readings ALTER COLUMN valid_from SET DEFAULT NOW();

-- Index for "current price" and "announced price" queries
CREATE INDEX IF NOT EXISTS price_readings_valid_from_idx
  ON price_readings (station_id, fuel_type_id, valid_from DESC);
