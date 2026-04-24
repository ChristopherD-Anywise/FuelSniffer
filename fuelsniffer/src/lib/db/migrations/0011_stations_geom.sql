-- Migration 0011: Add PostGIS geometry column to stations
-- Enables spatial queries (ST_DWithin) for trip corridor search.
-- Backfills from existing latitude/longitude columns.
-- NOTE: PostGIS convention is MakePoint(longitude, latitude) — lng first!

ALTER TABLE stations ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

UPDATE stations
  SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  WHERE geom IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS stations_geom_gist ON stations USING GIST (geom);
