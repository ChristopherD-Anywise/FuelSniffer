---
phase: 01-data-pipeline
plan: 01
subsystem: infra
tags: [nextjs, typescript, timescaledb, docker, vitest, drizzle-orm, node-cron, axios, zod]

# Dependency graph
requires: []
provides:
  - Next.js 16.2.1 project scaffold at fuelsniffer/ with TypeScript, Tailwind, App Router
  - docker-compose.yml with TimescaleDB 2.24.0-pg17 pinned image
  - .env.example documenting all required secrets (DB_PASSWORD, QLD_API_TOKEN, HEALTHCHECKS_PING_URL, DATABASE_URL)
  - All Phase 1 npm dependencies installed (axios, zod, drizzle-orm, postgres, node-cron, date-fns, vitest, drizzle-kit)
  - vitest.config.ts with node environment, v8 coverage, @/* path alias
  - 4 failing test stubs establishing RED state for DATA-01 through DATA-04
affects: [01-02, 01-03, 01-04, all subsequent phases]

# Tech tracking
tech-stack:
  added:
    - "Next.js 16.2.1 (App Router)"
    - "TypeScript 5.x"
    - "Tailwind CSS 4.x"
    - "TimescaleDB 2.24.0-pg17 (Docker)"
    - "drizzle-orm 0.45.1 + drizzle-kit 0.31.10"
    - "postgres 3.4.8 (pure-JS PostgreSQL driver)"
    - "node-cron 4.2.1"
    - "axios 1.13.6"
    - "zod 4.3.6"
    - "date-fns ^4.x"
    - "vitest (latest) + @vitest/coverage-v8"
    - "tsx (TypeScript script runner)"
  patterns:
    - "Test-first: all Phase 1 units have failing stubs before implementation"
    - "Secrets via env vars only: QLD_API_TOKEN never in source, always from process.env"
    - "Docker Compose for all services: TimescaleDB + app container defined in one file"
    - "TZ=Australia/Brisbane in every Docker env: UTC storage, Brisbane display"

key-files:
  created:
    - "fuelsniffer/package.json"
    - "fuelsniffer/docker-compose.yml"
    - "fuelsniffer/.env.example"
    - "fuelsniffer/.gitignore"
    - "fuelsniffer/next.config.ts"
    - "fuelsniffer/tsconfig.json"
    - "fuelsniffer/vitest.config.ts"
    - "fuelsniffer/src/__tests__/normaliser.test.ts"
    - "fuelsniffer/src/__tests__/api-client.test.ts"
    - "fuelsniffer/src/__tests__/scraper.test.ts"
    - "fuelsniffer/src/__tests__/health.test.ts"
  modified: []

key-decisions:
  - "instrumentationHook flag omitted: deprecated in Next.js 16.2.1, instrumentation.ts works by default without opt-in"
  - "vitest reporters (array) not reporter (string): required by vitest 4.x InlineConfig type"
  - ".env.example tracked via explicit !.env.example negation in .gitignore after .env* pattern would have blocked it"

patterns-established:
  - "Wave 0 pattern: stubs-first TDD — write failing tests before any implementation code"
  - "Secrets pattern: all API keys via env vars, .env.example documents every required secret"
  - "Docker pattern: single docker-compose.yml defines both DB and app services for all phases"

requirements-completed: [DATA-01]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 1 Plan 01: Bootstrap Summary

**Next.js 16.2.1 monorepo scaffold with TimescaleDB Docker Compose, all Phase 1 npm deps, and 4 failing vitest stubs establishing TDD RED state**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-22T22:28:37Z
- **Completed:** 2026-03-22T22:34:00Z
- **Tasks:** 2 completed
- **Files modified:** 11 created

## Accomplishments

- Scaffolded Next.js 16.2.1 project with TypeScript, Tailwind CSS, App Router, ESLint
- Installed all 9 Phase 1 runtime and dev dependencies (drizzle-orm, node-cron, axios, zod, postgres, date-fns, vitest, drizzle-kit, tsx)
- Created docker-compose.yml with TimescaleDB 2.24.0-pg17 pinned, TZ=Australia/Brisbane, and QLD_API_TOKEN env var wiring
- Created .env.example documenting all 4 required env vars; .env is gitignored
- Configured vitest with node environment, v8 coverage, @/* alias; all 4 test stub files discovered with 15 failing tests

## Task Commits

1. **Task 1: Scaffold Next.js 16 project with all Phase 1 dependencies** - `8cb68d8` (feat)
2. **Task 2: Configure vitest and create failing test stubs** - `1ef2456` (test)
3. **Fix: vitest config reporter key** - `8a3adda` (fix, auto-applied deviation)

## Files Created/Modified

- `fuelsniffer/package.json` - Next.js 16.2.1 with all Phase 1 runtime and dev dependencies
- `fuelsniffer/docker-compose.yml` - TimescaleDB 2.24.0-pg17 + app service with TZ=Australia/Brisbane
- `fuelsniffer/.env.example` - Template with DB_PASSWORD, QLD_API_TOKEN, HEALTHCHECKS_PING_URL, DATABASE_URL
- `fuelsniffer/.gitignore` - .env blocked, .env.example tracked, data/ blocked
- `fuelsniffer/next.config.ts` - Minimal config (instrumentationHook removed, deprecated in Next.js 16.2.1)
- `fuelsniffer/tsconfig.json` - TypeScript config (Next.js generated)
- `fuelsniffer/vitest.config.ts` - node environment, reporters: verbose, v8 coverage, @/* alias
- `fuelsniffer/src/__tests__/normaliser.test.ts` - Stubs for rawToPrice, toBrisbaneHour, isWithinRadius (DATA-04)
- `fuelsniffer/src/__tests__/api-client.test.ts` - Stubs for buildAuthHeader, fetchWithRetry (DATA-01)
- `fuelsniffer/src/__tests__/scraper.test.ts` - Stubs for runScrapeJob, shouldInsertRow D-09 (DATA-02)
- `fuelsniffer/src/__tests__/health.test.ts` - Stubs for buildHealthResponse (DATA-03)

## Decisions Made

- `instrumentationHook: true` removed from next.config.ts — this flag was deprecated in Next.js 16.2.1 and is no longer in the TypeScript type definitions; including it caused TS2353. Instrumentation works by default in Next.js 16 without any config opt-in.
- vitest config uses `reporters: ['verbose']` (array) not `reporter: 'verbose'` (string) — vitest 4.x InlineConfig type requires the plural form.
- `.env.example` tracked by adding `!.env.example` negation after `.env` pattern — otherwise create-next-app's default `.env*` glob would block the file from git.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed deprecated instrumentationHook from next.config.ts**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** Plan specified `experimental: { instrumentationHook: true }` but this was removed from Next.js 16's ExperimentalConfig type (the flag is deprecated — instrumentation.ts is stable by default). TypeScript reported TS2353: Object literal may only specify known properties.
- **Fix:** Removed the `instrumentationHook` property. Added comment explaining instrumentation is stable in Next.js 16.
- **Files modified:** fuelsniffer/next.config.ts
- **Verification:** `npx tsc --noEmit` exits 0 after fix
- **Committed in:** 8cb68d8 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed vitest config reporter key**
- **Found during:** Task 2 (overall TypeScript verification)
- **Issue:** Plan specified `reporter: 'verbose'` (singular, string) but vitest 4.x InlineConfig requires `reporters: string[]` (plural, array). TypeScript reported TS2769: No overload matches this call.
- **Fix:** Changed to `reporters: ['verbose']`
- **Files modified:** fuelsniffer/vitest.config.ts
- **Verification:** `npx tsc --noEmit` exits 0; `npx vitest run` still discovers 4 test files
- **Committed in:** 8a3adda (separate fix commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug, API/type definition mismatches)
**Impact on plan:** Both fixes necessary for TypeScript correctness with installed versions. No scope creep. Functionality identical to plan intent.

## Issues Encountered

- create-next-app 16.2.1 prompts for React Compiler and AGENTS.md inclusion — used `yes no | npx create-next-app` to answer non-interactively. AGENTS.md was added by the installer and committed as-is.

## User Setup Required

None for this plan. External service setup (QLD API token, healthchecks.io) is required before Plan 03 (api-client implementation). See `.env.example` for all required secrets.

## Next Phase Readiness

- Plan 02 (TimescaleDB schema) can proceed immediately — docker-compose.yml is ready
- Plan 03 (API client + normaliser) has failing test stubs ready; needs QLD_API_TOKEN from registration
- Plan 04 (scraper + health) has failing test stubs ready
- `npx vitest run` exits with 4 FAIL files (correct RED state, expected before implementation)
- `npx tsc --noEmit` exits 0 (no TypeScript errors)

## Self-Check: PASSED

- FOUND: fuelsniffer/docker-compose.yml
- FOUND: fuelsniffer/vitest.config.ts
- FOUND: fuelsniffer/src/__tests__/normaliser.test.ts
- FOUND: fuelsniffer/src/__tests__/api-client.test.ts
- FOUND: fuelsniffer/src/__tests__/scraper.test.ts
- FOUND: fuelsniffer/src/__tests__/health.test.ts
- FOUND: .planning/phases/01-data-pipeline/01-01-SUMMARY.md
- FOUND commit: 8cb68d8 (Task 1 - scaffold)
- FOUND commit: 1ef2456 (Task 2 - vitest stubs)
- FOUND commit: 8a3adda (Fix - vitest config)
- FOUND commit: bb53180 (Final metadata)

---
*Phase: 01-data-pipeline*
*Completed: 2026-03-23*
