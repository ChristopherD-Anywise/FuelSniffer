---
phase: 01-data-pipeline
verified: 2026-03-23T08:51:00Z
status: passed
score: 18/18 must-haves verified
re_verification: false
---

# Phase 1: Data Pipeline Verification Report

**Phase Goal:** Clean, correctly-encoded fuel price data flows into TimescaleDB every 15 minutes with health monitoring
**Verified:** 2026-03-23T08:51:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Scraper polls QLD API every 15 minutes via node-cron | VERIFIED | `scheduler.ts`: `cron.schedule('*/15 * * * *', ...)` with `noOverlap: true` and `timezone: 'Australia/Brisbane'` |
| 2 | Scraper runs immediately on process start (D-11) | VERIFIED | `scheduler.ts` calls `runScrapeJob()` before `cron.schedule()` at line 18 |
| 3 | Price values are correctly encoded (rawToPrice: 1459 → 145.9) | VERIFIED | `normaliser.ts` exports `rawToPrice(raw) { return raw / 10 }` with 50–400 range guard; 18 passing tests |
| 4 | Timestamps stored as UTC (TIMESTAMPTZ) | VERIFIED | All timestamp columns in `0000_schema.sql` use `TIMESTAMPTZ`; Drizzle schema uses `withTimezone: true` on all 4 timestamp columns |
| 5 | price_readings is a TimescaleDB hypertable | VERIFIED | `0001_hypertable.sql`: `SELECT create_hypertable('price_readings', 'recorded_at')` |
| 6 | Hourly continuous aggregate materialises automatically | VERIFIED | `0002_cagg.sql`: `CREATE MATERIALIZED VIEW hourly_prices WITH (timescaledb.continuous)` with `schedule_interval => INTERVAL '1 hour'` |
| 7 | Raw 15-minute rows deleted after 7 days | VERIFIED | `0002_cagg.sql`: `SELECT add_retention_policy('price_readings', INTERVAL '7 days')` |
| 8 | Every scrape cycle writes a scrape_health row (success or failure) | VERIFIED | `writer.ts`: `db.insert(scrapeHealth)` in both the try block (success) and catch block (failure); 5 passing scraper tests |
| 9 | healthchecks.io ping fires only on success (dead-man's-switch) | VERIFIED | `writer.ts`: `pingHealthchecks()` at line 116 in the try block; absent from catch block |
| 10 | GET /api/health returns status, last_scrape_at, minutes_ago, prices_last_run | VERIFIED | `route.ts`: `buildHealthResponse()` returns exactly those 4 fields; 7 passing health tests confirm shape |
| 11 | API authentication uses FPDAPI SubscriberToken format | VERIFIED | `client.ts`: `buildAuthHeader(token)` returns `'FPDAPI SubscriberToken=${token}'`; 9 passing api-client tests |
| 12 | fetchWithRetry retries exactly 3 times on persistent failure | VERIFIED | `client.ts`: loop `for (let attempt = 1; attempt <= retries; attempt++)` with default `retries = 3`; test confirms callCount === 3 |
| 13 | QLD_API_TOKEN is never hardcoded — env var only | VERIFIED | No literal token values found in any source file; `createApiClient()` throws if `process.env.QLD_API_TOKEN` is absent |
| 14 | .env is gitignored | VERIFIED | `.gitignore` contains `^\.env$` |
| 15 | Scheduler starts only in Node.js runtime (not Edge) | VERIFIED | `instrumentation.ts`: `if (process.env.NEXT_RUNTIME === 'nodejs')` guard before `startScheduler()` |
| 16 | Brisbane timezone used (no DST — never Australia/Sydney) | VERIFIED | `normaliser.ts` uses `timeZone: 'Australia/Brisbane'` via `Intl.DateTimeFormat`; `Australia/Sydney` appears only in a warning comment |
| 17 | Stations filtered to 50km of North Lakes at ingest | VERIFIED | `normaliser.ts`: `isWithinRadius()` using haversine from `NORTH_LAKES_LAT = -27.2353`; applied in `normaliseStation()` and price filtering in `writer.ts` |
| 18 | All 4 vitest test suites pass with 39 tests GREEN | VERIFIED | `npx vitest run` exits 0: 4 files, 39 tests, 0 failures (confirmed live run) |

**Score:** 18/18 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `fuelsniffer/docker-compose.yml` | TimescaleDB service pinned to 2.24.0-pg17 | VERIFIED | Contains `timescale/timescaledb:2.24.0-pg17`, `TZ: Australia/Brisbane`, `QLD_API_TOKEN: ${QLD_API_TOKEN}` |
| `fuelsniffer/.env.example` | Documents all required secrets | VERIFIED | Contains `QLD_API_TOKEN`, `HEALTHCHECKS_PING_URL`, `DATABASE_URL`, `DB_PASSWORD` |
| `fuelsniffer/.gitignore` | .env blocked from git | VERIFIED | Line `^\.env$` present |
| `fuelsniffer/vitest.config.ts` | vitest with node env and @/* alias | VERIFIED | Exists, exports `default` config |
| `fuelsniffer/src/lib/db/schema.ts` | Drizzle schema for stations, price_readings, scrape_health | VERIFIED | Exports all 3 tables and 6 type aliases; `price_cents` uses `NUMERIC(6,1)`; all timestamps `withTimezone: true` |
| `fuelsniffer/src/lib/db/client.ts` | Drizzle singleton using postgres driver | VERIFIED | Exports `db`; throws on missing `DATABASE_URL`; uses `postgres` not `pg` |
| `fuelsniffer/src/lib/db/migrations/0000_schema.sql` | CREATE TABLE DDL | VERIFIED | Contains `CREATE TABLE stations`, `price_readings`, `scrape_health`; all timestamps `TIMESTAMPTZ` |
| `fuelsniffer/src/lib/db/migrations/0001_hypertable.sql` | hypertable + index DDL | VERIFIED | Contains `create_hypertable` and composite index on `(station_id, fuel_type_id, recorded_at DESC)` |
| `fuelsniffer/src/lib/db/migrations/0002_cagg.sql` | Continuous aggregate + retention + refresh policies | VERIFIED | Contains `add_retention_policy`, `INTERVAL '7 days'`, `FROM price_readings`, `schedule_interval => INTERVAL '1 hour'` |
| `fuelsniffer/src/lib/scraper/normaliser.ts` | rawToPrice, isWithinRadius, normaliseStation, normalisePrice | VERIFIED | Exports all 5 required functions; uses `Australia/Brisbane`; `MAX_RADIUS_KM = 50` |
| `fuelsniffer/src/lib/scraper/client.ts` | QLD API HTTP client with auth, retry, Zod validation | VERIFIED | Exports `buildAuthHeader`, `fetchWithRetry`, `createApiClient`, `GetSitesPricesResponseSchema` |
| `fuelsniffer/src/lib/scraper/writer.ts` | runScrapeJob(), shouldInsertRow() | VERIFIED | Both exported; imports from `@/lib/db/client` and normaliser; healthchecks ping in success path only |
| `fuelsniffer/src/lib/scraper/scheduler.ts` | node-cron v4 scheduler with 15-min cadence | VERIFIED | `*/15 * * * *`, `noOverlap: true`, `timezone: 'Australia/Brisbane'`, immediate start before `cron.schedule()` |
| `fuelsniffer/src/instrumentation.ts` | Next.js hook starts scheduler in Node.js runtime | VERIFIED | Contains `register()`, `NEXT_RUNTIME === 'nodejs'` guard, dynamic `import('./lib/scraper/scheduler')` |
| `fuelsniffer/src/app/api/health/route.ts` | GET /api/health endpoint | VERIFIED | Exports `GET` and `buildHealthResponse`; queries `scrapeHealth` with `desc(scrapeHealth.scrapedAt)`; returns 503 for degraded |
| `fuelsniffer/src/__tests__/normaliser.test.ts` | 18 passing normaliser tests | VERIFIED | GREEN — rawToPrice, toBrisbaneHour, isWithinRadius, normaliseStation, normalisePrice all tested |
| `fuelsniffer/src/__tests__/api-client.test.ts` | 9 passing API client tests | VERIFIED | GREEN — buildAuthHeader, createApiClient, fetchWithRetry, Zod schemas all tested |
| `fuelsniffer/src/__tests__/scraper.test.ts` | 5 passing scraper tests | VERIFIED | GREEN — shouldInsertRow and runScrapeJob mocked integration tests |
| `fuelsniffer/src/__tests__/health.test.ts` | 7 passing health tests | VERIFIED | GREEN — buildHealthResponse unit tests with fake timers |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `docker-compose.yml` app service | timescaledb service | `DATABASE_URL: postgresql://...@timescaledb:5432/fuelsniffer` | VERIFIED | Pattern `DATABASE_URL.*timescaledb.*5432` confirmed |
| `.env.example` | `.gitignore` | `.env` listed in gitignore | VERIFIED | Pattern `^\.env$` confirmed in `.gitignore` |
| `src/lib/db/client.ts` | `process.env.DATABASE_URL` | postgres() connection string | VERIFIED | Both `if (!process.env.DATABASE_URL)` guard and `postgres(process.env.DATABASE_URL)` found |
| `0002_cagg.sql` | price_readings hypertable | continuous aggregate on recorded_at | VERIFIED | `FROM price_readings` found in cagg SELECT |
| `src/lib/scraper/client.ts` | `process.env.QLD_API_TOKEN` | Authorization header injection | VERIFIED | `FPDAPI SubscriberToken=${token}` returned by `buildAuthHeader`; `createApiClient` throws on missing token |
| `src/lib/scraper/normaliser.ts` | rawToPrice | called for every Price field in API response | VERIFIED | `rawToPrice` used inside `normalisePrice()` which is called per SitePrice record in `writer.ts` |
| `src/instrumentation.ts` | `src/lib/scraper/scheduler.ts` | dynamic import inside NEXT_RUNTIME guard | VERIFIED | `startScheduler` imported and called inside `if (process.env.NEXT_RUNTIME === 'nodejs')` |
| `src/lib/scraper/writer.ts` | `src/lib/db/client.ts` | db.insert() for price_readings and scrape_health | VERIFIED | `import { db } from '@/lib/db/client'` and `db.insert(scrapeHealth)` / `db.insert(priceReadings)` confirmed |
| `src/lib/scraper/writer.ts` | `HEALTHCHECKS_PING_URL` | pingHealthchecks() called only on success | VERIFIED | `pingHealthchecks()` at line 116 in try block; absent from catch block |
| `src/app/api/health/route.ts` | `src/lib/db/client.ts` | Drizzle select from scrape_health | VERIFIED | `import { db } from '@/lib/db/client'` and `db.select().from(scrapeHealth).orderBy(desc(scrapeHealth.scrapedAt))` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-01 | 01-01, 01-03 | System registers with QLD Fuel Price API and authenticates via subscriber token | SATISFIED | `createApiClient()` injects `FPDAPI SubscriberToken` header; throws on missing `QLD_API_TOKEN`; 9 passing tests |
| DATA-02 | 01-03, 01-04 | Scraper polls QLD API every 15 minutes and stores prices for all fuel types | SATISFIED | node-cron `*/15 * * * *` in `scheduler.ts`; writer fetches and inserts all fuel types from `SitePrices` array without fuel-type filtering |
| DATA-03 | 01-04 | Scraper health monitoring with heartbeat checks and failure alerts | SATISFIED | `scrape_health` row written on every cycle (success and failure); healthchecks.io dead-man's-switch; `GET /api/health` returns status/degraded; 7 passing health tests |
| DATA-04 | 01-02 | Today's data stored at 15-minute intervals | SATISFIED | `price_readings` hypertable (`0001_hypertable.sql`); `price_cents` stored as `NUMERIC(6,1)` after `rawToPrice()` conversion; D-09 always-insert policy in `shouldInsertRow()` |
| DATA-05 | 01-02 | Historical data automatically rolled up to hourly intervals | SATISFIED | `hourly_prices` continuous aggregate in `0002_cagg.sql` with 1-hour `schedule_interval`; 7-day retention policy on raw rows |

All 5 phase requirements: DATA-01 through DATA-05 — SATISFIED.

No orphaned requirements detected. REQUIREMENTS.md traceability table maps all 5 IDs to Phase 1 with status "Complete".

---

### Anti-Patterns Found

None detected.

- No hardcoded API tokens in source files
- No `TODO`, `FIXME`, `PLACEHOLDER`, or `not implemented` comments in production source
- No stub return values (`return {}`, `return []`, `return null`) that reach user-visible output — the two `return null` cases in `normaliser.ts` are documented filter/error-guard patterns (station outside radius, invalid price encoding)
- No `Australia/Sydney` timezone in functional code (one occurrence is a warning comment explicitly saying to NOT use it)
- No inline `/ 10` price division outside `rawToPrice()`

---

### Human Verification Required

The following items cannot be verified programmatically and should be confirmed once the service is running:

#### 1. Live database migration applies correctly

**Test:** Start TimescaleDB via `docker compose up -d timescaledb`, then run `DATABASE_URL=... npx tsx src/lib/db/migrate.ts`
**Expected:** All 3 migrations apply without error; `price_readings` appears as a hypertable in `timescaledb_information.hypertables`; `hourly_prices` appears in `timescaledb_information.continuous_aggregates`; retention policy appears in `timescaledb_information.jobs`
**Why human:** Cannot run a live TimescaleDB instance in static analysis

#### 2. Live scrape cycle end-to-end

**Test:** Set `QLD_API_TOKEN` to a real token, run `next start`, wait for the immediate startup scrape, then check `scrape_health` table has a row and `price_readings` has rows
**Expected:** `scrape_health` shows `error = null`, `prices_upserted > 0`; `price_readings` rows have `price_cents` values in the 100–250 range (not raw integers 1000–2500)
**Why human:** Requires live QLD API credentials and a running TimescaleDB instance

#### 3. GET /api/health live response

**Test:** After a successful scrape cycle, `curl http://localhost:3000/api/health`
**Expected:** `{"status":"ok","last_scrape_at":"...","minutes_ago":0,"prices_last_run":N}` with HTTP 200
**Why human:** Requires live database with data

#### 4. Dead-man's-switch behaviour

**Test:** Set `HEALTHCHECKS_PING_URL` to a healthchecks.io check URL, trigger a scrape failure (e.g. invalid token), verify healthchecks.io does NOT receive a ping; then fix the token and confirm a ping arrives
**Expected:** healthchecks.io fires an alert after the grace period (5 min) following a failed scrape
**Why human:** Requires live healthchecks.io account and observable external service behaviour

---

### Summary

Phase 1 goal is fully achieved in the codebase. The four plans delivered:

- **Plan 01:** Project scaffold with TimescaleDB Docker Compose, all dependencies, vitest configured
- **Plan 02:** Complete database schema (3 tables, hypertable, continuous aggregate, 7-day retention) and Drizzle ORM client
- **Plan 03:** QLD API HTTP client (auth, retry, Zod validation) and price normaliser (rawToPrice, haversine, Brisbane timezone)
- **Plan 04:** Scrape writer orchestrating the full cycle, node-cron scheduler, Next.js instrumentation hook, and `/api/health` endpoint

All 5 requirements (DATA-01 through DATA-05) are satisfied by concrete, wired, tested code. The pipeline is structurally complete — data will flow from the QLD API into TimescaleDB every 15 minutes once a live API token and running database are provided. The 4 human verification items are standard deployment validation steps, not gaps in the implementation.

**39 tests pass. No stubs. No broken wiring.**

---

_Verified: 2026-03-23T08:51:00Z_
_Verifier: Claude (gsd-verifier)_
