-- Migration 0017: Per-provider scrape_health tracking
-- Adds 'provider' column so each provider's health is independently observable.
-- Existing rows are backfilled to 'qld' (the only provider pre-SP-1).
--
-- Rollback: ALTER TABLE scrape_health DROP COLUMN provider;
--           DROP INDEX IF EXISTS scrape_health_provider_idx;

ALTER TABLE scrape_health ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'qld';

-- Backfill existing rows (DEFAULT 'qld' covers this, but be explicit)
UPDATE scrape_health SET provider = 'qld' WHERE provider IS NULL;

-- Index for per-provider health queries ordered by time
CREATE INDEX IF NOT EXISTS scrape_health_provider_idx
  ON scrape_health (provider, scraped_at DESC);
