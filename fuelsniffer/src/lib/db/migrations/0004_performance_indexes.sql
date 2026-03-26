-- Migration 0004: Performance indexes for all-of-QLD scale (~1800 stations)
-- Run AFTER removing the ingest-time radius filter (B1).

-- Composite index for the DISTINCT ON (station_id) query in getLatestPrices
-- Covers: WHERE fuel_type_id = X ORDER BY station_id, recorded_at DESC
CREATE INDEX IF NOT EXISTS idx_price_readings_station_fuel_recorded
ON price_readings (station_id, fuel_type_id, recorded_at DESC);

-- Index for station lat/lng filtering (Haversine WHERE clause)
CREATE INDEX IF NOT EXISTS idx_stations_lat_lng
ON stations (latitude, longitude);

-- Index for postcode search (/api/search?q=4810)
CREATE INDEX IF NOT EXISTS idx_stations_postcode
ON stations (postcode);
