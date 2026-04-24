-- Migration 0019: SP-6 True-Cost Prices — unknown_brand_log telemetry table
--
-- Lightweight upsert log for brand strings that didn't match any alias.
-- Queried weekly by curators to add missing aliases to brand-aliases.json.
-- No user data; purely a curation tool.
-- count is incremented on each miss; last_seen_at updated each time.

CREATE TABLE IF NOT EXISTS unknown_brand_log (
  raw_brand    TEXT         PRIMARY KEY,
  count        BIGINT       NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
