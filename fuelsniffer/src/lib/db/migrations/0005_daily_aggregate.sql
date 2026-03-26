-- Migration 0005: Daily aggregate + hourly retention policy
-- Hierarchical continuous aggregate: daily rollup from hourly_prices
-- Requires TimescaleDB 2.13+ (we have 2.24)
--
-- NOTE: CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous)
-- does not support IF NOT EXISTS. This migration will fail on re-run
-- if daily_prices already exists — that's expected and safe.
--
-- NOTE: CALL refresh_continuous_aggregate() cannot run inside a transaction.
-- The migration runner splits on semicolons and runs each statement outside
-- a transaction, so this works.

CREATE MATERIALIZED VIEW daily_prices
WITH (timescaledb.continuous) AS
SELECT
  station_id,
  fuel_type_id,
  time_bucket('1 day', bucket) AS day_bucket,
  AVG(avg_price_cents)::NUMERIC(6,1) AS avg_price_cents,
  MIN(min_price_cents) AS min_price_cents,
  MAX(max_price_cents) AS max_price_cents
FROM hourly_prices
GROUP BY station_id, fuel_type_id, day_bucket;

SELECT add_continuous_aggregate_policy('daily_prices',
  start_offset => INTERVAL '31 days',
  end_offset   => INTERVAL '0 days',
  schedule_interval => INTERVAL '1 day'
);

-- Backfill all existing hourly data into daily before enabling retention
CALL refresh_continuous_aggregate('daily_prices', NULL, NULL);

-- Retain hourly data for 30 days only (daily_prices preserves older data)
SELECT add_retention_policy('hourly_prices', INTERVAL '30 days');
