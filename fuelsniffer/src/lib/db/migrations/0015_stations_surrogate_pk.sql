-- Migration 0015: Surrogate BIGSERIAL PK on stations
-- DISRUPTIVE — requires brief maintenance window (approx 30–60s on small dataset).
-- Resolves station ID space collision between QLD (integer SiteId) and other states.
-- After this migration: stations.id is a synthetic BIGSERIAL; upstream IDs are in external_id.
-- The existing unique (source_provider, external_id) index from 0007 is preserved.
--
-- PREREQUISITES:
--   1. Run pg_dump backup and confirm it completed successfully.
--   2. Schedule during 02:00 Brisbane maintenance window.
--   3. Verify station + price_readings row counts before and after.
--
-- ROLLBACK: Restore from pg_dump snapshot taken before this migration.
-- Manual rollback (no snapshot) is complex — see docs.

-- Step 1: Add new surrogate id column (BIGSERIAL auto-populates)
ALTER TABLE stations ADD COLUMN IF NOT EXISTS id_new BIGSERIAL;

-- Step 2: Drop the old PK constraint (keeps the column)
ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_pkey;

-- Step 3: Add new PK on the surrogate column
ALTER TABLE stations ADD PRIMARY KEY (id_new);

-- Step 4: Ensure unique constraint on (source_provider, external_id) exists as a named constraint
-- (0007 created an index; we need the constraint form for FK references)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stations_provider_external_id_uniq' AND contype = 'u'
  ) THEN
    ALTER TABLE stations ADD CONSTRAINT stations_provider_external_id_uniq
      UNIQUE (source_provider, external_id);
  END IF;
END $$;

-- Step 5: Add temp BIGINT column on price_readings for the new FK value
ALTER TABLE price_readings ADD COLUMN IF NOT EXISTS station_id_new BIGINT;

-- Step 6: Populate station_id_new by joining stations via (source_provider, external_id)
-- For QLD: source_provider='qld', external_id = old station_id::text
UPDATE price_readings pr
SET station_id_new = s.id_new
FROM stations s
WHERE s.source_provider = pr.source_provider
  AND s.external_id = pr.station_id::text;

-- Step 7: Set NOT NULL on the new FK column (all rows should have been matched)
ALTER TABLE price_readings ALTER COLUMN station_id_new SET NOT NULL;

-- Step 8: Drop the old FK constraint on price_readings
ALTER TABLE price_readings DROP CONSTRAINT IF EXISTS price_readings_station_id_fkey;

-- Step 9: Drop the old station_id column and rename the new one
ALTER TABLE price_readings DROP COLUMN station_id;
ALTER TABLE price_readings RENAME COLUMN station_id_new TO station_id;

-- Step 10: Rename stations surrogate column to id
ALTER TABLE stations DROP COLUMN id;
ALTER TABLE stations RENAME COLUMN id_new TO id;

-- Step 11: Re-add FK on price_readings pointing at new surrogate id
ALTER TABLE price_readings ADD CONSTRAINT price_readings_station_id_fkey
  FOREIGN KEY (station_id) REFERENCES stations(id);

-- Step 12: Transfer sequence ownership
ALTER SEQUENCE IF EXISTS stations_id_new_seq OWNED BY stations.id;
