---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-23T03:59:09.787Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 12
  completed_plans: 6
---

# Project State: FuelSniffer

*This file is the project's working memory. Update it at every phase transition and plan completion.*

---

## Project Reference

**Core Value:** Always-current fuel prices near me, so I never overpay for fuel.
**Current Milestone:** v1
**Total Phases:** 5

---

## Current Position

Phase: 02 (core-dashboard) — EXECUTING
Plan: 4 of 8

## Phase Summary

| Phase | Goal | Status |
|-------|------|--------|
| 1 - Data Pipeline | Clean data flowing every 15 min with health monitoring | Not started |
| 2 - Core Dashboard | Friends can see cheapest fuel near North Lakes on mobile | Not started |
| 3 - Trend Features | Price history charts and station comparison (after 7-14 days of data) | Not started |
| 4 - Alerts and Push | Web Push price threshold notifications | Not started |
| 5 - Cycle Intelligence | Brisbane cycle detection and best-time-to-fill (after 30+ days of data) | Not started |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 0 |
| Plans total | TBD |
| Phases completed | 0/5 |
| Requirements delivered | 0/18 |

---
| Phase 01-data-pipeline P01 | 5 | 2 tasks | 11 files |
| Phase 01-data-pipeline P02 | 5 | 2 tasks | 8 files |
| Phase 01-data-pipeline P03 | 7 | 2 tasks | 4 files |
| Phase 01-data-pipeline P04 | 7 | 2 tasks | 6 files |
| Phase 02-core-dashboard P01 | 6 | 3 tasks | 6 files |
| Phase 02-core-dashboard P02 | 9 | 2 tasks | 4 files |
| Phase 02-core-dashboard P03 | 642 | 2 tasks | 3 files |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| TimescaleDB for storage | Native time-series with hypertables, continuous aggregates, and retention policies. No extra infra — runs in Docker. | Phase 1 |
| Next.js 16 App Router (monorepo) | Eliminates separate backend; API routes + React dashboard in one process. | Phase 2 |
| Scraper writes directly to DB | No internal HTTP hop — scraper shares DB config with Next.js app. | Phase 1 |
| Caddy as reverse proxy | TLS termination required for Service Workers (push notifications). | Phase 2 |
| Phase 5 gated on data maturity | Cycle detection on <30 days of data produces misleading results. Explicit gate before starting. | Phase 5 |
| setTimeout spy over vi.useFakeTimers for retry tests | vitest 4.x fake timers cause unhandled rejection race condition; spy makes delays resolve synchronously | Phase 1 |
| geoRegionLevel=3 + geoRegionId=1 as QLD API defaults | Exact North Brisbane region ID unknown until live API access; state-level query is safe default | Phase 1 |
| normalisePrice returns null on encoding error | Scraper must never crash on single bad price record; invalid prices logged and skipped | Phase 1 |
| SQL migrations maintained manually | drizzle-kit 0.31 / drizzle-orm 0.45 version mismatch (TypeError on pg-core view-base); all migrations in this project are already hand-written | Phase 2 (02-01) |
| Wave 0 test stubs use it.todo() pattern | vi.mock('@/lib/db/client') at file top, it.todo() for all stubs; follows health.test.ts convention; stubs exist as scaffolding for Nyquist validation | Phase 2 (02-01) |
| importOriginal in vi.mock session for partial mocking | Allows real encrypt/decrypt tests via spread of actual module while overriding createSession/deleteSession to avoid Next.js cookie internals in unit tests | Phase 2 (02-02) |
| randomUUID() as session userId | Invite code ID is a DB integer not a user identity; fresh UUID per login provides non-guessable session token payload | Phase 2 (02-02) |

### Critical Correctness Constraints (must be right in Phase 1)

- **Price encoding:** QLD API returns integers (e.g. `1459`); divide by 10 for c/L (145.9). Define `rawToPrice()` on day one. Add DB assertion: stored values must be in 100-250 range.
- **Timezone:** Store all timestamps as UTC. Use `Australia/Brisbane` (UTC+10, no DST) for display — NEVER `Australia/Sydney`. Set `TZ=Australia/Brisbane` in every Docker/PM2 config.
- **Scraper health:** Write heartbeat timestamp to DB after every successful scrape. Expose via `/api/health`. Register with healthchecks.io dead-man's-switch.
- **Retention from day one:** Hourly continuous aggregate + 2-day raw retention policy. Retrofitting requires dropping and recreating the hypertable.

### Technical Notes

- QLD API token must be treated as a secret from the first commit (environment variable, never in source)
- Push subscriptions: always handle HTTP 410 (Gone) by immediately deleting from DB
- Alert state tracking: fire once when condition first met; re-arm only when condition clears and re-triggers
- iOS PWA push: only works from installed PWA (home screen), not Safari tab
- Phase 3 depends on 7-14 days of data already in the DB before work begins
- Phase 5 depends on 30+ days of verified clean data before work begins

### Open Questions

- QLD API `geoRegionId` values for North Lakes / North Brisbane — confirm with live API access before Phase 1
- QLD API rate limits and ToS — review post-registration
- Token rotation policy — confirm during registration
- iOS 18+ PWA push current behaviour — research before Phase 4

### Blockers

None currently.

---

## Session Continuity

**Last session:** 2026-03-23T03:59:09.784Z
**Next action:** Start Phase 1. Register with fuelpricesqld.com.au and confirm QLD API auth before writing any scraper code. Run `/gsd:plan-phase 1`.

---

*State initialized: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation*
