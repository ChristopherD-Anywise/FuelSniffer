-- Migration 0001: Convert price_readings to a TimescaleDB hypertable
-- Run AFTER 0000_schema.sql — price_readings table must exist first.
-- Run BEFORE inserting any data — converting a populated table requires extra steps.

SELECT create_hypertable('price_readings', 'recorded_at');

-- Composite index: station + fuel type + time (DESC) — optimises dashboard queries
-- "What is the current price for station X, fuel type Y?"
CREATE INDEX ON price_readings (station_id, fuel_type_id, recorded_at DESC);
