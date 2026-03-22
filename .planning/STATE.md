# Project State: FuelSniffer

*This file is the project's working memory. Update it at every phase transition and plan completion.*

---

## Project Reference

**Core Value:** Always-current fuel prices near me, so I never overpay for fuel.
**Current Milestone:** v1
**Total Phases:** 5

---

## Current Position

**Current Phase:** None (roadmap complete, no phase started)
**Current Plan:** None
**Phase Status:** Not started
**Overall Progress:** 0/5 phases complete

```
Phase 1 [----------] Not started
Phase 2 [----------] Not started
Phase 3 [----------] Not started
Phase 4 [----------] Not started
Phase 5 [----------] Not started
```

---

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

## Accumulated Context

### Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| TimescaleDB for storage | Native time-series with hypertables, continuous aggregates, and retention policies. No extra infra — runs in Docker. | Phase 1 |
| Next.js 16 App Router (monorepo) | Eliminates separate backend; API routes + React dashboard in one process. | Phase 2 |
| Scraper writes directly to DB | No internal HTTP hop — scraper shares DB config with Next.js app. | Phase 1 |
| Caddy as reverse proxy | TLS termination required for Service Workers (push notifications). | Phase 2 |
| Phase 5 gated on data maturity | Cycle detection on <30 days of data produces misleading results. Explicit gate before starting. | Phase 5 |

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

**Last session:** 2026-03-23 — Roadmap created. 18/18 v1 requirements mapped across 5 phases.
**Next action:** Start Phase 1. Register with fuelpricesqld.com.au and confirm QLD API auth before writing any scraper code. Run `/gsd:plan-phase 1`.

---

*State initialized: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation*
