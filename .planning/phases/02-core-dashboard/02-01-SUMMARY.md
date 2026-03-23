---
phase: 02-core-dashboard
plan: 01
subsystem: database
tags: [drizzle-orm, postgresql, vitest, timescaledb, schema, invite-codes, sessions]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    provides: schema.ts with stations, priceReadings, scrapeHealth tables already defined

provides:
  - inviteCodes and sessions Drizzle schema tables (invite_codes, sessions)
  - SQL migration 0003_invite_codes_sessions.sql with CREATE TABLE DDL
  - Four Wave 0 vitest test stub files (prices-api, dashboard, map, auth)

affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 test stubs: it.todo() stubs in vitest with DB mock at top of file"
    - "SQL migrations manually maintained when drizzle-kit version incompatible"

key-files:
  created:
    - fuelsniffer/src/lib/db/migrations/0003_invite_codes_sessions.sql
    - fuelsniffer/src/__tests__/prices-api.test.ts
    - fuelsniffer/src/__tests__/dashboard.test.ts
    - fuelsniffer/src/__tests__/map.test.ts
    - fuelsniffer/src/__tests__/auth.test.ts
  modified:
    - fuelsniffer/src/lib/db/schema.ts

key-decisions:
  - "Migration written manually: drizzle-kit 0.31.10 incompatible with drizzle-orm 0.45.1 (TypeError on pg-core view-base). SQL migration 0003 written by hand following existing 0000-schema.sql pattern."
  - "Migration numbered 0003 (not 0002): migrations 0000, 0001, 0002 already existed in src/lib/db/migrations/"

patterns-established:
  - "Wave 0 test files: vi.mock('@/lib/db/client', ...) placed before any DB-touching import"
  - "Wave 0 test files: it.todo() stubs give named intent without running code"

requirements-completed: [DASH-01, ACCS-01]

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 02 Plan 01: DB Schema Foundation + Wave 0 Test Stubs Summary

**invite_codes and sessions tables added to Drizzle schema with SQL migration, plus four Wave 0 vitest stub files covering dashboard and auth requirements**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-23T03:37:55Z
- **Completed:** 2026-03-23T03:43:xx Z
- **Tasks:** 3
- **Files modified:** 6 (1 modified, 5 created)

## Accomplishments

- Added inviteCodes and sessions table definitions to schema.ts with full TypeScript type exports
- Created SQL migration 0003_invite_codes_sessions.sql with CREATE TABLE DDL for both tables
- Created four Wave 0 vitest stub files (prices-api, dashboard, map, auth) — all 16 todos show as skipped, zero crashes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add invite_codes and sessions tables to schema.ts** - `9af37e2` (feat)
2. **Task 2: Generate SQL migration for new tables** - `2c7007d` (feat)
3. **Task 3: Write Wave 0 test stubs** - `6f2c9c7` (feat)

## Files Created/Modified

- `fuelsniffer/src/lib/db/schema.ts` - Appended inviteCodes + sessions table definitions and their TypeScript types
- `fuelsniffer/src/lib/db/migrations/0003_invite_codes_sessions.sql` - CREATE TABLE DDL for invite_codes and sessions
- `fuelsniffer/src/__tests__/prices-api.test.ts` - 4 todo stubs for DASH-01 /api/prices route
- `fuelsniffer/src/__tests__/dashboard.test.ts` - 4 todo stubs for DASH-01/02/03 filter/sort/stale logic
- `fuelsniffer/src/__tests__/map.test.ts` - 3 todo stubs for DASH-04 pin colour generation
- `fuelsniffer/src/__tests__/auth.test.ts` - 5 todo stubs for ACCS-01 invite code + session management

## Decisions Made

- **Migration numbered 0003:** Existing migrations 0000, 0001, 0002 were already present in `src/lib/db/migrations/`, so the new migration is numbered 0003 (not 0002 as the plan suggested as a placeholder name).
- **Manual SQL migration:** drizzle-kit 0.31.10 fails with a TypeError when loading drizzle-orm 0.45.1 (`pg-core/view-base.ts` class extends undefined). Rather than upgrading drizzle-kit (architectural change, Rule 4), the SQL migration was written manually following the existing hand-maintained pattern in this project.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-kit generate fails due to version incompatibility**
- **Found during:** Task 2 (Generate SQL migration)
- **Issue:** drizzle-kit 0.31.10 throws `TypeError: Class extends value undefined is not a constructor or null` when loading drizzle-orm 0.45.1
- **Fix:** Wrote `0003_invite_codes_sessions.sql` manually following the existing hand-maintained migration style already established in this project (0000_schema.sql, 0001_hypertable.sql, 0002_cagg.sql are all manually written)
- **Files modified:** `fuelsniffer/src/lib/db/migrations/0003_invite_codes_sessions.sql`
- **Verification:** grep confirmed both CREATE TABLE statements for invite_codes and sessions present
- **Committed in:** `2c7007d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Manual migration follows the project's established pattern — all prior migrations are already hand-written. No scope creep.

## Issues Encountered

- drizzle-kit 0.31.10 / drizzle-orm 0.45.1 version mismatch causes CLI failure. Upgrading drizzle-kit would be an architectural change (Rule 4 scope), but since the project already maintains SQL migrations manually this was a clean workaround.

## User Setup Required

None — no external service configuration required.

## Known Stubs

The Wave 0 test files are intentional stubs:

- `fuelsniffer/src/__tests__/prices-api.test.ts` — 4 `it.todo()` stubs, no implementation yet (DASH-01 plan will resolve)
- `fuelsniffer/src/__tests__/dashboard.test.ts` — 4 `it.todo()` stubs, no implementation yet (DASH-01/02/03 plans will resolve)
- `fuelsniffer/src/__tests__/map.test.ts` — 3 `it.todo()` stubs, no implementation yet (DASH-04 plan will resolve)
- `fuelsniffer/src/__tests__/auth.test.ts` — 5 `it.todo()` stubs, no implementation yet (ACCS-01 plan will resolve)

These stubs are the intended output of this plan. They are scaffolding for the Nyquist validation system and will be filled in by subsequent plans.

## Next Phase Readiness

- schema.ts compiles cleanly with both new tables and type exports
- SQL migration ready to apply when DB is available
- All 39 Phase 1 tests remain green
- 16 Wave 0 stubs in place, ready for subsequent plans to implement

## Self-Check: PASSED

All files verified present on disk. All commits verified in git log.

- FOUND: fuelsniffer/src/lib/db/schema.ts
- FOUND: fuelsniffer/src/lib/db/migrations/0003_invite_codes_sessions.sql
- FOUND: fuelsniffer/src/__tests__/prices-api.test.ts
- FOUND: fuelsniffer/src/__tests__/dashboard.test.ts
- FOUND: fuelsniffer/src/__tests__/map.test.ts
- FOUND: fuelsniffer/src/__tests__/auth.test.ts
- FOUND: .planning/phases/02-core-dashboard/02-01-SUMMARY.md
- FOUND commit: 9af37e2 (schema.ts)
- FOUND commit: 2c7007d (migration)
- FOUND commit: 6f2c9c7 (test stubs)

---
*Phase: 02-core-dashboard*
*Completed: 2026-03-23*
