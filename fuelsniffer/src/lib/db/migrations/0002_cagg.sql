-- Migration 0002: Hourly continuous aggregate + refresh policy + retention policy
-- Run AFTER 0001_hypertable.sql — price_readings must be a hypertable first.
-- D-04 (locked): raw rows retained for 7 days.
-- D-05 (locked): hourly rollup via TimescaleDB cagg.

CREATE MATERIALIZED VIEW hourly_prices
WITH (timescaledb.continuous) AS
SELECT
  station_id,
  fuel_type_id,
  time_bucket('1 hour', recorded_at) AS bucket,
  AVG(price_cents)::NUMERIC(6,1)     AS avg_price_cents,
  MIN(price_cents)                   AS min_price_cents,
  MAX(price_cents)                   AS max_price_cents
FROM price_readings
GROUP BY station_id, fuel_type_id, bucket;

-- Refresh hourly_prices every hour.
-- start_offset=2h: ensures the cagg materialises before the retention policy
-- deletes raw rows (retention policy = 7 days, so this is safe with a 2h start_offset).
SELECT add_continuous_aggregate_policy('hourly_prices',
  start_offset      => INTERVAL '2 hours',
  end_offset        => INTERVAL '0 hours',
  schedule_interval => INTERVAL '1 hour'
);

-- D-04 (LOCKED DECISION): Retain raw 15-minute rows for exactly 7 days.
-- Retrofitting this policy after data accumulates requires dropping and recreating
-- the hypertable — this MUST be set before any data is written.
SELECT add_retention_policy('price_readings', INTERVAL '7 days');
