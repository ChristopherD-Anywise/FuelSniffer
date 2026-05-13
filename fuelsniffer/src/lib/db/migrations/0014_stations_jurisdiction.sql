-- Migration 0014: Jurisdiction columns on stations
-- Adds state, region, jurisdiction, timezone, source_metadata.
-- Safe online migration — columns are nullable or have defaults.
-- Rollback: ALTER TABLE stations DROP COLUMN state, region, jurisdiction, timezone, source_metadata;

ALTER TABLE stations ADD COLUMN IF NOT EXISTS state          VARCHAR(3)   NOT NULL DEFAULT 'QLD';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS region         TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS jurisdiction   TEXT         NOT NULL DEFAULT 'AU-QLD';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS timezone       TEXT         NOT NULL DEFAULT 'Australia/Brisbane';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- Backfill existing QLD rows (default already covers this but be explicit)
UPDATE stations
SET
  state        = 'QLD',
  jurisdiction = 'AU-QLD',
  timezone     = 'Australia/Brisbane'
WHERE source_provider = 'qld';

-- Index for state-based filtering (SP-3 will use this)
CREATE INDEX IF NOT EXISTS stations_state_idx ON stations (state);
CREATE INDEX IF NOT EXISTS stations_jurisdiction_idx ON stations (jurisdiction);
