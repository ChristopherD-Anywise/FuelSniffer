-- Migration 0000: Core table DDL
-- Run BEFORE 0001_hypertable.sql and 0002_cagg.sql
-- Drizzle Kit cannot generate TimescaleDB DDL — these are manually maintained.

CREATE TABLE IF NOT EXISTS stations (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  brand         TEXT,
  address       TEXT,
  suburb        TEXT,
  postcode      TEXT,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_readings (
  recorded_at    TIMESTAMPTZ NOT NULL,
  station_id     INTEGER NOT NULL REFERENCES stations(id),
  fuel_type_id   INTEGER NOT NULL,
  price_cents    NUMERIC(6,1) NOT NULL,
  source_ts      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS scrape_health (
  id              SERIAL PRIMARY KEY,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prices_upserted INTEGER NOT NULL,
  duration_ms     INTEGER NOT NULL,
  error           TEXT
);
