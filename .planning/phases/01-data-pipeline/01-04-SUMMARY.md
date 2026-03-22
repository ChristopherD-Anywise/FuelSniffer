---
phase: 01-data-pipeline
plan: 04
subsystem: api
tags: [node-cron, next.js, drizzle, healthchecks, scraper, typescript]

# Dependency graph
requires:
  - phase: 01-data-pipeline plan 02
    provides: Drizzle schema (stations, priceReadings, scrapeHealth) and db singleton
  - phase: 01-data-pipeline plan 03
    provides: QLD API client (createApiClient, fetchWithRetry) and normaliser (normaliseStation, normalisePrice)
provides:
  - runScrapeJob() — full scrape cycle orchestrator (fetch, normalise, upsert, health write, healthchecks ping)
  - shouldInsertRow() — D-09 explicit always-insert helper
  - startScheduler() — node-cron v4 scheduler with 15-min cadence and immediate startup
  - Next.js instrumentation hook that starts scheduler in Node.js runtime only
  - GET /api/health — exposes last scrape status as JSON (status, last_scrape_at, minutes_ago, prices_last_run)
  - buildHealthResponse() — exported response builder for unit testing
affects:
  - Phase 2 (Core Dashboard) — /api/health powers freshness indicators
  - Phase 3+ — all dashboard features depend on prices flowing from this pipeline

# Tech tracking
tech-stack:
  added: []
  patterns:
    - node-cron v4 scheduler with noOverlap: true and D-11 immediate startup pattern
    - Next.js instrumentation.ts hook for singleton process startup (scheduler)
    - Export pure response builder (buildHealthResponse) separately from route handler for unit testability
    - vi.mock('@/lib/db/client') at test level to prevent DATABASE_URL import-time error in unit tests

key-files:
  created:
    - fuelsniffer/src/lib/scraper/writer.ts
    - fuelsniffer/src/lib/scraper/scheduler.ts
    - fuelsniffer/src/instrumentation.ts
    - fuelsniffer/src/app/api/health/route.ts
  modified:
    - fuelsniffer/src/__tests__/scraper.test.ts
    - fuelsniffer/src/__tests__/health.test.ts

key-decisions:
  - "buildHealthResponse exported separately from GET handler so health logic can be unit-tested without HTTP or DB"
  - "vi.mock('@/lib/db/client') added to health.test.ts to prevent DATABASE_URL check at module import time"

patterns-established:
  - "Pattern: Export pure logic functions (buildHealthResponse, shouldInsertRow) from route/service files for unit testability without infrastructure"
  - "Pattern: Mock DATABASE_URL-dependent modules at the test file level using vi.mock() before route imports"

requirements-completed: [DATA-02, DATA-03]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 1 Plan 4: Scraper Pipeline End-to-End Summary

**node-cron v4 scraper pipeline with 15-minute QLD API polling, scrape_health heartbeats, healthchecks.io dead-man's-switch, and /api/health endpoint returning 200/ok or 503/degraded**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-22T22:43:48Z
- **Completed:** 2026-03-22T22:50:30Z
- **Tasks:** 2 of 2
- **Files modified:** 6

## Accomplishments

- Full scrape cycle wired end-to-end: QLD API fetch -> normalise -> DB upsert -> scrape_health write -> healthchecks.io ping
- node-cron v4 scheduler with noOverlap, Australia/Brisbane timezone, and D-11 immediate startup
- Next.js instrumentation hook safely guards scheduler start behind NEXT_RUNTIME === 'nodejs' check
- /api/health returns 200 with ok/degraded status, last_scrape_at, minutes_ago, and prices_last_run; returns 503 for degraded
- All 4 vitest test suites pass: 39 tests total (normaliser 7, api-client 9, scraper 5, health 7 + 11 from prior plans)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement scraper writer, scheduler, and instrumentation hook** - `f737911` (feat)
2. **Task 2: Implement /api/health endpoint and make health tests pass** - `d828bb0` (feat)

**Plan metadata:** (final docs commit)

## Files Created/Modified

- `fuelsniffer/src/lib/scraper/writer.ts` - runScrapeJob() and shouldInsertRow() — full scrape cycle orchestrator
- `fuelsniffer/src/lib/scraper/scheduler.ts` - startScheduler() — node-cron v4 with noOverlap, Brisbane TZ, D-11 immediate start
- `fuelsniffer/src/instrumentation.ts` - Next.js register() hook, guards scheduler start with NEXT_RUNTIME check
- `fuelsniffer/src/app/api/health/route.ts` - GET /api/health with buildHealthResponse() exported for testing
- `fuelsniffer/src/__tests__/scraper.test.ts` - 5 tests: shouldInsertRow (3) + runScrapeJob mocked integration (2)
- `fuelsniffer/src/__tests__/health.test.ts` - 7 tests: buildHealthResponse unit tests with fake timers

## Decisions Made

- Exported `buildHealthResponse()` separately from the `GET` handler so health response logic can be unit-tested without an HTTP request or database connection.
- Added `vi.mock('@/lib/db/client')` to `health.test.ts` to prevent the `DATABASE_URL` environment variable check from firing at module import time during tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added vi.mock for db client in health tests**
- **Found during:** Task 2 (health test execution)
- **Issue:** `route.ts` imports `db` from `@/lib/db/client`, which throws `DATABASE_URL environment variable is not set` at module load time in the test environment. The plan's test template did not include this mock.
- **Fix:** Added `vi.mock('@/lib/db/client', ...)` before the `buildHealthResponse` import in `health.test.ts`.
- **Files modified:** `fuelsniffer/src/__tests__/health.test.ts`
- **Verification:** All 7 health tests pass without DATABASE_URL set.
- **Committed in:** `d828bb0` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical test infrastructure)
**Impact on plan:** Essential for test isolation. No scope creep.

## Issues Encountered

None beyond the auto-fixed db mock issue above.

## User Setup Required

None - no external service configuration required (HEALTHCHECKS_PING_URL is optional and gracefully skipped when not set).

## Next Phase Readiness

- Data pipeline complete: prices flow from QLD API into TimescaleDB every 15 minutes
- /api/health available for dashboard freshness indicators and uptime monitoring
- Phase 2 (Core Dashboard) can begin — all data infrastructure is in place
- Scheduler starts automatically on `next start` via instrumentation hook — no separate process needed

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.

- writer.ts: FOUND
- scheduler.ts: FOUND
- instrumentation.ts: FOUND
- route.ts: FOUND
- SUMMARY.md: FOUND
- Commit f737911: FOUND
- Commit d828bb0: FOUND

---
*Phase: 01-data-pipeline*
*Completed: 2026-03-23*
