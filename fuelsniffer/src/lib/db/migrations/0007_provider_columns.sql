-- Migration 0007: Provider abstraction columns
ALTER TABLE stations ADD COLUMN IF NOT EXISTS external_id VARCHAR(64);
ALTER TABLE stations ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16);
ALTER TABLE price_readings ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16);

UPDATE stations SET external_id = id::text WHERE external_id IS NULL;
UPDATE stations SET source_provider = 'qld' WHERE source_provider IS NULL;
UPDATE price_readings SET source_provider = 'qld' WHERE source_provider IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'external_id' AND is_nullable = 'YES') THEN
    ALTER TABLE stations ALTER COLUMN external_id SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'source_provider' AND is_nullable = 'YES') THEN
    ALTER TABLE stations ALTER COLUMN source_provider SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_readings' AND column_name = 'source_provider' AND is_nullable = 'YES') THEN
    ALTER TABLE price_readings ALTER COLUMN source_provider SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stations_provider_external_id_uniq ON stations (source_provider, external_id);
CREATE SEQUENCE IF NOT EXISTS stations_nsw_id_seq START 10000000;
