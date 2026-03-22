---
phase: 01-data-pipeline
plan: 03
subsystem: api
tags: [axios, zod, vitest, tdd, qld-api, haversine, timezone, normaliser]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    plan: 01
    provides: "vitest config with @/* alias, test stubs for normaliser and api-client"
  - phase: 01-data-pipeline
    plan: 02
    provides: "NewStation and NewPriceReading types from src/lib/db/schema.ts"
provides:
  - "fuelsniffer/src/lib/scraper/client.ts — QLD API HTTP client with auth header, retry (3 attempts), and Zod validation"
  - "fuelsniffer/src/lib/scraper/normaliser.ts — rawToPrice(), isWithinRadius(), toBrisbaneHour(), normaliseStation(), normalisePrice()"
  - "GREEN state for normaliser.test.ts (18 tests) and api-client.test.ts (9 tests)"
affects: [01-04, all scraper and API route work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "rawToPrice() is the single place where / 10 division happens — never inline"
    - "Australia/Brisbane for all timezone conversions — never Australia/Sydney"
    - "Haversine filter applied at ingest: stations outside 50km of North Lakes never stored"
    - "fetchWithRetry: 3 attempts, exponential backoff 2s/4s/8s"
    - "setTimeout spy pattern for testing retry logic without fake timer race conditions"

key-files:
  created:
    - "fuelsniffer/src/lib/scraper/client.ts"
    - "fuelsniffer/src/lib/scraper/normaliser.ts"
  modified:
    - "fuelsniffer/src/__tests__/api-client.test.ts"
    - "fuelsniffer/src/__tests__/normaliser.test.ts"

key-decisions:
  - "setTimeout spy (vi.spyOn) instead of vi.useFakeTimers for retry tests — fake timers cause unhandled promise rejection race condition in vitest 4.x"
  - "geoRegionLevel=3 + geoRegionId=1 as state-level defaults — exact North Brisbane region ID unknown until live API access"
  - "normalisePrice returns null (not throws) for invalid prices — scraper must never crash on bad data"

patterns-established:
  - "TDD GREEN: test stubs updated to import from real implementations"
  - "Range assertion in rawToPrice catches encoding bugs before DB insertion"
  - "Intl.DateTimeFormat with timeZone: 'Australia/Brisbane' — host TZ-independent"

requirements-completed: [DATA-01, DATA-02]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 1 Plan 03: API Client and Normaliser Summary

**QLD API HTTP client with FPDAPI SubscriberToken auth and 3-attempt retry, plus rawToPrice/haversine/Brisbane-timezone normaliser — 27 tests GREEN**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-22T22:37:53Z
- **Completed:** 2026-03-22T22:45:00Z
- **Tasks:** 2 completed
- **Files modified:** 4 (2 created, 2 updated)

## Accomplishments

- Implemented `buildAuthHeader`, `fetchWithRetry`, `createApiClient` with Zod-validated API response schemas
- Implemented `rawToPrice` with 50-400 c/L range assertion, `isWithinRadius` with haversine from North Lakes, `toBrisbaneHour` using Australia/Brisbane timezone
- Moved both test files from stub state (all throwing "not implemented") to GREEN state — 27 tests pass, 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: QLD API client with auth, retry, and Zod validation** - `25befd0` (feat)
2. **Task 2: Price normaliser with rawToPrice, timezone, and haversine** - `5ba78c4` (feat)

## Files Created/Modified

- `fuelsniffer/src/lib/scraper/client.ts` - QLD API HTTP client: buildAuthHeader, fetchWithRetry, createApiClient, Zod schemas for GetSitesPrices and GetFullSiteDetails
- `fuelsniffer/src/lib/scraper/normaliser.ts` - rawToPrice (range assertion), toBrisbaneHour (Australia/Brisbane), isWithinRadius (haversine 50km), normaliseStation, normalisePrice
- `fuelsniffer/src/__tests__/api-client.test.ts` - Updated from stubs to real imports; 9 tests GREEN
- `fuelsniffer/src/__tests__/normaliser.test.ts` - Updated from stubs to real imports; 18 tests GREEN

## Decisions Made

- **setTimeout spy over vi.useFakeTimers:** vitest 4.x fake timers create a race condition where the internal rejected promise from `fetchWithRetry`'s retry loop is briefly unhandled before the test's `await` can attach. Using `vi.spyOn(globalThis, 'setTimeout')` to make delays resolve immediately eliminates the race and produces clean 0-error test output.
- **geoRegionLevel=3 + geoRegionId=1:** RESEARCH.md Pitfall 6 documents that the exact North Brisbane region ID is unknown until live API access. State-level query is the safe default; haversine filter in normaliser provides geographic precision regardless.
- **normalisePrice returns null on encoding error:** The scraper must never crash on a single bad price record. Invalid prices are logged and skipped; the caller receives null and can continue processing the rest of the batch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced vi.useFakeTimers with setTimeout spy to eliminate unhandled rejection race**
- **Found during:** Task 1 (verify api-client tests)
- **Issue:** Plan specified `vi.useFakeTimers()` + `vi.runAllTimersAsync()` for retry tests. In vitest 4.x this causes an unhandled promise rejection warning because the rejected promise inside `fetchWithRetry`'s retry loop is briefly unhandled while fake timers are advancing. All 9 tests still passed but the test run reported "1 error" due to the unhandled rejection.
- **Fix:** Replaced fake timer approach with `vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => { fn(); return 0 })` — delays execute synchronously, no race condition, no unhandled rejection.
- **Files modified:** fuelsniffer/src/__tests__/api-client.test.ts
- **Verification:** `npx vitest run src/__tests__/api-client.test.ts` exits 0, 9 passed, 0 errors
- **Committed in:** 25befd0 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug, vitest fake timer race condition)
**Impact on plan:** Fix necessary for clean test output. No scope creep. Test intent (verify retry count) unchanged.

## Issues Encountered

None beyond the fake timer deviation above.

## User Setup Required

None for this plan. QLD API token required before Plan 04 can perform a live scrape test. See `.env.example` for `QLD_API_TOKEN`.

## Next Phase Readiness

- Plan 04 (scraper + writer) can proceed — client and normaliser are both implemented and tested
- `npx vitest run src/__tests__/normaliser.test.ts src/__tests__/api-client.test.ts` exits 0 (27 tests, GREEN)
- `npx tsc --noEmit` exits 0

## Self-Check: PASSED

- FOUND: fuelsniffer/src/lib/scraper/client.ts
- FOUND: fuelsniffer/src/lib/scraper/normaliser.ts
- FOUND: fuelsniffer/src/__tests__/api-client.test.ts
- FOUND: fuelsniffer/src/__tests__/normaliser.test.ts
- FOUND commit: 25befd0 (Task 1 - API client)
- FOUND commit: 5ba78c4 (Task 2 - normaliser)

---
*Phase: 01-data-pipeline*
*Completed: 2026-03-23*
