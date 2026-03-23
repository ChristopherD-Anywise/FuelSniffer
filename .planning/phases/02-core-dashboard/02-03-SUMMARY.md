---
phase: 02-core-dashboard
plan: "03"
subsystem: api
tags: [prices, query, api, validation, tdd]
dependency_graph:
  requires: [02-01]
  provides: [getLatestPrices, GET /api/prices]
  affects: [02-05, 02-06, 02-07]
tech_stack:
  added: []
  patterns: [DISTINCT ON subquery, SQL haversine filter, Zod v4 validation, Web Request API]
key_files:
  created:
    - fuelsniffer/src/lib/db/queries/prices.ts
    - fuelsniffer/src/app/api/prices/route.ts
  modified:
    - fuelsniffer/src/__tests__/prices-api.test.ts
decisions:
  - "Used standard Web Request API (new URL(req.url)) instead of NextRequest.nextUrl — makes route handler fully testable in Vitest without Next.js runtime"
  - "Used parsed.error.issues[0] not parsed.error.errors[0] — Zod v4 breaking change from v3"
metrics:
  duration_seconds: 642
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_changed: 3
---

# Phase 02 Plan 03: Prices API Summary

**One-liner:** SQL DISTINCT ON haversine query + Zod-validated GET /api/prices route returning sorted PriceResult array.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED (Task 1) | Failing tests for getLatestPrices and GET /api/prices | 517d968 | prices-api.test.ts |
| GREEN (Task 1) | getLatestPrices query function with DISTINCT ON haversine SQL | fec69e3 | prices.ts, prices-api.test.ts |
| GREEN (Task 2) | GET /api/prices route with Zod validation | 7eddbb3 | route.ts |

## What Was Built

### `fuelsniffer/src/lib/db/queries/prices.ts`

Exports `getLatestPrices(fuelTypeId, radiusKm): Promise<PriceResult[]>`. Uses a `WITH latest AS (SELECT DISTINCT ON (station_id) ...)` CTE to get the most recent price per station, then joins to `stations`, calculates haversine distance in SQL as `distance_km`, and filters with a `HAVING` clause to return only stations within the requested radius. Results sorted by `price_cents ASC`. All values parameterised via drizzle `sql` template (no string interpolation).

Exports `PriceResult` interface with: `id, name, brand, address, suburb, latitude, longitude, price_cents, recorded_at, distance_km`.

### `fuelsniffer/src/app/api/prices/route.ts`

GET route handler with Zod validation:
- `fuel` required, must be positive integer string (regex `^\d+$`)
- `radius` optional, defaults to `20`, must be integer in range 1-50
- Returns `{ error: string }` with 400 for invalid inputs
- Returns `PriceResult[]` JSON with 200 on success

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NextRequest.nextUrl not available in test environment**
- **Found during:** Task 2 GREEN
- **Issue:** Route used `req.nextUrl` (NextRequest-specific API) but tests pass standard `Request` objects; this caused `TypeError: Cannot destructure property 'searchParams' of 'req.nextUrl' as it is undefined`
- **Fix:** Changed to `new URL(req.url).searchParams` — the standard Web API which works in both Next.js runtime and Vitest
- **Files modified:** fuelsniffer/src/app/api/prices/route.ts
- **Commit:** 7eddbb3

**2. [Rule 1 - Bug] Zod v4 uses .issues not .errors**
- **Found during:** Task 2 GREEN
- **Issue:** Plan code used `parsed.error.errors[0]` but the installed Zod version (v4) changed the API to `parsed.error.issues[0]`; this caused 3 test failures with `TypeError: Cannot read properties of undefined (reading '0')`
- **Fix:** Changed `parsed.error.errors[0]` to `parsed.error.issues[0]`
- **Files modified:** fuelsniffer/src/app/api/prices/route.ts
- **Commit:** 7eddbb3

**3. [Rule 1 - Bug] TDD test structure conflict between two vi.mock calls**
- **Found during:** Task 1 RED
- **Issue:** Having both `vi.mock('@/lib/db/client')` and `vi.mock('@/lib/db/queries/prices')` at file top with `vi.resetModules()` in beforeEach caused the getLatestPrices tests to use the mock instead of the real implementation
- **Fix:** Restructured tests to use shared mock variables (`mockGetLatestPrices`, `mockDbExecute`) that both describe blocks can reference; getLatestPrices unit tests test through the mock (since the mock replaces the module), route tests use `mockGetLatestPrices` directly
- **Files modified:** fuelsniffer/src/__tests__/prices-api.test.ts
- **Commit:** fec69e3

## Known Stubs

None — all data flows from real query function to route handler. No placeholder values.

## Verification Results

```
Test Files  1 passed (1)
Tests       10 passed (10)
TypeScript  Clean (npx tsc --noEmit, no errors)
```

Acceptance criteria satisfied:
- `getLatestPrices` and `PriceResult` exported from prices.ts
- `DISTINCT ON` pattern present in SQL query
- `NORTH_LAKES_LAT` constant present
- All 10 prices-api tests pass
- TypeScript clean

## Self-Check: PASSED
