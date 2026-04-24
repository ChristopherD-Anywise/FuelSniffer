-- Migration 0012: Route cache for trip planner
-- Caches routing API responses for 24h to avoid redundant Mapbox calls.
-- Cache key is rounded start/end coords + alternatives flag.
CREATE TABLE IF NOT EXISTS route_cache (
  id              BIGSERIAL PRIMARY KEY,
  start_lat_r     NUMERIC(7,4) NOT NULL,  -- rounded to ~100m
  start_lng_r     NUMERIC(8,4) NOT NULL,
  end_lat_r       NUMERIC(7,4) NOT NULL,
  end_lng_r       NUMERIC(8,4) NOT NULL,
  alternatives    BOOLEAN NOT NULL DEFAULT false,
  provider_id     VARCHAR(32) NOT NULL DEFAULT 'mapbox',
  response_json   JSONB NOT NULL,
  response_hash   TEXT NOT NULL,           -- SHA-256 for integrity check
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS route_cache_lookup_idx
  ON route_cache (start_lat_r, start_lng_r, end_lat_r, end_lng_r, alternatives, provider_id);

CREATE INDEX IF NOT EXISTS route_cache_expires_idx
  ON route_cache (expires_at);
