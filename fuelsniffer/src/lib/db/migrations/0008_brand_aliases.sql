-- Migration 0008: Brand aliases lookup table
-- Used for future DB-backed brand normalisation if the in-code aliases
-- prove insufficient. For V1, normalisation is in-code; this table is
-- available for ad-hoc query tooling and future extension.
CREATE TABLE IF NOT EXISTS brand_aliases (
  id          SERIAL PRIMARY KEY,
  raw_brand   TEXT NOT NULL,
  canonical   TEXT NOT NULL,
  UNIQUE(raw_brand)
);

-- Seed with the top 20 known aliases
INSERT INTO brand_aliases (raw_brand, canonical) VALUES
  ('7-ELEVEN', '7-Eleven'),
  ('7 Eleven', '7-Eleven'),
  ('7eleven', '7-Eleven'),
  ('SHELL', 'Shell'),
  ('COLES EXPRESS', 'Shell Coles Express'),
  ('AMPOL', 'Ampol'),
  ('CALTEX', 'Ampol'),
  ('BP', 'BP'),
  ('UNITED', 'United'),
  ('UNITED PETROLEUM', 'United'),
  ('PUMA', 'Puma'),
  ('PUMA ENERGY', 'Puma'),
  ('LIBERTY', 'Liberty'),
  ('LIBERTY OIL', 'Liberty'),
  ('METRO', 'Metro'),
  ('METRO PETROLEUM', 'Metro'),
  ('WOOLWORTHS', 'Woolworths'),
  ('EG AUSTRALIA', 'Woolworths'),
  ('COSTCO', 'Costco'),
  ('FREEDOM FUELS', 'Freedom')
ON CONFLICT (raw_brand) DO NOTHING;
