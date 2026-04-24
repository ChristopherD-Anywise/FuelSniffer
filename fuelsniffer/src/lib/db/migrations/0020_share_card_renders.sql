-- 0020_share_card_renders.sql
-- SP-8: Cache index for rendered share cards (actual PNG bytes live in CDN).
-- hash is content-addressed: sha256(station_id|fuel_type_id|price_cents|radius_km|variant)
-- No PII — no user FK. Two users sharing the same station+price collapse to one row.

CREATE TABLE IF NOT EXISTS share_card_renders (
  id             BIGSERIAL PRIMARY KEY,
  hash           TEXT        NOT NULL UNIQUE,
  station_id     BIGINT      NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  fuel_type_id   INTEGER     NOT NULL,
  price_cents    INTEGER     NOT NULL,
  radius_km      INTEGER,
  variant        TEXT        NOT NULL DEFAULT 'default',
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_served_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  served_count   INTEGER     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS share_card_renders_station_generated
  ON share_card_renders (station_id, generated_at DESC);
