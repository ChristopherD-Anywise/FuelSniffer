# Phase 1 — NSW + Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a fuel-price provider abstraction with QLD refactored into it, NSW FuelCheck added on top, baseline security headers + in-memory rate limiting + Zod input validation, baseline accessibility (contrast + keyboard nav + skip-link), and the waitlist encryption plumbing — all built on a PostGIS-enabled Postgres image.

**Architecture:** Provider registry pattern (`FuelPriceProvider` interface, registered in a central array, scheduler iterates). PostGIS extension installed via image switch. Rate limiting in-process in-memory (single-process Next.js). Migrations remain plain SQL files run in order — the migration runner's hardcoded file list must be updated for every new migration.

**Tech Stack:** Next.js 16, Drizzle ORM, postgres-js, node-cron, Zod, Vitest, axe-core, React Testing Library (new dep), msw (new dep, used in Phase 2 — installed here for shared infra), `postgis/postgis:17-3.4-alpine` Docker image.

---

## Pre-flight: critical context for the executing engineer

**Read these before starting any task:**

1. The migration runner at `fuelsniffer/src/lib/db/migrate.ts` has a **hardcoded file list** on line 36. Adding a migration file is *not enough* — the array literal must also be updated. Every migration ticket below includes this step explicitly.

2. There is **no `_migrations` tracking table**. The runner runs every file every time. All new migrations must be **idempotent** — use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc. Existing migrations follow this pattern; match it.

3. There is **no `npm test` script** in `package.json`. Tests run via `npx vitest run` (one shot) or `npx vitest` (watch mode). Type-check is `npx tsc --noEmit`. The plan uses `npx vitest run path/to/file.test.ts` for targeted runs.

4. The existing scraper has a **hardcoded `isWithinRadius` filter** in `src/lib/scraper/normaliser.ts` rejecting any station >50km from North Lakes (decision D-06). Phase 1 Task 1 explicitly removes this filter — it would silently reject every NSW station otherwise.

5. The existing `stations.id` column is `INTEGER PRIMARY KEY` and the value is the QLD API's `SiteId`. Migration Task 2 introduces `external_id` + `source_provider` and a sequence for collision-safe NSW IDs. **Do not** change `stations.id` to `BIGSERIAL` — `price_readings.station_id` references it and that ripples too far for Phase 1.

6. The Postgres image switch (Task 3) is a real downtime event with a documented dump/restore procedure. **Do not** simply edit `docker-compose.yml` and restart — it will fail with a confusing error about missing PostGIS shared objects.

7. Existing tests live in `fuelsniffer/src/__tests__/`. Match the existing pattern (one file per module, top-level `describe` block, `it` per assertion).

8. Drizzle ORM version is `^0.45.1`. The `db` import is `import { db } from '@/lib/db/client'`. SQL helpers come from `import { sql } from 'drizzle-orm'`. Use these — do not use raw `postgres-js` directly except in the migration runner.

9. The project's working directory for all `npx`/`npm` commands is `fuelsniffer/`, not the repo root. Every command in this plan assumes `cd fuelsniffer` first.

10. **Test discipline (from spec section 1.4):** every ticket lands with backend tests, frontend tests where applicable, and a user acceptance checklist of falsifiable statements. Do not mark a task complete without all three.

---

## File structure overview

New files created in Phase 1:

```
fuelsniffer/
├── docker-compose.yml                          [MODIFIED — image switch]
├── package.json                                [MODIFIED — add devDeps]
├── src/
│   ├── middleware.ts                           [NEW — security headers + rate limit]
│   ├── lib/
│   │   ├── db/
│   │   │   ├── migrate.ts                      [MODIFIED — file list updates]
│   │   │   ├── schema.ts                       [MODIFIED — new columns/tables]
│   │   │   └── migrations/
│   │   │       ├── 0006_enable_postgis.sql     [NEW]
│   │   │       ├── 0007_provider_columns.sql   [NEW]
│   │   │       ├── 0008_brand_aliases.sql      [NEW]
│   │   │       ├── 0009_csp_violations.sql     [NEW]
│   │   │       └── 0010_waitlist_signups.sql   [NEW]
│   │   ├── providers/
│   │   │   └── fuel/
│   │   │       ├── index.ts                    [NEW — interface, types, registry]
│   │   │       ├── brand-normaliser.ts         [NEW]
│   │   │       ├── qld/
│   │   │       │   ├── index.ts                [NEW — QldFuelProvider]
│   │   │       │   ├── client.ts               [MOVED from scraper/client.ts]
│   │   │       │   ├── normaliser.ts           [MOVED from scraper/normaliser.ts]
│   │   │       │   └── ckan-client.ts          [MOVED from scraper/ckan-client.ts]
│   │   │       └── nsw/
│   │   │           ├── index.ts                [NEW — NswFuelProvider]
│   │   │           ├── client.ts               [NEW — FuelCheck OAuth2 client]
│   │   │           └── normaliser.ts           [NEW]
│   │   ├── scraper/
│   │   │   ├── scheduler.ts                    [MODIFIED — loops over registry]
│   │   │   └── writer.ts                       [MODIFIED — provider-aware]
│   │   ├── security/
│   │   │   ├── headers.ts                      [NEW — CSP/HSTS/etc builder]
│   │   │   ├── rate-limit.ts                   [NEW — in-memory token bucket]
│   │   │   └── validation.ts                   [NEW — shared Zod helpers]
│   │   ├── waitlist/
│   │   │   └── encryption.ts                   [NEW — AES-GCM helpers]
│   │   └── a11y/
│   │       └── (nothing new in Phase 1 — empty for now)
│   └── app/
│       ├── layout.tsx                          [MODIFIED — skip-link, lang]
│       ├── globals.css                         [MODIFIED — palette + focus rings]
│       └── api/
│           ├── csp-report/route.ts             [NEW]
│           ├── prices/route.ts                 [MODIFIED — Zod validation]
│           ├── prices/history/route.ts         [MODIFIED — Zod validation]
│           ├── search/route.ts                 [MODIFIED — Zod validation]
│           └── health/route.ts                 [MODIFIED — provider status]
└── src/__tests__/                              [NEW test files for each new module]
```

Files moved (the existing scraper code becomes the QLD provider):

```
src/lib/scraper/client.ts          → src/lib/providers/fuel/qld/client.ts
src/lib/scraper/normaliser.ts      → src/lib/providers/fuel/qld/normaliser.ts
src/lib/scraper/ckan-client.ts     → src/lib/providers/fuel/qld/ckan-client.ts
```

Files that stay where they are:

```
src/lib/scraper/scheduler.ts       (orchestrator — modified, not moved)
src/lib/scraper/writer.ts          (orchestrator — modified, not moved)
```

---

## Task 1: Remove the North Brisbane geographic filter

**Why first:** This is a five-minute change that unblocks every subsequent task. The current `isWithinRadius` check would silently reject every NSW station, so it must die before any provider work.

**Files:**
- Modify: `fuelsniffer/src/lib/scraper/normaliser.ts`
- Modify: `fuelsniffer/src/__tests__/normaliser.test.ts`

- [ ] **Step 1: Read the existing normaliser to confirm what to remove**

Run: `cat fuelsniffer/src/lib/scraper/normaliser.ts | head -90`

Confirm these symbols exist and will be removed:
- `NORTH_LAKES_LAT`, `NORTH_LAKES_LNG`, `MAX_RADIUS_KM` constants
- `haversineDistanceKm()` function
- `isWithinRadius()` function

The `normaliseStation` function does **not** currently call `isWithinRadius` — the filter is applied elsewhere (or has been since dropped from the call path). Verify by searching:

Run: `grep -rn "isWithinRadius" fuelsniffer/src/ --include="*.ts"`

Expected: a small number of references — at minimum the definition in `normaliser.ts` and any call sites.

- [ ] **Step 2: Write the failing test**

Open `fuelsniffer/src/__tests__/normaliser.test.ts`. At the bottom, add:

```typescript
import { describe, it, expect } from 'vitest'
import { normaliseStation } from '@/lib/scraper/normaliser'

describe('normaliseStation: NSW coordinates', () => {
  it('returns a NewStation for a Sydney CBD location (no geographic filter)', () => {
    const sydneySite = {
      SiteId: 9999,
      Name: 'BP Pyrmont',
      Brand: 'BP',
      Address: '1 Pyrmont Bridge Rd, PYRMONT NSW 2009',
      Postcode: '2009',
      Lat: -33.8688,
      Lng: 151.1955,
    }
    const result = normaliseStation(sydneySite)
    expect(result.id).toBe(9999)
    expect(result.latitude).toBe(-33.8688)
    expect(result.longitude).toBe(151.1955)
  })
})
```

- [ ] **Step 3: Run the test to verify it passes (or fails for the right reason)**

Run: `cd fuelsniffer && npx vitest run src/__tests__/normaliser.test.ts`

Expected: PASS for the new test (because `normaliseStation` does not currently call `isWithinRadius` — we are codifying that behaviour). If it fails because `normaliseStation` *does* reject Sydney coords, the call site must be removed before Step 4.

- [ ] **Step 4: Remove the dead code from `normaliser.ts`**

Open `fuelsniffer/src/lib/scraper/normaliser.ts`. Delete:
- The `// ── Geographic filter ─────────` comment block
- The `NORTH_LAKES_LAT`, `NORTH_LAKES_LNG`, `MAX_RADIUS_KM` constants
- The `haversineDistanceKm` function
- The `isWithinRadius` function and its docstring
- Any import that becomes unused as a result

Leave everything else untouched.

- [ ] **Step 5: Remove any callers**

Run: `grep -rn "isWithinRadius\|haversineDistanceKm\|NORTH_LAKES" fuelsniffer/src/ --include="*.ts"`

Expected: no matches. If any remain, remove them.

- [ ] **Step 6: Run all tests and type-check**

Run: `cd fuelsniffer && npx vitest run && npx tsc --noEmit`

Expected: all tests pass, no type errors.

- [ ] **Step 7: User acceptance check**

Manual check (executor or reviewer runs this):
1. Start the dev server: `cd fuelsniffer && npm run dev`
2. Hit `http://localhost:4000/api/health` and confirm 200 OK.
3. Confirm no scraper errors in stdout for at least one scrape cycle (or skip if scraper is not running locally).

- [ ] **Step 8: Commit**

```bash
git add fuelsniffer/src/lib/scraper/normaliser.ts fuelsniffer/src/__tests__/normaliser.test.ts
git commit -m "refactor(scraper): remove North Brisbane geographic filter

D-06 (50km North Lakes radius) was a Brisbane-only artefact. Phase 1 of
the V1 roadmap broadens coverage to NSW + QLD; the filter would silently
reject every NSW station. Removing it. The user-facing distance filter
on the prices query is the only geographic narrowing now.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Migration 0007 — `source_provider` columns and external ID namespacing

**Why this comes before the image switch:** The image switch in Task 3 includes a dump/restore. We want the schema delta committed and *runnable* on the fresh PostGIS-enabled instance, not stuck in a half-migrated state where we have to remember to backfill manually.

**Files:**
- Create: `fuelsniffer/src/lib/db/migrations/0007_provider_columns.sql`
- Modify: `fuelsniffer/src/lib/db/migrate.ts` (file list)
- Modify: `fuelsniffer/src/lib/db/schema.ts` (Drizzle types)
- Create: `fuelsniffer/src/__tests__/migration-0007.test.ts`

- [ ] **Step 1: Write the migration SQL**

Create `fuelsniffer/src/lib/db/migrations/0007_provider_columns.sql`:

```sql
-- Migration 0007: Provider abstraction columns
-- Adds source_provider + external_id to stations and price_readings.
-- Backfills existing rows to 'qld' (every current row is from QLD).
-- Creates a unique index on (source_provider, external_id) so non-QLD
-- providers can coexist without ID collisions.
-- Idempotent: uses IF NOT EXISTS guards everywhere.

-- Step 1: nullable add
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(64);

ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16);

ALTER TABLE price_readings
  ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16);

-- Step 2: backfill any rows that haven't been touched yet
UPDATE stations
  SET external_id = id::text
  WHERE external_id IS NULL;

UPDATE stations
  SET source_provider = 'qld'
  WHERE source_provider IS NULL;

UPDATE price_readings
  SET source_provider = 'qld'
  WHERE source_provider IS NULL;

-- Step 3: enforce NOT NULL now that backfill is done
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stations' AND column_name = 'external_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE stations ALTER COLUMN external_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stations' AND column_name = 'source_provider' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE stations ALTER COLUMN source_provider SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_readings' AND column_name = 'source_provider' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE price_readings ALTER COLUMN source_provider SET NOT NULL;
  END IF;
END $$;

-- Step 4: composite uniqueness so different providers can have overlapping external_ids
CREATE UNIQUE INDEX IF NOT EXISTS stations_provider_external_id_uniq
  ON stations (source_provider, external_id);

-- Step 5: collision-safe surrogate id sequence for non-QLD providers
-- QLD station IDs from the live API are real integers up to ~6 figures.
-- Starting at 10_000_000 leaves a comfortable gap.
CREATE SEQUENCE IF NOT EXISTS stations_nsw_id_seq START 10000000;
```

- [ ] **Step 2: Add the migration to the runner's file list**

Open `fuelsniffer/src/lib/db/migrate.ts`. Find line 36:

```typescript
const files = ['0000_schema.sql', '0002_cagg.sql', '0003_invite_codes_sessions.sql', '0004_performance_indexes.sql', '0005_daily_aggregate.sql']
```

Replace with:

```typescript
const files = [
  '0000_schema.sql',
  '0002_cagg.sql',
  '0003_invite_codes_sessions.sql',
  '0004_performance_indexes.sql',
  '0005_daily_aggregate.sql',
  '0007_provider_columns.sql',
]
```

(0006 is reserved for the PostGIS extension migration in Task 3.)

- [ ] **Step 3: Update the Drizzle schema to reflect the new columns**

Open `fuelsniffer/src/lib/db/schema.ts`. Find the `stations` table definition and add the two new columns. Replace the existing table definition with:

```typescript
export const stations = pgTable('stations', {
  id:             integer('id').primaryKey(),   // QLD API SiteId for QLD rows; surrogate from sequence for others
  externalId:     text('external_id').notNull(),  // namespaced external id within source_provider
  sourceProvider: text('source_provider').notNull(),  // 'qld' | 'nsw' | ...
  name:           text('name').notNull(),
  brand:          text('brand'),
  address:        text('address'),
  suburb:         text('suburb'),
  postcode:       text('postcode'),
  latitude:       doublePrecision('latitude').notNull(),
  longitude:      doublePrecision('longitude').notNull(),
  isActive:       boolean('is_active').notNull().default(true),
  lastSeenAt:     timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Find the `priceReadings` table definition and add `sourceProvider`:

```typescript
export const priceReadings = pgTable('price_readings', {
  recordedAt:     timestamp('recorded_at', { withTimezone: true }).notNull(),
  stationId:      integer('station_id').notNull().references(() => stations.id),
  fuelTypeId:     integer('fuel_type_id').notNull(),
  priceCents:     numeric('price_cents', { precision: 6, scale: 1 }).notNull(),
  sourceTs:       timestamp('source_ts', { withTimezone: true }).notNull(),
  sourceProvider: text('source_provider').notNull(),
})
```

Use `text` (not `varchar`) for the new columns because Drizzle's `pgTable` does not have a `varchar(n)` helper at this version; the SQL constraint enforces the max length at the DB layer. The Drizzle type will infer as `string`.

- [ ] **Step 4: Run the migration against the local dev DB**

```bash
cd fuelsniffer
docker compose up -d postgres
sleep 3
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
```

Expected output ends with `All migrations applied successfully.`

- [ ] **Step 5: Verify the schema in the live DB**

```bash
docker exec -i fuelsniffer-postgres-1 psql -U fuelsniffer -d fuelsniffer -c "\d stations" | grep -E "external_id|source_provider"
```

Expected: two lines showing both columns as `not null`.

```bash
docker exec -i fuelsniffer-postgres-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT source_provider, COUNT(*) FROM stations GROUP BY source_provider"
```

Expected: a single row showing `qld | <count>`.

- [ ] **Step 6: Write the integration test**

Create `fuelsniffer/src/__tests__/migration-0007.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL must be set for integration tests')

const sql = postgres(DATABASE_URL, { max: 1 })

describe('Migration 0007: provider columns', () => {
  it('stations.external_id is NOT NULL', async () => {
    const rows = await sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'stations' AND column_name = 'external_id'
    `
    expect(rows[0]?.is_nullable).toBe('NO')
  })

  it('stations.source_provider is NOT NULL', async () => {
    const rows = await sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'stations' AND column_name = 'source_provider'
    `
    expect(rows[0]?.is_nullable).toBe('NO')
  })

  it('price_readings.source_provider is NOT NULL', async () => {
    const rows = await sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'price_readings' AND column_name = 'source_provider'
    `
    expect(rows[0]?.is_nullable).toBe('NO')
  })

  it('every existing station has source_provider = qld', async () => {
    const rows = await sql`
      SELECT source_provider, COUNT(*)::int AS count FROM stations GROUP BY source_provider
    `
    for (const r of rows) {
      expect(r.source_provider).toBe('qld')
    }
  })

  it('composite unique index exists', async () => {
    const rows = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'stations' AND indexname = 'stations_provider_external_id_uniq'
    `
    expect(rows.length).toBe(1)
  })

  it('stations_nsw_id_seq exists and starts above QLD ids', async () => {
    const rows = await sql`SELECT last_value, start_value FROM stations_nsw_id_seq`
    expect(Number(rows[0].start_value)).toBeGreaterThanOrEqual(10000000)
  })
})
```

- [ ] **Step 7: Run the integration test**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx vitest run src/__tests__/migration-0007.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 8: Run the full type-check**

```bash
cd fuelsniffer && npx tsc --noEmit
```

Expected: no errors. The Drizzle schema additions may surface type errors in `writer.ts` because existing inserts don't supply `externalId` or `sourceProvider`. **If they do, fix them in this task** by setting `externalId: site.SiteId.toString()` and `sourceProvider: 'qld'` on every existing insert in `writer.ts`. Do not move on until tsc is clean.

- [ ] **Step 9: User acceptance check**

Manual verification:
1. Re-run the existing scraper integration test: `cd fuelsniffer && npx vitest run src/__tests__/scraper.test.ts`. Expected: still passes.
2. Hit `/api/prices?fuel=2&lat=-27.47&lng=153.02&radius=10` and confirm a non-empty response with at least one station. The API contract has not changed.

- [ ] **Step 10: Commit**

```bash
git add fuelsniffer/src/lib/db/migrations/0007_provider_columns.sql \
        fuelsniffer/src/lib/db/migrate.ts \
        fuelsniffer/src/lib/db/schema.ts \
        fuelsniffer/src/lib/scraper/writer.ts \
        fuelsniffer/src/__tests__/migration-0007.test.ts
git commit -m "feat(db): add source_provider + external_id columns

Provider abstraction prerequisite. Backfills existing rows to qld,
introduces stations_nsw_id_seq starting at 10M for collision-safe
surrogate ids on non-QLD providers, composite unique index on
(source_provider, external_id).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

---

## Task 3: PostGIS image switch

**Why now:** The PostGIS extension is needed for the `geom` column work in Phase 2, and installing it on a fresh cluster is much cleaner than retrofitting a running one. We do the image swap now (when we're already touching the DB for Task 2) so all subsequent work is built on PostGIS from day one.

**Files:**
- Modify: `fuelsniffer/docker-compose.yml`
- Create: `fuelsniffer/src/lib/db/migrations/0006_enable_postgis.sql`
- Modify: `fuelsniffer/src/lib/db/migrate.ts` (file list)

- [ ] **Step 1: Take a full backup of the existing database**

```bash
docker exec fuelsniffer-postgres-1 pg_dumpall -U fuelsniffer | gzip > ./backups/pre-postgis-$(date +%Y%m%d%H%M%S).sql.gz
ls -la ./backups/pre-postgis-*.sql.gz
```

Expected: a non-empty gzip file.

- [ ] **Step 2: Stop all containers except postgres, then stop postgres**

```bash
cd fuelsniffer
docker compose stop app db-backup cloudflared 2>/dev/null
docker compose stop postgres
```

- [ ] **Step 3: Rename the existing data directory**

```bash
mv ./data/postgres ./data/postgres.bak-$(date +%Y%m%d%H%M%S)
```

- [ ] **Step 4: Update docker-compose.yml to use the PostGIS image**

Open `fuelsniffer/docker-compose.yml`. Find the postgres service's `image:` line:

```yaml
    image: postgres:17-alpine
```

Replace with:

```yaml
    image: postgis/postgis:17-3.4-alpine
```

- [ ] **Step 5: Start postgres with the new image**

```bash
cd fuelsniffer
docker compose up -d postgres
sleep 5
docker compose exec postgres psql -U fuelsniffer -d fuelsniffer -c "SELECT 1"
```

Expected: a fresh empty database responds. The new image initialises a clean cluster with PostGIS shared objects available.

- [ ] **Step 6: Create the PostGIS extension**

```bash
docker compose exec postgres psql -U fuelsniffer -d fuelsniffer -c "CREATE EXTENSION postgis; SELECT postgis_version();"
```

Expected: version string like `3.4 USE_GEOS=1 USE_PROJ=1 ...`

- [ ] **Step 7: Restore the backup**

```bash
gunzip -c ./backups/pre-postgis-*.sql.gz | docker exec -i fuelsniffer-postgres-1 psql -U fuelsniffer -d fuelsniffer
```

Expected: no errors (some "already exists" notices are OK).

- [ ] **Step 8: Write the PostGIS migration for fresh deploys and CI**

Create `fuelsniffer/src/lib/db/migrations/0006_enable_postgis.sql`:

```sql
-- Migration 0006: Enable PostGIS extension
-- For fresh deployments. On an existing deployment, the extension was
-- enabled manually during the image switch (see Phase 1 runbook).
-- IF NOT EXISTS makes this idempotent.
CREATE EXTENSION IF NOT EXISTS postgis;
```

- [ ] **Step 9: Add 0006 to the migration runner file list**

Open `fuelsniffer/src/lib/db/migrate.ts`. The file list (updated in Task 2) should now be:

```typescript
const files = [
  '0000_schema.sql',
  '0002_cagg.sql',
  '0003_invite_codes_sessions.sql',
  '0004_performance_indexes.sql',
  '0005_daily_aggregate.sql',
  '0006_enable_postgis.sql',
  '0007_provider_columns.sql',
]
```

**Order matters:** 0006 must come before 0007 because future migrations (Phase 2) will depend on PostGIS types.

- [ ] **Step 10: Run the full migration runner to verify idempotency**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
```

Expected: `All migrations applied successfully.` with no errors. Every migration is idempotent — re-running on a restored DB should be harmless.

- [ ] **Step 11: Verify PostGIS is functional**

```bash
docker compose exec postgres psql -U fuelsniffer -d fuelsniffer -c "SELECT ST_AsText(ST_MakePoint(153.02, -27.47));"
```

Expected: `POINT(153.02 -27.47)`

- [ ] **Step 12: Run the full test suite**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx vitest run
npx tsc --noEmit
```

Expected: all tests pass. If integration tests that query `stations` or `price_readings` fail, the restored data may have table structure issues — investigate before proceeding.

- [ ] **Step 13: Bring up the rest of the stack**

```bash
cd fuelsniffer
docker compose up -d
```

Verify the app is healthy: `curl -s http://localhost:4000/api/health | head`

- [ ] **Step 14: Delete the backup data dir only after confirming everything works**

```bash
rm -rf ./data/postgres.bak-*
```

**Rollback:** If anything fails at step 7 or later, stop postgres, move `./data/postgres.bak-*` back to `./data/postgres`, revert `docker-compose.yml` to `postgres:17-alpine`, and restart. Total rollback time ~5 minutes.

- [ ] **Step 15: Commit**

```bash
git add fuelsniffer/docker-compose.yml \
        fuelsniffer/src/lib/db/migrations/0006_enable_postgis.sql \
        fuelsniffer/src/lib/db/migrate.ts
git commit -m "infra(db): switch to postgis/postgis:17-3.4-alpine

Enables PostGIS extension for future geom column work (Phase 2).
Includes 0006_enable_postgis.sql for fresh deploys. Existing
deployments use the documented dump/restore procedure.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Provider abstraction interface and QLD refactor

**Why now:** This is the architectural foundation that everything else in Phase 1 builds on. Define the `FuelPriceProvider` interface, move the existing QLD code into the provider structure, and update the scheduler to loop over a registry.

**Files:**
- Create: `fuelsniffer/src/lib/providers/fuel/index.ts`
- Create: `fuelsniffer/src/lib/providers/fuel/qld/index.ts`
- Move: `fuelsniffer/src/lib/scraper/client.ts` → `fuelsniffer/src/lib/providers/fuel/qld/client.ts`
- Move: `fuelsniffer/src/lib/scraper/normaliser.ts` → `fuelsniffer/src/lib/providers/fuel/qld/normaliser.ts`
- Move: `fuelsniffer/src/lib/scraper/ckan-client.ts` → `fuelsniffer/src/lib/providers/fuel/qld/ckan-client.ts`
- Modify: `fuelsniffer/src/lib/scraper/scheduler.ts`
- Modify: `fuelsniffer/src/lib/scraper/writer.ts`
- Create: `fuelsniffer/src/__tests__/provider-registry.test.ts`

- [ ] **Step 1: Create the provider interface and types**

Create `fuelsniffer/src/lib/providers/fuel/index.ts`:

```typescript
/**
 * Fuel price provider abstraction.
 *
 * Each state/source implements this interface. The scheduler iterates
 * over the registry and invokes each provider independently — a failure
 * in one provider does not block others.
 */

export interface NormalisedStation {
  id: number                // surrogate PK (QLD uses SiteId; others use nextval from a sequence)
  externalId: string        // the provider's own station identifier
  sourceProvider: string    // 'qld' | 'nsw' | ...
  name: string
  brand: string | null
  address: string | null
  suburb: string | null
  postcode: string | null
  latitude: number
  longitude: number
}

export interface NormalisedPrice {
  stationId: number
  fuelTypeId: number
  priceCents: string        // numeric(6,1) stored as string for Drizzle
  recordedAt: Date
  sourceTs: Date
  sourceProvider: string
}

export interface ProviderHealth {
  status: 'ok' | 'degraded' | 'down'
  lastRunAt: Date | null
  message?: string
}

export interface FuelPriceProvider {
  readonly id: string
  readonly displayName: string

  /** Fetch and normalise all stations from this provider */
  fetchStations(): Promise<NormalisedStation[]>

  /** Fetch and normalise all current prices from this provider */
  fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]>

  /** Quick health probe — does the upstream API respond? */
  healthCheck(): Promise<ProviderHealth>
}

// ── Provider registry ────────────────────────────────────────────────────────

const providers: FuelPriceProvider[] = []

export function registerProvider(provider: FuelPriceProvider): void {
  if (providers.some(p => p.id === provider.id)) {
    throw new Error(`Provider '${provider.id}' is already registered`)
  }
  providers.push(provider)
}

export function getProviders(): readonly FuelPriceProvider[] {
  return providers
}

export function getProvider(id: string): FuelPriceProvider | undefined {
  return providers.find(p => p.id === id)
}

/** Reset registry — only for tests */
export function clearProviders(): void {
  providers.length = 0
}
```

- [ ] **Step 2: Write tests for the registry**

Create `fuelsniffer/src/__tests__/provider-registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerProvider,
  getProviders,
  getProvider,
  clearProviders,
  type FuelPriceProvider,
} from '@/lib/providers/fuel'

function makeFakeProvider(id: string): FuelPriceProvider {
  return {
    id,
    displayName: `Fake ${id}`,
    fetchStations: async () => [],
    fetchPrices: async () => [],
    healthCheck: async () => ({ status: 'ok', lastRunAt: new Date() }),
  }
}

describe('Provider registry', () => {
  beforeEach(() => clearProviders())

  it('starts empty', () => {
    expect(getProviders()).toHaveLength(0)
  })

  it('registers and retrieves a provider', () => {
    registerProvider(makeFakeProvider('qld'))
    expect(getProviders()).toHaveLength(1)
    expect(getProvider('qld')?.id).toBe('qld')
  })

  it('prevents duplicate registration', () => {
    registerProvider(makeFakeProvider('qld'))
    expect(() => registerProvider(makeFakeProvider('qld'))).toThrow(
      "Provider 'qld' is already registered"
    )
  })

  it('returns undefined for unknown provider', () => {
    expect(getProvider('unknown')).toBeUndefined()
  })

  it('registers multiple providers', () => {
    registerProvider(makeFakeProvider('qld'))
    registerProvider(makeFakeProvider('nsw'))
    expect(getProviders()).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run the registry test**

```bash
cd fuelsniffer && npx vitest run src/__tests__/provider-registry.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 4: Move the QLD scraper files into the provider directory**

```bash
mkdir -p fuelsniffer/src/lib/providers/fuel/qld
cp fuelsniffer/src/lib/scraper/client.ts fuelsniffer/src/lib/providers/fuel/qld/client.ts
cp fuelsniffer/src/lib/scraper/normaliser.ts fuelsniffer/src/lib/providers/fuel/qld/normaliser.ts
cp fuelsniffer/src/lib/scraper/ckan-client.ts fuelsniffer/src/lib/providers/fuel/qld/ckan-client.ts
```

**Do not delete the originals yet** — we'll update imports first, verify the build, then remove them.

- [ ] **Step 5: Fix import paths in the copied files**

In `fuelsniffer/src/lib/providers/fuel/qld/client.ts`: no changes needed — imports are from external packages only.

In `fuelsniffer/src/lib/providers/fuel/qld/normaliser.ts`: update the import at the top:

```typescript
import type { SiteDetails, SitePrice } from './client'
import type { NewPriceReading, NewStation } from '@/lib/db/schema'
```

The first import changes from `'./client'` — it should already be `'./client'` since the file was co-located. Verify it's correct.

In `fuelsniffer/src/lib/providers/fuel/qld/ckan-client.ts`: no changes needed — no local imports.

- [ ] **Step 6: Create the QLD provider implementation**

Create `fuelsniffer/src/lib/providers/fuel/qld/index.ts`:

```typescript
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'
import { createApiClient } from './client'
import { normaliseStation, normalisePrice } from './normaliser'
import { fetchCkanPrices, findLatestResourceId, deduplicateToLatest } from './ckan-client'
import { rawToPrice } from './normaliser'
import { db } from '@/lib/db/client'
import { scrapeHealth } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

const CKAN_FUEL_TYPE_MAP: Record<string, number> = {
  'Unleaded': 2, 'Diesel': 3, 'LPG': 4,
  'PULP 95/96 RON': 5, 'Premium Unleaded 95': 5,
  'PULP 98 RON': 8, 'Premium Unleaded 98': 8,
  'e10': 12, 'E10': 12, 'Premium Diesel': 14, 'E85': 19,
}

export class QldFuelProvider implements FuelPriceProvider {
  readonly id = 'qld'
  readonly displayName = 'Queensland Fuel Price API'

  private useDirectApi(): boolean {
    const token = process.env.QLD_API_TOKEN
    return !!token && token !== 'placeholder_register_at_fuelpricesqld'
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (this.useDirectApi()) {
      return this.fetchStationsDirect()
    }
    return this.fetchStationsCkan()
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (this.useDirectApi()) {
      return this.fetchPricesDirect(recordedAt)
    }
    return this.fetchPricesCkan(recordedAt)
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const rows = await db
        .select()
        .from(scrapeHealth)
        .orderBy(desc(scrapeHealth.scrapedAt))
        .limit(1)
      if (rows.length === 0) {
        return { status: 'degraded', lastRunAt: null, message: 'No scrape history' }
      }
      const last = rows[0]
      return {
        status: last.error ? 'degraded' : 'ok',
        lastRunAt: new Date(last.scrapedAt),
        message: last.error ?? undefined,
      }
    } catch {
      return { status: 'down', lastRunAt: null, message: 'DB query failed' }
    }
  }

  // ── Direct API path ──────────────────────────────────────────────────

  private async fetchStationsDirect(): Promise<NormalisedStation[]> {
    const client = createApiClient()
    const sitesResponse = await client.getFullSiteDetails()
    return sitesResponse.sites.map(site => {
      const station = normaliseStation(site)
      return {
        id: station.id!,
        externalId: String(station.id),
        sourceProvider: 'qld',
        name: station.name,
        brand: station.brand ?? null,
        address: station.address ?? null,
        suburb: station.suburb ?? null,
        postcode: station.postcode ?? null,
        latitude: station.latitude,
        longitude: station.longitude,
      }
    })
  }

  private async fetchPricesDirect(recordedAt: Date): Promise<NormalisedPrice[]> {
    const client = createApiClient()
    const pricesResponse = await client.getSitesPrices()
    return pricesResponse.SitePrices
      .map(p => normalisePrice(p, recordedAt))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map(p => ({
        stationId: p.stationId,
        fuelTypeId: p.fuelTypeId,
        priceCents: p.priceCents,
        recordedAt: p.recordedAt,
        sourceTs: p.sourceTs,
        sourceProvider: 'qld',
      }))
  }

  // ── CKAN fallback path ───────────────────────────────────────────────

  private async fetchStationsCkan(): Promise<NormalisedStation[]> {
    const { resourceId } = await findLatestResourceId()
    const allRecords = await fetchCkanPrices(resourceId)
    const stationMap = new Map<string, typeof allRecords[0]>()
    for (const r of allRecords) {
      if (!stationMap.has(r.SiteId)) stationMap.set(r.SiteId, r)
    }

    return Array.from(stationMap.values())
      .filter(r => {
        const lat = parseFloat(r.Site_Latitude)
        const lng = parseFloat(r.Site_Longitude)
        return !isNaN(lat) && !isNaN(lng)
      })
      .map(r => ({
        id: parseInt(r.SiteId, 10),
        externalId: r.SiteId,
        sourceProvider: 'qld',
        name: r.Site_Name,
        brand: r.Site_Brand || null,
        address: r.Sites_Address_Line_1 || null,
        suburb: r.Site_Suburb || null,
        postcode: r.Site_Post_Code || null,
        latitude: parseFloat(r.Site_Latitude),
        longitude: parseFloat(r.Site_Longitude),
      }))
  }

  private async fetchPricesCkan(recordedAt: Date): Promise<NormalisedPrice[]> {
    const { resourceId } = await findLatestResourceId()
    const allRecords = await fetchCkanPrices(resourceId)
    const latestRecords = deduplicateToLatest(allRecords)

    return latestRecords
      .filter(r => {
        const lat = parseFloat(r.Site_Latitude)
        const lng = parseFloat(r.Site_Longitude)
        return !isNaN(lat) && !isNaN(lng)
      })
      .map(r => {
        const fuelTypeId = CKAN_FUEL_TYPE_MAP[r.Fuel_Type]
        if (!fuelTypeId) return null
        const rawPrice = parseInt(r.Price, 10)
        const priceCents = (rawPrice / 10).toFixed(1)
        const sourceTs = new Date(r.TransactionDateutc + 'Z')
        return {
          stationId: parseInt(r.SiteId, 10),
          fuelTypeId,
          priceCents,
          recordedAt,
          sourceTs,
          sourceProvider: 'qld',
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
  }
}
```

- [ ] **Step 7: Rewrite `writer.ts` to be provider-aware**

Replace the entire content of `fuelsniffer/src/lib/scraper/writer.ts` with:

```typescript
import axios from 'axios'
import { db } from '@/lib/db/client'
import { stations, priceReadings, scrapeHealth } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice } from '@/lib/providers/fuel'

// ── Healthchecks.io dead-man's-switch ────────────────────────────────────────

async function pingHealthchecks(): Promise<void> {
  const pingUrl = process.env.HEALTHCHECKS_PING_URL
  if (!pingUrl) return
  try {
    await axios.get(pingUrl, { timeout: 5000 })
  } catch {
    console.error('[scraper] healthchecks.io ping failed — monitoring may alert')
  }
}

// ── Station upsert ──────────────────────────────────────────────────────────

async function upsertStations(stationList: NormalisedStation[]): Promise<void> {
  if (stationList.length === 0) return
  for (const s of stationList) {
    await db
      .insert(stations)
      .values({
        id: s.id,
        externalId: s.externalId,
        sourceProvider: s.sourceProvider,
        name: s.name,
        brand: s.brand,
        address: s.address,
        suburb: s.suburb,
        postcode: s.postcode,
        latitude: s.latitude,
        longitude: s.longitude,
        isActive: true,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: stations.id,
        set: {
          name: sql`excluded.name`,
          brand: sql`excluded.brand`,
          address: sql`excluded.address`,
          suburb: sql`excluded.suburb`,
          postcode: sql`excluded.postcode`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          isActive: sql`true`,
          lastSeenAt: sql`excluded.last_seen_at`,
          externalId: sql`excluded.external_id`,
          sourceProvider: sql`excluded.source_provider`,
        },
      })
  }
}

// ── Price deduplication + insert ─────────────────────────────────────────────

async function insertNewPrices(priceList: NormalisedPrice[]): Promise<number> {
  if (priceList.length === 0) return 0

  // Fetch the latest source_ts per station+fuel so we only insert genuine new data
  const latestSourceTs = await db.execute(sql`
    SELECT DISTINCT ON (station_id, fuel_type_id)
      station_id, fuel_type_id, source_ts
    FROM price_readings
    ORDER BY station_id, fuel_type_id, recorded_at DESC
  `)
  const seenKey = new Set(
    (latestSourceTs as unknown as Array<{ station_id: number; fuel_type_id: number; source_ts: Date }>)
      .map(r => `${r.station_id}-${r.fuel_type_id}-${new Date(r.source_ts).getTime()}`)
  )

  const newRows = priceList.filter(p => {
    const key = `${p.stationId}-${p.fuelTypeId}-${new Date(p.sourceTs).getTime()}`
    return !seenKey.has(key)
  })

  if (newRows.length > 0) {
    await db.insert(priceReadings).values(
      newRows.map(p => ({
        stationId: p.stationId,
        fuelTypeId: p.fuelTypeId,
        priceCents: p.priceCents,
        recordedAt: p.recordedAt,
        sourceTs: p.sourceTs,
        sourceProvider: p.sourceProvider,
      }))
    )
  }

  return newRows.length
}

// ── Main provider-based scrape orchestrator ──────────────────────────────────

export interface ScrapeResult {
  providerId: string
  pricesUpserted: number
  error: string | null
}

export async function runProviderScrape(provider: FuelPriceProvider): Promise<ScrapeResult> {
  const startTime = Date.now()

  try {
    const recordedAt = new Date()
    console.log(`[scraper:${provider.id}] Starting scrape...`)

    const stationList = await provider.fetchStations()
    await upsertStations(stationList)

    const priceList = await provider.fetchPrices(recordedAt)
    const pricesUpserted = await insertNewPrices(priceList)

    const durationMs = Date.now() - startTime

    await db.insert(scrapeHealth).values({
      pricesUpserted,
      durationMs,
      error: null,
    })

    await pingHealthchecks()

    console.log(`[scraper:${provider.id}] OK — ${stationList.length} stations, ${pricesUpserted} new prices in ${durationMs}ms`)

    return { providerId: provider.id, pricesUpserted, error: null }
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[scraper:${provider.id}] FAILED after ${durationMs}ms: ${errorMessage}`)

    try {
      await db.insert(scrapeHealth).values({
        pricesUpserted: 0,
        durationMs,
        error: `[${provider.id}] ${errorMessage}`,
      })
    } catch (dbErr) {
      console.error(`[scraper:${provider.id}] Could not write failure record:`, dbErr)
    }

    return { providerId: provider.id, pricesUpserted: 0, error: errorMessage }
  }
}
```

- [ ] **Step 8: Rewrite `scheduler.ts` to loop over the provider registry**

Replace the content of `fuelsniffer/src/lib/scraper/scheduler.ts` with:

```typescript
import cron from 'node-cron'
import { getProviders, registerProvider } from '@/lib/providers/fuel'
import { QldFuelProvider } from '@/lib/providers/fuel/qld'
import { runProviderScrape } from './writer'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

/**
 * Start the scrape + maintenance schedulers.
 * Called once from src/instrumentation.ts when the Next.js server starts.
 */
export function startScheduler(): void {
  // Register providers
  registerProvider(new QldFuelProvider())
  // NSW provider will be registered here in a later task

  const providers = getProviders()
  console.log(`[scheduler] Registered ${providers.length} provider(s): ${providers.map(p => p.id).join(', ')}`)

  // Run all providers immediately on startup
  console.log('[scheduler] Starting — running immediate scrape for all providers')
  runAllProviders().catch((err) => {
    console.error('[scheduler] Immediate startup scrape failed:', err)
  })

  // Job 1: Scrape every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runAllProviders().catch((err) => {
      console.error('[scheduler] Scheduled scrape failed:', err)
    })
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  // Job 2: Refresh hourly_prices materialized view every hour at :30
  cron.schedule('30 * * * *', () => {
    db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      .catch((err) => console.error('[scheduler] hourly_prices refresh failed:', err))
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  // Job 3: Nightly maintenance at 2:00am Brisbane time
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[scheduler] Starting nightly maintenance...')
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY daily_prices`)
      console.log('[scheduler] daily_prices refreshed (pre-delete)')
      await db.execute(sql`
        DELETE FROM price_readings
        WHERE recorded_at < NOW() - INTERVAL '7 days'
      `)
      console.log('[scheduler] Deleted raw rows older than 7 days')
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      console.log('[scheduler] hourly_prices refreshed (post-delete)')
      console.log('[scheduler] Nightly maintenance complete')
    } catch (err) {
      console.error('[scheduler] Nightly maintenance failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[scheduler] Running — scraping every 15 min, hourly view refresh, nightly cleanup (Australia/Brisbane)')
}

/**
 * Run all registered providers sequentially.
 * Provider failures are isolated — one failing does not block others.
 */
async function runAllProviders(): Promise<void> {
  const providers = getProviders()
  for (const provider of providers) {
    await runProviderScrape(provider)
  }
}
```

- [ ] **Step 9: Update import paths across the codebase**

Search for any remaining imports from the old scraper module paths and update them:

```bash
grep -rn "from '@/lib/scraper/client'" fuelsniffer/src/ --include="*.ts"
grep -rn "from '@/lib/scraper/normaliser'" fuelsniffer/src/ --include="*.ts"
grep -rn "from '@/lib/scraper/ckan-client'" fuelsniffer/src/ --include="*.ts"
```

For each result: if the file is in `src/__tests__/`, update the import to point to `@/lib/providers/fuel/qld/client` (etc.). If the file is in `src/lib/scraper/writer.ts` it was already rewritten in Step 7. If the file is in `src/lib/scraper/scheduler.ts` it was already rewritten in Step 8.

- [ ] **Step 10: Delete the old scraper files**

Only after all imports are updated and tests pass:

```bash
rm fuelsniffer/src/lib/scraper/client.ts
rm fuelsniffer/src/lib/scraper/normaliser.ts
rm fuelsniffer/src/lib/scraper/ckan-client.ts
```

- [ ] **Step 11: Run full tests and type-check**

```bash
cd fuelsniffer && npx vitest run && npx tsc --noEmit
```

Expected: all tests pass. Fix any broken imports.

- [ ] **Step 12: User acceptance check**

1. Start the dev server: `cd fuelsniffer && npm run dev`
2. Watch the console for `[scheduler] Registered 1 provider(s): qld` on startup.
3. Wait for the immediate scrape to complete — should see `[scraper:qld] OK — X stations, Y new prices`.
4. Hit `http://localhost:4000/api/prices?fuel=2&lat=-27.47&lng=153.02&radius=10` — must return stations.
5. Hit `http://localhost:4000/api/health` — must return `{"status":"ok",...}`.

- [ ] **Step 13: Commit**

```bash
git add fuelsniffer/src/lib/providers/ \
        fuelsniffer/src/lib/scraper/scheduler.ts \
        fuelsniffer/src/lib/scraper/writer.ts \
        fuelsniffer/src/__tests__/provider-registry.test.ts
git rm fuelsniffer/src/lib/scraper/client.ts \
       fuelsniffer/src/lib/scraper/normaliser.ts \
       fuelsniffer/src/lib/scraper/ckan-client.ts
git commit -m "refactor(scraper): provider abstraction + QLD provider

Introduces FuelPriceProvider interface with registry pattern. Existing
QLD scraper code moves into src/lib/providers/fuel/qld/ with zero
behaviour change. scheduler.ts now loops over registered providers.
writer.ts is provider-aware (accepts NormalisedStation/NormalisedPrice).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Brand normaliser

**Files:**
- Create: `fuelsniffer/src/lib/db/migrations/0008_brand_aliases.sql`
- Modify: `fuelsniffer/src/lib/db/migrate.ts`
- Create: `fuelsniffer/src/lib/providers/fuel/brand-normaliser.ts`
- Create: `fuelsniffer/src/__tests__/brand-normaliser.test.ts`

- [ ] **Step 1: Write the brand normaliser tests**

Create `fuelsniffer/src/__tests__/brand-normaliser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normaliseBrand } from '@/lib/providers/fuel/brand-normaliser'

describe('normaliseBrand', () => {
  it('normalises known QLD aliases', () => {
    expect(normaliseBrand('7-ELEVEN')).toBe('7-Eleven')
    expect(normaliseBrand('7-eleven')).toBe('7-Eleven')
    expect(normaliseBrand('7 Eleven')).toBe('7-Eleven')
  })

  it('normalises case variations of known brands', () => {
    expect(normaliseBrand('SHELL')).toBe('Shell')
    expect(normaliseBrand('shell')).toBe('Shell')
    expect(normaliseBrand('BP')).toBe('BP')
    expect(normaliseBrand('bp')).toBe('BP')
  })

  it('trims whitespace', () => {
    expect(normaliseBrand('  Shell  ')).toBe('Shell')
  })

  it('passes through unknown brands unchanged except for trim', () => {
    expect(normaliseBrand('Some New Brand')).toBe('Some New Brand')
  })

  it('returns null for null input', () => {
    expect(normaliseBrand(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normaliseBrand('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/brand-normaliser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the brand normaliser implementation**

Create `fuelsniffer/src/lib/providers/fuel/brand-normaliser.ts`:

```typescript
/**
 * Brand name normalisation.
 *
 * Fuel station brand names vary wildly between providers and even within
 * a single provider (e.g., "7-ELEVEN" vs "7 Eleven" vs "7-eleven").
 * This module maps known aliases to a canonical name.
 *
 * Unknown brands pass through with whitespace trimmed — we don't reject
 * data we don't recognise.
 */

// Aliases map: lowercase lookup key → canonical name
const ALIASES: Record<string, string> = {
  // 7-Eleven variants
  '7-eleven': '7-Eleven',
  '7 eleven': '7-Eleven',
  '7eleven': '7-Eleven',
  // BP
  'bp': 'BP',
  // Shell / Coles
  'shell': 'Shell',
  'shell coles express': 'Shell Coles Express',
  'coles express': 'Shell Coles Express',
  // Ampol
  'ampol': 'Ampol',
  'caltex': 'Ampol',  // Caltex rebranded to Ampol in AU
  // United
  'united': 'United',
  'united petroleum': 'United',
  // Puma
  'puma': 'Puma',
  'puma energy': 'Puma',
  // Liberty
  'liberty': 'Liberty',
  'liberty oil': 'Liberty',
  // Metro
  'metro': 'Metro',
  'metro petroleum': 'Metro',
  // Woolworths / EG
  'woolworths': 'Woolworths',
  'eg australia': 'Woolworths',  // EG Group operates Woolworths fuel
  // Costco
  'costco': 'Costco',
  // Independent
  'independent': 'Independent',
  // Lowes
  'lowes': 'Lowes',
  'lowes petroleum': 'Lowes',
  // Mobil
  'mobil': 'Mobil',
  // Freedom
  'freedom': 'Freedom',
  'freedom fuels': 'Freedom',
  // Vibe
  'vibe': 'Vibe',
  // Night Owl (QLD chain)
  'night owl': 'Night Owl',
  // APCO
  'apco': 'APCO',
  // Enhance
  'enhance': 'Enhance',
}

export function normaliseBrand(raw: string | null): string | null {
  if (!raw || raw.trim() === '') return null
  const trimmed = raw.trim()
  const lookup = trimmed.toLowerCase()
  return ALIASES[lookup] ?? trimmed
}
```

- [ ] **Step 4: Run the tests**

```bash
cd fuelsniffer && npx vitest run src/__tests__/brand-normaliser.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Write the migration for the brand_aliases table**

Create `fuelsniffer/src/lib/db/migrations/0008_brand_aliases.sql`:

```sql
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
```

- [ ] **Step 6: Add 0008 to the migration runner**

Add `'0008_brand_aliases.sql'` to the end of the `files` array in `fuelsniffer/src/lib/db/migrate.ts`.

- [ ] **Step 7: Run the migration**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
```

Expected: `All migrations applied successfully.`

- [ ] **Step 8: Wire the normaliser into the QLD provider**

In `fuelsniffer/src/lib/providers/fuel/qld/index.ts`, add the import:

```typescript
import { normaliseBrand } from '../brand-normaliser'
```

In the `fetchStationsDirect()` method, change:

```typescript
        brand: station.brand ?? null,
```

to:

```typescript
        brand: normaliseBrand(station.brand),
```

Do the same in `fetchStationsCkan()` — change:

```typescript
        brand: r.Site_Brand || null,
```

to:

```typescript
        brand: normaliseBrand(r.Site_Brand),
```

- [ ] **Step 9: Run all tests and type-check**

```bash
cd fuelsniffer && npx vitest run && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add fuelsniffer/src/lib/providers/fuel/brand-normaliser.ts \
        fuelsniffer/src/lib/providers/fuel/qld/index.ts \
        fuelsniffer/src/lib/db/migrations/0008_brand_aliases.sql \
        fuelsniffer/src/lib/db/migrate.ts \
        fuelsniffer/src/__tests__/brand-normaliser.test.ts
git commit -m "feat(providers): brand normaliser with 20 known aliases

In-code normaliser for brand name consistency across providers.
Backed by brand_aliases table for future DB-based extension.
Wired into QLD provider for both Direct API and CKAN paths.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Security headers middleware

**Files:**
- Create: `fuelsniffer/src/middleware.ts`
- Create: `fuelsniffer/src/lib/security/headers.ts`
- Create: `fuelsniffer/src/lib/db/migrations/0009_csp_violations.sql`
- Modify: `fuelsniffer/src/lib/db/migrate.ts`
- Create: `fuelsniffer/src/app/api/csp-report/route.ts`
- Create: `fuelsniffer/src/__tests__/security-headers.test.ts`

- [ ] **Step 1: Write the security headers builder**

Create `fuelsniffer/src/lib/security/headers.ts`:

```typescript
/**
 * Security header builder for Next.js middleware.
 *
 * CSP is in report-only mode for Phase 1 — it does not block anything.
 * Enforcement comes in Phase 3 after a soak period confirms no
 * legitimate traffic triggers violations.
 */

export interface SecurityHeaders {
  'Content-Security-Policy-Report-Only': string
  'Strict-Transport-Security': string
  'X-Frame-Options': string
  'X-Content-Type-Options': string
  'Referrer-Policy': string
  'Permissions-Policy': string
}

export function buildSecurityHeaders(): SecurityHeaders {
  const cspDirectives = [
    "default-src 'self'",
    // Leaflet tiles
    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com blob:",
    // Leaflet + Recharts inline styles
    "style-src 'self' 'unsafe-inline'",
    // Scripts — unsafe-inline needed until nonce support in Phase 3
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Font loading
    "font-src 'self' https://fonts.gstatic.com",
    // API calls
    "connect-src 'self'",
    // Frames — none needed
    "frame-src 'none'",
    // CSP violation reports
    "report-uri /api/csp-report",
  ]

  return {
    'Content-Security-Policy-Report-Only': cspDirectives.join('; '),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  }
}
```

- [ ] **Step 2: Write the Next.js middleware**

Create `fuelsniffer/src/middleware.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildSecurityHeaders } from '@/lib/security/headers'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  const headers = buildSecurityHeaders()
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }

  return response
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

- [ ] **Step 3: Write the CSP violations migration**

Create `fuelsniffer/src/lib/db/migrations/0009_csp_violations.sql`:

```sql
-- Migration 0009: CSP violation reports table
CREATE TABLE IF NOT EXISTS csp_violations (
  id          BIGSERIAL PRIMARY KEY,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  document_uri TEXT,
  violated_directive TEXT,
  blocked_uri TEXT,
  source_file TEXT,
  line_number INTEGER,
  raw_report  JSONB
);
```

Add `'0009_csp_violations.sql'` to the migration runner file list.

- [ ] **Step 4: Write the CSP report endpoint**

Create `fuelsniffer/src/app/api/csp-report/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const report = body['csp-report'] || body

    await db.execute(sql`
      INSERT INTO csp_violations (document_uri, violated_directive, blocked_uri, source_file, line_number, raw_report)
      VALUES (
        ${report['document-uri'] ?? null},
        ${report['violated-directive'] ?? null},
        ${report['blocked-uri'] ?? null},
        ${report['source-file'] ?? null},
        ${report['line-number'] ?? null},
        ${JSON.stringify(body)}::jsonb
      )
    `)

    return new NextResponse(null, { status: 204 })
  } catch {
    return new NextResponse(null, { status: 204 }) // Never error on reports
  }
}
```

- [ ] **Step 5: Write the test**

Create `fuelsniffer/src/__tests__/security-headers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSecurityHeaders } from '@/lib/security/headers'

describe('buildSecurityHeaders', () => {
  const headers = buildSecurityHeaders()

  it('returns CSP in report-only mode', () => {
    expect(headers).toHaveProperty('Content-Security-Policy-Report-Only')
    expect(headers).not.toHaveProperty('Content-Security-Policy')
  })

  it('CSP includes self as default-src', () => {
    expect(headers['Content-Security-Policy-Report-Only']).toContain("default-src 'self'")
  })

  it('CSP includes Leaflet tile sources', () => {
    expect(headers['Content-Security-Policy-Report-Only']).toContain('tile.openstreetmap.org')
  })

  it('CSP includes report-uri', () => {
    expect(headers['Content-Security-Policy-Report-Only']).toContain('report-uri /api/csp-report')
  })

  it('sets X-Frame-Options DENY', () => {
    expect(headers['X-Frame-Options']).toBe('DENY')
  })

  it('sets X-Content-Type-Options nosniff', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('sets HSTS with preload', () => {
    expect(headers['Strict-Transport-Security']).toContain('preload')
  })

  it('sets restrictive Permissions-Policy', () => {
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(headers['Permissions-Policy']).toContain('geolocation=(self)')
  })
})
```

- [ ] **Step 6: Run tests**

```bash
cd fuelsniffer && npx vitest run src/__tests__/security-headers.test.ts
```

Expected: 8 passing tests.

- [ ] **Step 7: Run the migration, then full test suite and type-check**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
npx vitest run
npx tsc --noEmit
```

- [ ] **Step 8: User acceptance check**

1. Start dev server: `cd fuelsniffer && npm run dev`
2. `curl -sI http://localhost:4000/ | grep -iE "content-security|x-frame|x-content-type|strict-transport|referrer-policy|permissions-policy"`
3. Confirm all 6 headers are present in the response.

- [ ] **Step 9: Commit**

```bash
git add fuelsniffer/src/middleware.ts \
        fuelsniffer/src/lib/security/headers.ts \
        fuelsniffer/src/app/api/csp-report/route.ts \
        fuelsniffer/src/lib/db/migrations/0009_csp_violations.sql \
        fuelsniffer/src/lib/db/migrate.ts \
        fuelsniffer/src/__tests__/security-headers.test.ts
git commit -m "feat(security): security headers middleware + CSP report-only

Adds Content-Security-Policy-Report-Only, HSTS, X-Frame-Options DENY,
X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy
via Next.js middleware. CSP violations stored in csp_violations table.
Enforcement deferred to Phase 3 after soak period.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: In-memory rate limiting

**Files:**
- Create: `fuelsniffer/src/lib/security/rate-limit.ts`
- Modify: `fuelsniffer/src/middleware.ts`
- Create: `fuelsniffer/src/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write the rate limiter tests**

Create `fuelsniffer/src/__tests__/rate-limit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, resetRateLimits, type RateLimitConfig } from '@/lib/security/rate-limit'

const config: RateLimitConfig = { maxRequests: 5, windowMs: 60_000 }

describe('checkRateLimit (in-memory token bucket)', () => {
  beforeEach(() => resetRateLimits())

  it('allows requests under the limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('test-ip', 'test-bucket', config)
      expect(result.allowed).toBe(true)
    }
  })

  it('rejects the request that exceeds the limit', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('test-ip', 'test-bucket', config)
    }
    const result = checkRateLimit('test-ip', 'test-bucket', config)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('ip-a', 'test-bucket', config)
    }
    const resultA = checkRateLimit('ip-a', 'test-bucket', config)
    const resultB = checkRateLimit('ip-b', 'test-bucket', config)
    expect(resultA.allowed).toBe(false)
    expect(resultB.allowed).toBe(true)
  })

  it('tracks different buckets independently', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('test-ip', 'bucket-a', config)
    }
    const resultA = checkRateLimit('test-ip', 'bucket-a', config)
    const resultB = checkRateLimit('test-ip', 'bucket-b', config)
    expect(resultA.allowed).toBe(false)
    expect(resultB.allowed).toBe(true)
  })

  it('resets after window expires', async () => {
    const shortConfig: RateLimitConfig = { maxRequests: 2, windowMs: 100 }
    checkRateLimit('test-ip', 'test-bucket', shortConfig)
    checkRateLimit('test-ip', 'test-bucket', shortConfig)
    expect(checkRateLimit('test-ip', 'test-bucket', shortConfig).allowed).toBe(false)

    await new Promise(resolve => setTimeout(resolve, 150))

    expect(checkRateLimit('test-ip', 'test-bucket', shortConfig).allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd fuelsniffer && npx vitest run src/__tests__/rate-limit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the rate limiter implementation**

Create `fuelsniffer/src/lib/security/rate-limit.ts`:

```typescript
/**
 * In-process in-memory token bucket rate limiter.
 *
 * Design rationale: Postgres-backed would create lock contention on
 * concurrent requests from the same IP. In-memory is correct and
 * sufficient for V1's single-process Next.js server. If we ever
 * horizontally scale, this must swap to Redis or Cloudflare rules.
 */

export interface RateLimitConfig {
  maxRequests: number   // tokens per window
  windowMs: number      // window duration in milliseconds
}

interface Bucket {
  tokens: number
  windowStart: number   // timestamp (ms) when this window opened
}

const store = new Map<string, Bucket>()
const MAX_ENTRIES = 100_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function checkRateLimit(
  ipHash: string,
  bucketName: string,
  config: RateLimitConfig
): RateLimitResult {
  const key = `${ipHash}:${bucketName}`
  const now = Date.now()

  let bucket = store.get(key)

  // If no bucket or window has expired, start a fresh window
  if (!bucket || (now - bucket.windowStart) >= config.windowMs) {
    bucket = { tokens: config.maxRequests - 1, windowStart: now }
    store.set(key, bucket)
    evictIfNeeded()
    return { allowed: true, remaining: bucket.tokens, retryAfterMs: 0 }
  }

  // Window is still active — decrement
  if (bucket.tokens > 0) {
    bucket.tokens--
    return { allowed: true, remaining: bucket.tokens, retryAfterMs: 0 }
  }

  // Out of tokens
  const retryAfterMs = config.windowMs - (now - bucket.windowStart)
  return { allowed: false, remaining: 0, retryAfterMs }
}

/** Evict oldest entries when store exceeds cap */
function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return
  // Delete the first 10% of entries (Map iterates in insertion order)
  const deleteCount = Math.floor(MAX_ENTRIES * 0.1)
  let deleted = 0
  for (const key of store.keys()) {
    if (deleted >= deleteCount) break
    store.delete(key)
    deleted++
  }
}

/** Reset all rate limit state — only for tests */
export function resetRateLimits(): void {
  store.clear()
}

// ── Endpoint configs ────────────────────────────────────────────────────────

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/prices': { maxRequests: 120, windowMs: 60_000 },
  '/api/prices/history': { maxRequests: 30, windowMs: 60_000 },
  '/api/search': { maxRequests: 60, windowMs: 60_000 },
  '/api/health': { maxRequests: 30, windowMs: 60_000 },
  '/api/csp-report': { maxRequests: 10, windowMs: 60_000 },
}

/**
 * Find the rate limit config for a given pathname.
 * Returns undefined if no rate limit applies.
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig | undefined {
  // Exact match first
  if (RATE_LIMITS[pathname]) return RATE_LIMITS[pathname]
  // Prefix match for nested routes
  for (const [prefix, config] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(prefix + '/')) return config
  }
  return undefined
}
```

- [ ] **Step 4: Run the tests**

```bash
cd fuelsniffer && npx vitest run src/__tests__/rate-limit.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Wire rate limiting into the middleware**

Update `fuelsniffer/src/middleware.ts` to add rate limiting:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildSecurityHeaders } from '@/lib/security/headers'
import { checkRateLimit, getRateLimitConfig } from '@/lib/security/rate-limit'
import { createHash } from 'crypto'

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rate limiting (API routes only)
  const rateLimitConfig = getRateLimitConfig(pathname)
  if (rateLimitConfig) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? '0.0.0.0'
    const ipHash = hashIp(ip)
    const result = checkRateLimit(ipHash, pathname, rateLimitConfig)

    if (!result.allowed) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
          },
        }
      )
    }
  }

  // Security headers on all responses
  const response = NextResponse.next()
  const headers = buildSecurityHeaders()
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

- [ ] **Step 6: Run full test suite and type-check**

```bash
cd fuelsniffer && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 7: User acceptance check**

Start the dev server, then fire rapid requests to verify rate limiting works:

```bash
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/health; done
```

Expected: first 30 return `200`, subsequent ones return `429`.

- [ ] **Step 8: Commit**

```bash
git add fuelsniffer/src/lib/security/rate-limit.ts \
        fuelsniffer/src/middleware.ts \
        fuelsniffer/src/__tests__/rate-limit.test.ts
git commit -m "feat(security): in-memory rate limiting middleware

Per-endpoint token bucket rate limiter keyed by hashed IP. Single-process
design, no DB overhead. Defaults: 120/min for prices, 60/min for search,
30/min for history and health. Returns 429 with Retry-After header.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Input validation audit

**Why this is small:** all four existing API routes (`/api/prices`, `/api/prices/history`, `/api/search`, `/api/health`) already have Zod validation. This task is a verification pass + error-format hardening, not a rewrite.

**Files:**
- Modify: `fuelsniffer/src/app/api/prices/route.ts` (minor)
- Modify: `fuelsniffer/src/app/api/health/route.ts` (minor)
- Create: `fuelsniffer/src/__tests__/api-validation.test.ts`

- [ ] **Step 1: Audit each route for Zod validation**

Run:
```bash
grep -rn "safeParse\|ZodSchema\|z.object" fuelsniffer/src/app/api/ --include="*.ts"
```

Expected: matches in `prices/route.ts`, `prices/history/route.ts`, `search/route.ts`. The `health/route.ts` and `csp-report/route.ts` have no query params, so Zod validation is N/A.

- [ ] **Step 2: Verify error responses never leak stack traces**

Read each route's error handling. Confirm that on Zod validation failure, the response is `{ error: <field-level message> }` with status 400, and that no `catch` block returns `err.stack` or `err.message` from an unrelated error to the client.

- [ ] **Step 3: Write a validation smoke test**

Create `fuelsniffer/src/__tests__/api-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

/**
 * These tests validate that API routes reject invalid input with 400
 * and a field-level error message. They require a running dev server.
 * Skip in CI if no server is available.
 */
const BASE = process.env.TEST_API_BASE ?? 'http://localhost:4000'

describe('API input validation', () => {
  it('GET /api/prices without fuel returns 400', async () => {
    const res = await fetch(`${BASE}/api/prices`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('GET /api/prices with fuel=abc returns 400', async () => {
    const res = await fetch(`${BASE}/api/prices?fuel=abc`)
    expect(res.status).toBe(400)
  })

  it('GET /api/prices/history without station returns 400', async () => {
    const res = await fetch(`${BASE}/api/prices/history`)
    expect(res.status).toBe(400)
  })

  it('GET /api/search without q returns 400', async () => {
    const res = await fetch(`${BASE}/api/search`)
    expect(res.status).toBe(400)
  })

  it('GET /api/search with q=a (too short) returns 400', async () => {
    const res = await fetch(`${BASE}/api/search?q=a`)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 4: Run the test against a running dev server**

```bash
cd fuelsniffer && npm run dev &
sleep 5
TEST_API_BASE=http://localhost:4000 npx vitest run src/__tests__/api-validation.test.ts
kill %1
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add fuelsniffer/src/__tests__/api-validation.test.ts
git commit -m "test(api): input validation smoke tests for all API routes

Verifies that invalid input returns 400 with field-level error messages,
never stack traces. All routes already had Zod validation — this codifies
the contract.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Accessibility — contrast audit + palette fix

**Files:**
- Modify: `fuelsniffer/src/app/globals.css`
- Modify: any component files that use hardcoded grey values

- [ ] **Step 1: Install axe-core for automated scanning**

```bash
cd fuelsniffer && npm install -D @axe-core/cli
```

- [ ] **Step 2: Run an axe audit against the running app**

```bash
cd fuelsniffer && npm run dev &
sleep 5
npx @axe-core/cli http://localhost:4000/dashboard --exit
kill %1
```

Record every violation. The expected high-priority finding is contrast failures on light grey text against dark backgrounds.

- [ ] **Step 3: Fix the main body text colour**

Open `fuelsniffer/src/app/globals.css`. The current body text colour is `color: #ffffff` on `background: #111111` — that's fine (21:1 ratio). But components use lighter greys like `#8b949e`, `#6b7280`, `#9ca3af` that fail 4.5:1 on `#111111`.

Identify the failing greys by searching:

```bash
grep -rn "#8b949e\|#6b7280\|#9ca3af\|text-gray-400\|text-gray-500\|text-zinc-400\|text-zinc-500" fuelsniffer/src/ --include="*.tsx" --include="*.css"
```

For each match:
- `#8b949e` (contrast ~4.1:1 on #111) → replace with `#a1a9b1` (contrast ~5.1:1)
- `text-gray-400` / `text-zinc-400` → replace with `text-gray-300` / `text-zinc-300`
- `text-gray-500` / `text-zinc-500` → replace with `text-gray-400` / `text-zinc-400`

The principle: bump every sub-threshold grey up one step until it passes 4.5:1 on the app's dark background.

- [ ] **Step 4: Re-run axe to verify**

```bash
cd fuelsniffer && npm run dev &
sleep 5
npx @axe-core/cli http://localhost:4000/dashboard --exit
kill %1
```

Expected: zero contrast violations.

- [ ] **Step 5: User acceptance check**

Open the dashboard in a browser. Confirm the text is still visually "grey on dark" (not jarring white) but clearly readable. Screenshot for the acceptance checklist.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(a11y): contrast audit — bump all sub-4.5:1 greys

Replaces #8b949e with #a1a9b1 and shifts Tailwind gray/zinc utility
classes up one step where they fail WCAG AA 4.5:1 on the #111111
background. axe-core now reports zero contrast violations.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Accessibility — keyboard navigation + skip-link

**Files:**
- Modify: `fuelsniffer/src/app/layout.tsx`
- Modify: `fuelsniffer/src/app/globals.css`
- Modify: various components in `fuelsniffer/src/components/`

- [ ] **Step 1: Add skip-link to the root layout**

Open `fuelsniffer/src/app/layout.tsx`. Add a skip-link as the first child inside `<body>`:

```tsx
<body className="min-h-full flex flex-col">
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded focus:font-medium"
  >
    Skip to main content
  </a>
  {children}
</body>
```

Also add `id="main-content"` to the main content wrapper. Find the dashboard page component (`src/app/dashboard/page.tsx` or `DashboardClient.tsx`) and add `id="main-content"` to the outermost `<main>` or `<div>`.

While in `layout.tsx`, also:
- Update the `<html>` tag to confirm `lang="en"` is set (it already is — verify).
- Remove the placeholder Google Adsense `<Script>` tag (line 33-37) — it has a `REPLACE_WITH_YOUR_PUBLISHER_ID` placeholder and serves no purpose.
- Update the `metadata` to use the actual app name: `title: 'FuelSniffer'` and `description: 'Real-time Queensland and NSW fuel price tracker'`.

- [ ] **Step 2: Add visible focus ring styles**

Add to `fuelsniffer/src/app/globals.css`:

```css
/* Global focus ring — visible on all interactive elements */
*:focus-visible {
  outline: 2px solid #60a5fa;   /* Tailwind blue-400 */
  outline-offset: 2px;
  border-radius: 4px;
}

/* Skip-link styles (already handled via Tailwind utility classes in layout) */
```

- [ ] **Step 3: Keyboard-test the filter bar and station list**

Open the app in a browser. Tab through every interactive element:
1. Skip-link (first tab stop — verify it appears visually)
2. Location search input
3. Fuel select dropdown
4. Distance slider
5. Each station card in the list

Record every place where:
- Focus ring is invisible or too subtle → fix via the global `focus-visible` rule
- Tab order is illogical → fix via `tabIndex` adjustments
- An interactive element is unreachable via keyboard → fix by adding `tabIndex={0}` and keyboard event handlers

- [ ] **Step 4: Make the station list arrow-key navigable**

In `fuelsniffer/src/components/StationList.tsx` (or whichever component renders the list), add keyboard handling:

```tsx
const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = document.querySelector(`[data-station-index="${index + 1}"]`) as HTMLElement
    next?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = document.querySelector(`[data-station-index="${index - 1}"]`) as HTMLElement
    prev?.focus()
  }
}
```

Add `data-station-index={index}`, `tabIndex={0}`, and `onKeyDown={(e) => handleKeyDown(e, index)}` to each station card element.

- [ ] **Step 5: Run axe audit to confirm**

```bash
cd fuelsniffer && npm run dev &
sleep 5
npx @axe-core/cli http://localhost:4000/dashboard --exit
kill %1
```

Expected: zero violations related to keyboard or focus.

- [ ] **Step 6: User acceptance check**

1. Open dashboard in Chrome, unplug mouse, tab through every control.
2. Verify: skip-link works, focus ring visible on every interactive element, station list navigable with arrows, Enter on a station opens the detail panel.
3. Verify: no keyboard trap (can always tab away from any element).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(a11y): skip-link, focus rings, keyboard-navigable station list

Adds skip-to-content link as first focusable element, global
focus-visible ring on all interactive elements, arrow-key navigation
on the station list. axe-core zero violations.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Waitlist encryption plumbing

**Files:**
- Create: `fuelsniffer/src/lib/db/migrations/0010_waitlist_signups.sql`
- Modify: `fuelsniffer/src/lib/db/migrate.ts`
- Modify: `fuelsniffer/src/lib/db/schema.ts`
- Create: `fuelsniffer/src/lib/waitlist/encryption.ts`
- Create: `fuelsniffer/src/__tests__/waitlist-encryption.test.ts`

- [ ] **Step 1: Write the waitlist encryption tests**

Create `fuelsniffer/src/__tests__/waitlist-encryption.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'

// Set test env vars before importing the module
process.env.WAITLIST_EMAIL_AES_KEY = 'a'.repeat(64) // 32 bytes hex-encoded
process.env.WAITLIST_EMAIL_PEPPER = 'test-pepper-value-1234'

import { encryptEmail, decryptEmail, hashEmail } from '@/lib/waitlist/encryption'

describe('Waitlist email encryption', () => {
  it('round-trips: encrypt then decrypt returns original email', () => {
    const email = 'test@example.com'
    const encrypted = encryptEmail(email)
    const decrypted = decryptEmail(encrypted)
    expect(decrypted).toBe(email)
  })

  it('produces different ciphertext for each call (unique nonce)', () => {
    const email = 'test@example.com'
    const a = encryptEmail(email)
    const b = encryptEmail(email)
    expect(a).not.toEqual(b) // Different nonces → different ciphertext
  })

  it('hashEmail produces consistent output for the same email', () => {
    const email = 'Test@Example.COM'
    const a = hashEmail(email)
    const b = hashEmail(email)
    expect(a).toEqual(b)
  })

  it('hashEmail normalises case and whitespace', () => {
    const a = hashEmail('  Test@Example.COM  ')
    const b = hashEmail('test@example.com')
    expect(a).toEqual(b)
  })

  it('different emails produce different hashes', () => {
    const a = hashEmail('alice@example.com')
    const b = hashEmail('bob@example.com')
    expect(a).not.toEqual(b)
  })

  it('encrypted output is a Buffer', () => {
    const encrypted = encryptEmail('test@example.com')
    expect(encrypted).toBeInstanceOf(Buffer)
  })

  it('hash output is a Buffer', () => {
    const hash = hashEmail('test@example.com')
    expect(hash).toBeInstanceOf(Buffer)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd fuelsniffer && npx vitest run src/__tests__/waitlist-encryption.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the encryption module**

Create `fuelsniffer/src/lib/waitlist/encryption.ts`:

```typescript
/**
 * Waitlist email encryption and hashing.
 *
 * Emails are stored:
 * - **Encrypted** (AES-256-GCM) in `email_enc` for later retrieval
 * - **Hashed** (SHA-256 with pepper) in `email_hash` for duplicate detection
 *
 * Encryption format: nonce(12 bytes) || ciphertext || auth_tag(16 bytes)
 * The nonce is generated fresh on every encryption call via crypto.randomBytes(12).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

function getAesKey(): Buffer {
  const hex = process.env.WAITLIST_EMAIL_AES_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'WAITLIST_EMAIL_AES_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    )
  }
  return Buffer.from(hex, 'hex')
}

function getPepper(): string {
  const pepper = process.env.WAITLIST_EMAIL_PEPPER
  if (!pepper || pepper.length < 16) {
    throw new Error(
      'WAITLIST_EMAIL_PEPPER must be at least 16 characters. ' +
      'Generate with: openssl rand -base64 24'
    )
  }
  return pepper
}

/**
 * Encrypt an email address with AES-256-GCM.
 * Returns: Buffer of nonce(12) + ciphertext + authTag(16)
 */
export function encryptEmail(email: string): Buffer {
  const key = getAesKey()
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)

  const encrypted = Buffer.concat([
    cipher.update(email, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([nonce, encrypted, authTag])
}

/**
 * Decrypt an email address from the format produced by encryptEmail.
 */
export function decryptEmail(blob: Buffer): string {
  const key = getAesKey()
  const nonce = blob.subarray(0, 12)
  const authTag = blob.subarray(blob.length - 16)
  const ciphertext = blob.subarray(12, blob.length - 16)

  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * Hash an email for duplicate detection.
 * Normalises to lowercase + trimmed before hashing.
 * Uses SHA-256 with a pepper so the hash is not reversible via rainbow table.
 */
export function hashEmail(email: string): Buffer {
  const normalised = email.toLowerCase().trim()
  const pepper = getPepper()
  return createHash('sha256')
    .update(normalised + pepper)
    .digest()
}
```

- [ ] **Step 4: Run the tests**

```bash
cd fuelsniffer && npx vitest run src/__tests__/waitlist-encryption.test.ts
```

Expected: 7 passing tests.

- [ ] **Step 5: Write the waitlist_signups migration**

Create `fuelsniffer/src/lib/db/migrations/0010_waitlist_signups.sql`:

```sql
-- Migration 0010: Waitlist signups table
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id           BIGSERIAL PRIMARY KEY,
  email_hash   BYTEA NOT NULL,
  email_enc    BYTEA NOT NULL,
  source       VARCHAR(32) NOT NULL,
  consent_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash      BYTEA,
  ua_hash      BYTEA,
  CONSTRAINT waitlist_signups_email_hash_uniq UNIQUE (email_hash)
);
```

Add `'0010_waitlist_signups.sql'` to the migration runner file list.

- [ ] **Step 6: Add the Drizzle schema type**

Add to `fuelsniffer/src/lib/db/schema.ts`:

```typescript
export const waitlistSignups = pgTable('waitlist_signups', {
  id:         serial('id').primaryKey(),
  emailHash:  text('email_hash').notNull(),
  emailEnc:   text('email_enc').notNull(),
  source:     text('source').notNull(),
  consentAt:  timestamp('consent_at', { withTimezone: true }).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  ipHash:     text('ip_hash'),
  uaHash:     text('ua_hash'),
})

export type WaitlistSignup = typeof waitlistSignups.$inferSelect
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert
```

Note: Drizzle maps `BYTEA` columns as `text` for simplicity — we'll store the Buffer as a hex string. This matches the existing Drizzle pattern in the codebase.

- [ ] **Step 7: Run the migration**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
```

Expected: `All migrations applied successfully.`

- [ ] **Step 8: Run the full test suite and type-check**

```bash
cd fuelsniffer && npx vitest run && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 9: Add environment variable documentation**

Add `WAITLIST_EMAIL_AES_KEY` and `WAITLIST_EMAIL_PEPPER` to `fuelsniffer/.env.example`:

```
# Waitlist encryption (Phase 1 — generate with: openssl rand -hex 32)
WAITLIST_EMAIL_AES_KEY=
# Waitlist hash pepper (Phase 1 — generate with: openssl rand -base64 24)
WAITLIST_EMAIL_PEPPER=
```

- [ ] **Step 10: Commit**

```bash
git add fuelsniffer/src/lib/waitlist/encryption.ts \
        fuelsniffer/src/lib/db/migrations/0010_waitlist_signups.sql \
        fuelsniffer/src/lib/db/migrate.ts \
        fuelsniffer/src/lib/db/schema.ts \
        fuelsniffer/src/__tests__/waitlist-encryption.test.ts \
        fuelsniffer/.env.example
git commit -m "feat(waitlist): encryption plumbing + signups table

AES-256-GCM email encryption with random 12-byte nonce, SHA-256
pepper-hashed email for duplicate detection. Schema only — no API
route or UI yet (Phase 3). Nonce is prepended to ciphertext blob.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12 (stretch): NSW FuelCheck integration

> **Note:** This is the largest task in Phase 1. It depends on having NSW FuelCheck API credentials. If credentials are not yet available when work begins, skip this task and proceed with Tasks 1-11 — the provider abstraction is proven by QLD running through it, and NSW can be added at any point without disrupting other Phase 1 work.

**Files:**
- Create: `fuelsniffer/src/lib/providers/fuel/nsw/index.ts`
- Create: `fuelsniffer/src/lib/providers/fuel/nsw/client.ts`
- Create: `fuelsniffer/src/lib/providers/fuel/nsw/normaliser.ts`
- Create: `fuelsniffer/src/__tests__/nsw-provider.test.ts`
- Modify: `fuelsniffer/src/lib/scraper/scheduler.ts` (register NSW provider)

This task requires an API spike first — the NSW FuelCheck API documentation should be read before starting. The provider interface is already defined; the work is: build the client, build the normaliser, register the provider.

- [ ] **Step 1: Spike the NSW FuelCheck API**

Read the NSW FuelCheck API documentation. Determine:
- Base URL (likely `https://api.onegov.nsw.gov.au/FuelPriceCheck/v2/`)
- Auth method (OAuth2 via `apikey` + `transactionid` headers, or client-credentials grant)
- Endpoints for stations and prices
- Response format — field names, price encoding, date format
- Rate limits

Document findings in a comment at the top of `nsw/client.ts`.

- [ ] **Step 2: Write fixture-based tests**

Create `fuelsniffer/src/__tests__/nsw-provider.test.ts` with tests that validate the normaliser against recorded fixture JSON files. The fixtures should be real responses captured during the spike, committed to `fuelsniffer/src/lib/providers/fuel/nsw/__tests__/fixtures/`.

- [ ] **Step 3: Implement the NSW client**

> **Note for executing agent:** This step does NOT have inline code because the API response format depends on the spike in Step 1. You must write the code yourself after reading the API docs. Follow the QLD client (`src/lib/providers/fuel/qld/client.ts`) as a structural template — same patterns, different field names.

Create `fuelsniffer/src/lib/providers/fuel/nsw/client.ts` following the same pattern as `qld/client.ts`:
- Zod schemas for API responses (field names will differ — map them from the spike findings)
- `createNswApiClient()` factory function
- `fetchWithRetry` (reuse from QLD or extract to a shared util)

- [ ] **Step 4: Implement the NSW normaliser**

> **Note for executing agent:** Same as Step 3 — write the code yourself based on the spike findings. Use `qld/normaliser.ts` as the structural template.

Create `fuelsniffer/src/lib/providers/fuel/nsw/normaliser.ts`:
- `normaliseNswStation()` mapping NSW fields to `NormalisedStation`
- `normaliseNswPrice()` mapping NSW fields to `NormalisedPrice`
- Station IDs use `nextval('stations_nsw_id_seq')` via a Postgres query for new stations; existing NSW stations are looked up by `(source_provider='nsw', external_id=<nsw_station_code>)`
- Call `normaliseBrand()` from the shared brand normaliser on every station

- [ ] **Step 5: Implement the NSW provider class**

Create `fuelsniffer/src/lib/providers/fuel/nsw/index.ts`:

```typescript
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'
// ... implementation following the same pattern as QldFuelProvider
export class NswFuelProvider implements FuelPriceProvider {
  readonly id = 'nsw'
  readonly displayName = 'NSW FuelCheck API'
  // ...
}
```

- [ ] **Step 6: Register the NSW provider in the scheduler**

In `fuelsniffer/src/lib/scraper/scheduler.ts`, add:

```typescript
import { NswFuelProvider } from '@/lib/providers/fuel/nsw'
// Inside startScheduler():
registerProvider(new NswFuelProvider())
```

- [ ] **Step 7: Run all tests**

```bash
cd fuelsniffer && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 8: User acceptance check**

1. Start dev server and wait for scrape to complete.
2. Console should show: `[scheduler] Registered 2 provider(s): qld, nsw`
3. Console should show: `[scraper:nsw] OK — X stations, Y new prices`
4. Query: `http://localhost:4000/api/search?q=sydney` — should return NSW stations.
5. Query stations table: `SELECT source_provider, COUNT(*) FROM stations GROUP BY source_provider` — should show both `qld` and `nsw`.

- [ ] **Step 9: Cross-border verification**

Query for stations near Tweed Heads (on the QLD/NSW border):

```bash
curl "http://localhost:4000/api/prices?fuel=2&lat=-28.18&lng=153.54&radius=20"
```

Expected: stations from both QLD and NSW in the response.

- [ ] **Step 10: Commit**

```bash
git add fuelsniffer/src/lib/providers/fuel/nsw/ \
        fuelsniffer/src/lib/scraper/scheduler.ts \
        fuelsniffer/src/__tests__/nsw-provider.test.ts
git commit -m "feat(providers): NSW FuelCheck integration

Second state on the provider abstraction. OAuth2 auth, station + price
fetch, normaliser with brand aliases. Cross-border search verified at
Tweed Heads.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 1 Definition of Done (verify before closing Phase 1)

Run through this checklist after all tasks are complete:

- [ ] Provider registry exists; QLD runs through it; NSW runs through it (or NSW is explicitly deferred with a tracked ticket)
- [ ] `source_provider` populated on every row in `stations` and `price_readings`
- [ ] Brand normalisation tested against at least 20 real brand strings
- [ ] PostGIS extension enabled and verified (`SELECT postgis_version()` returns)
- [ ] `securityheaders.com` scan returns grade A or better (run against the deployed URL)
- [ ] CSP reports flowing into `csp_violations` table without legitimate traffic triggering violations
- [ ] All rate limits verified (manual curl test: 120/min for prices, 30/min for health, etc.)
- [ ] All API routes have Zod validation (verified via `api-validation.test.ts`)
- [ ] `axe-core` returns zero violations on `/dashboard`
- [ ] Every colour in the app passes 4.5:1 contrast
- [ ] Keyboard-only user can reach every control on the dashboard
- [ ] Skip-link works (visible on focus, jumps to main content)
- [ ] Waitlist encryption helpers exist with passing round-trip tests
- [ ] `npx vitest run` — all green
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm audit` — zero highs/criticals
- [ ] Every task in Phase 1 has a git commit with passing tests
