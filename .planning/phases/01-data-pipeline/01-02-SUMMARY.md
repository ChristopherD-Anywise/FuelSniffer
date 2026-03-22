---
phase: 01-data-pipeline
plan: 02
subsystem: database
tags: [timescaledb, drizzle, schema, migrations, hypertable, continuous-aggregate]
dependency_graph:
  requires: [01-01]
  provides: [db-schema, db-client, sql-migrations]
  affects: [01-03, 01-04]
tech_stack:
  added: [drizzle-orm, postgres-js-driver, drizzle-kit]
  patterns: [drizzle-singleton-client, manual-timescaledb-migrations, esm-import-meta-url]
key_files:
  created:
    - fuelsniffer/src/lib/db/schema.ts
    - fuelsniffer/src/lib/db/client.ts
    - fuelsniffer/src/lib/db/migrate.ts
    - fuelsniffer/src/lib/db/migrations/0000_schema.sql
    - fuelsniffer/src/lib/db/migrations/0001_hypertable.sql
    - fuelsniffer/src/lib/db/migrations/0002_cagg.sql
    - fuelsniffer/drizzle.config.ts
    - fuelsniffer/src/lib/db/README.md
  modified: []
decisions:
  - "Used import.meta.url + fileURLToPath instead of __dirname in migrate.ts for ESM compatibility with tsconfig moduleResolution:bundler"
  - "migrate.ts applies all three SQL files sequentially — Drizzle Kit not used for TimescaleDB-specific DDL"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_created: 8
  files_modified: 0
---

# Phase 1 Plan 2: Database Schema and Migrations Summary

**One-liner:** TimescaleDB schema with Drizzle ORM client, three-file SQL migration sequence (tables, hypertable, cagg + 7-day retention), and tsx-runnable migration runner.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Drizzle schema and db client | a45bfcf | schema.ts, client.ts, drizzle.config.ts |
| 2 | Write SQL migration files and migration runner | 3f83995 | 0000_schema.sql, 0001_hypertable.sql, 0002_cagg.sql, migrate.ts, README.md |

## What Was Built

### Drizzle TypeScript Schema (`schema.ts`)

Three tables defined with Drizzle ORM:

- **stations** — QLD API site metadata. `is_active` boolean for soft-delete (D-05). `last_seen_at` as TIMESTAMPTZ.
- **price_readings** — 15-minute price rows. `price_cents` as `NUMERIC(6,1)` (stored as 145.9, not 1459). `source_ts` captures `TransactionDateUtc` from the API. Marked with note that it must be converted to a hypertable via SQL migration.
- **scrape_health** — one row per scrape cycle. `error = NULL` means success (D-03 health monitoring).

All six TypeScript types exported: `Station`, `NewStation`, `PriceReading`, `NewPriceReading`, `ScrapeHealth`, `NewScrapeHealth`.

### Drizzle Client (`client.ts`)

Singleton using `postgres` npm package (not `pg`). Validates `DATABASE_URL` at module load time — throws immediately if not set, preventing silent misconfiguration.

### SQL Migrations

Three files applied in sequence by `migrate.ts`:

1. **0000_schema.sql** — `CREATE TABLE IF NOT EXISTS` for all three tables with TIMESTAMPTZ everywhere.
2. **0001_hypertable.sql** — `create_hypertable('price_readings', 'recorded_at')` + composite index `(station_id, fuel_type_id, recorded_at DESC)` for dashboard queries.
3. **0002_cagg.sql** — `hourly_prices` continuous aggregate with `time_bucket('1 hour', recorded_at)`, refresh policy (hourly, 2h start offset), and **7-day retention policy on `price_readings`** (D-04 locked decision).

### Migration Runner (`migrate.ts`)

Applies all three SQL files sequentially via `postgres` driver's `sql.unsafe()`. Uses `import.meta.url` + `fileURLToPath` for ESM-compatible path resolution (required by Next.js tsconfig `moduleResolution: bundler`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESM-compatible __dirname in migrate.ts**
- **Found during:** Task 2
- **Issue:** The plan's `migrate.ts` template used `__dirname` which is not available in ESM modules. The project's tsconfig uses `"module": "esnext"` and `"moduleResolution": "bundler"` for Next.js 16 compatibility. `tsx` runs scripts as ESM.
- **Fix:** Replaced `__dirname` with `fileURLToPath(import.meta.url)` + `path.dirname()`. Added `import { fileURLToPath } from 'url'`.
- **Files modified:** `fuelsniffer/src/lib/db/migrate.ts`
- **Commit:** 3f83995

## Must-Have Verification

| Truth | Status |
|-------|--------|
| price_readings table is a TimescaleDB hypertable | SQL in 0001_hypertable.sql — applied at migration time |
| price_cents stored as 100.0–250.0 range (NUMERIC(6,1)) | Confirmed — schema uses `numeric` with precision:6, scale:1 |
| hourly_prices continuous aggregate materialises automatically | 0002_cagg.sql sets 1-hour schedule_interval |
| Raw 15-minute rows deleted after 7 days | add_retention_policy('price_readings', INTERVAL '7 days') in 0002_cagg.sql |
| All timestamps use TIMESTAMPTZ (UTC storage) | All timestamp columns use `{ withTimezone: true }` in Drizzle; TIMESTAMPTZ in SQL |

## Known Stubs

None — all schema definitions are complete and production-ready. The migrations cannot be executed until TimescaleDB is running (set up in Plan 01), but the SQL and TypeScript code is fully wired.

## Self-Check: PASSED

- [x] `fuelsniffer/src/lib/db/schema.ts` — exists, exports stations/priceReadings/scrapeHealth
- [x] `fuelsniffer/src/lib/db/client.ts` — exists, uses postgres driver, validates DATABASE_URL
- [x] `fuelsniffer/src/lib/db/migrate.ts` — exists, ESM-compatible
- [x] `fuelsniffer/src/lib/db/migrations/0000_schema.sql` — exists, contains CREATE TABLE stations
- [x] `fuelsniffer/src/lib/db/migrations/0001_hypertable.sql` — exists, contains create_hypertable
- [x] `fuelsniffer/src/lib/db/migrations/0002_cagg.sql` — exists, contains add_retention_policy
- [x] `fuelsniffer/drizzle.config.ts` — exists, points to correct schema path
- [x] `fuelsniffer/src/lib/db/README.md` — exists
- [x] Commit a45bfcf — confirmed in git log
- [x] Commit 3f83995 — confirmed in git log
- [x] `npx tsc --noEmit` — exits 0, no TypeScript errors
