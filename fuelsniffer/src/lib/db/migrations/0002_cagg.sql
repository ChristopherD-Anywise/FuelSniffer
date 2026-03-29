-- Migration 0002: Composite index + hourly materialized view + daily materialized view
-- Replaces TimescaleDB hypertable, continuous aggregates, and retention policies.
-- D-04 (locked): raw rows retained for 7 days — enforced by nightly cleanup in scheduler.
-- D-05 (locked): hourly rollup via standard materialized view, refreshed hourly.

-- Composite index: station + fuel type + time (DESC) — optimises dashboard queries.
-- Previously created in 0001_hypertable.sql; moved here after removing hypertable.
CREATE INDEX IF NOT EXISTS price_readings_station_fuel_time
  ON price_readings (station_id, fuel_type_id, recorded_at DESC);

-- Hourly rollup: pre-aggregated averages per station+fuel+hour.
-- Refreshed hourly by the scheduler (src/lib/scraper/scheduler.ts).
-- CONCURRENT refresh requires a unique index and allows queries during refresh.
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_prices AS
SELECT
  station_id,
  fuel_type_id,
  DATE_TRUNC('hour', recorded_at) AS bucket,
  AVG(price_cents)::NUMERIC(6,1)  AS avg_price_cents,
  MIN(price_cents)                AS min_price_cents,
  MAX(price_cents)                AS max_price_cents
FROM price_readings
GROUP BY station_id, fuel_type_id, DATE_TRUNC('hour', recorded_at);

CREATE UNIQUE INDEX IF NOT EXISTS hourly_prices_pk
  ON hourly_prices (station_id, fuel_type_id, bucket);

-- Daily rollup: pre-aggregated min/max per station+fuel+day, kept forever.
-- Refreshed nightly by the scheduler BEFORE raw rows are deleted (src/lib/scraper/scheduler.ts).
-- Built from price_readings directly so it captures each day before raw data expires.
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_prices AS
SELECT
  station_id,
  fuel_type_id,
  DATE_TRUNC('day', recorded_at)  AS day_bucket,
  AVG(price_cents)::NUMERIC(6,1)  AS avg_price_cents,
  MIN(price_cents)                AS min_price_cents,
  MAX(price_cents)                AS max_price_cents
FROM price_readings
GROUP BY station_id, fuel_type_id, DATE_TRUNC('day', recorded_at);

CREATE UNIQUE INDEX IF NOT EXISTS daily_prices_pk
  ON daily_prices (station_id, fuel_type_id, day_bucket);
