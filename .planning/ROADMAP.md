# Roadmap: FuelSniffer

**Milestone:** v1
**Created:** 2026-03-23
**Core Value:** Always-current fuel prices near me, so I never overpay for fuel.
**Granularity:** Standard (5-8 phases)

---

## Phases

- [x] **Phase 1: Data Pipeline** — QLD API integration, TimescaleDB schema, scraper with health monitoring (completed 2026-03-22)
- [ ] **Phase 2: Core Dashboard** — Responsive price list, filters, station detail, access control; the MVP shared with friends
- [ ] **Phase 3: Trend Features** — Price history charts, station comparison, delta indicators, map view (buildable after 7-14 days of data)
- [ ] **Phase 4: Alerts and Push** — Web Push price threshold alerts with VAPID, Service Worker, and subscription lifecycle management
- [ ] **Phase 5: Cycle Intelligence** — Brisbane price cycle detection, best-time-to-fill card, cheapest-time heatmap (requires 30+ days of clean data)

---

## Phase Details

### Phase 1: Data Pipeline
**Goal**: Clean, correctly-encoded fuel price data flows into TimescaleDB every 15 minutes with health monitoring
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. Scraper polls QLD API every 15 minutes and upserts price rows without duplicates
  2. Stored prices display as correct cents-per-litre values (e.g. 145.9 c/L, not 1459)
  3. All timestamps stored in UTC; display conversion uses `Australia/Brisbane` (UTC+10, no DST)
  4. `/api/health` endpoint reports last successful scrape time; healthchecks.io dead-man's-switch fires if scraper goes silent
  5. Raw 15-minute rows exist for today; hourly continuous aggregate materialises automatically; 2-day raw retention policy active
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffold, Docker Compose, vitest setup, failing test stubs
- [x] 01-02-PLAN.md — TimescaleDB schema, Drizzle ORM, SQL migration files (hypertable, cagg, retention)
- [x] 01-03-PLAN.md — QLD API client with auth/retry/Zod, price normaliser with rawToPrice and haversine filter
- [x] 01-04-PLAN.md — Scraper writer + scheduler + instrumentation hook + /api/health endpoint

### Phase 2: Core Dashboard
**Goal**: Friends can open the dashboard on their phone and immediately see the cheapest fuel near North Lakes
**Depends on**: Phase 1
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, ACCS-01
**Success Criteria** (what must be TRUE):
  1. Dashboard loads and shows current prices sorted cheapest-first within 20km of North Lakes
  2. User can filter by fuel type (ULP91, ULP95, ULP98, Diesel, E10, E85) and radius
  3. Each station row shows a "price as of [time]" freshness indicator; stale data is visually distinct
  4. Dashboard is usable on a mobile browser in a parked car (responsive layout, large tap targets)
  5. Station map view shows colour-coded price pins; friends can access via shared URL with basic auth gate
**Plans**: TBD

### Phase 3: Trend Features
**Goal**: Users can see how prices have moved over time and identify the best stations to use
**Depends on**: Phase 2 (and 7-14 days of accumulated data)
**Requirements**: TRND-01, TRND-02, TRND-03
**Success Criteria** (what must be TRUE):
  1. User can view a price-over-time line chart for any station with 7, 14, and 30-day windows
  2. User can select 2-3 stations and view their price histories side-by-side on one chart
  3. Price list shows up/down arrow with cents change since the previous reading
**Plans**: TBD

### Phase 4: Alerts and Push
**Goal**: Users receive a push notification on their phone when a nearby station drops below their price threshold
**Depends on**: Phase 2 (HTTPS via Caddy already established)
**Requirements**: ALRT-01, ALRT-02, ALRT-03
**Success Criteria** (what must be TRUE):
  1. User can set a price threshold alert (e.g. "notify me when ULP91 drops below 155 c/L within 20km")
  2. When a scrape cycle produces a qualifying price drop, a Web Push notification is delivered to the user's browser/PWA within 15 minutes
  3. Alert fires once when the condition is first met; does not re-fire repeatedly while the condition persists
  4. Expired push subscriptions (HTTP 410) are automatically removed from the database
**Plans**: TBD

### Phase 5: Cycle Intelligence
**Goal**: Users can see where Brisbane is in its ~7-week price cycle and know the best day and time to fill up
**Depends on**: Phase 3 (and 30+ days of verified clean data — explicit data maturity gate before starting)
**Requirements**: TRND-04
**Success Criteria** (what must be TRUE):
  1. Dashboard shows a cycle position indicator (e.g. "near trough", "rising", "near peak") based on detected Brisbane price cycle
  2. User can view a day-of-week / time-of-day heatmap showing historically cheapest fill-up windows
  3. A "best time to fill" summary card gives a plain-language recommendation based on cycle position and day patterns
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 4/4 | Complete   | 2026-03-22 |
| 2. Core Dashboard | 0/? | Not started | - |
| 3. Trend Features | 0/? | Not started | - |
| 4. Alerts and Push | 0/? | Not started | - |
| 5. Cycle Intelligence | 0/? | Not started | - |

---

## Coverage

| Requirement | Phase | Notes |
|-------------|-------|-------|
| DATA-01 | Phase 1 | QLD API registration and auth |
| DATA-02 | Phase 1 | 15-minute polling scraper |
| DATA-03 | Phase 1 | Health monitoring and heartbeat |
| DATA-04 | Phase 1 | 15-minute interval storage |
| DATA-05 | Phase 1 | Hourly rollup and retention policy |
| DASH-01 | Phase 2 | Sortable price list |
| DASH-02 | Phase 2 | Distance filter |
| DASH-03 | Phase 2 | Fuel type filter |
| DASH-04 | Phase 2 | Map with price pins |
| DASH-05 | Phase 2 | Mobile-responsive layout |
| ACCS-01 | Phase 2 | Basic shared access |
| TRND-01 | Phase 3 | Price-over-time line chart |
| TRND-02 | Phase 3 | Station comparison chart |
| TRND-03 | Phase 3 | Cheapest-time heatmap (day/hour) |
| ALRT-01 | Phase 4 | Price threshold alert configuration |
| ALRT-02 | Phase 4 | Price drop alert for nearby stations |
| ALRT-03 | Phase 4 | Web Push delivery (VAPID) |
| TRND-04 | Phase 5 | Brisbane cycle detection |

**v1 requirements: 18/18 mapped. No orphans.**

---

## Research Flags

| Phase | Flag | Action |
|-------|------|--------|
| Phase 1 | NEEDS RESEARCH | QLD API auth flow and North Brisbane geographic filter IDs. Register at fuelpricesqld.com.au and test endpoints with curl before implementation. |
| Phase 4 | MODERATE COMPLEXITY | iOS 18+ PWA push behaviour has known quirks. Targeted research on current Safari push support recommended before starting Phase 4. |
| Phase 5 | NEEDS RESEARCH | Brisbane-specific cycle detection algorithm. Research time-series cycle analysis techniques before starting Phase 5. |

---

*Roadmap created: 2026-03-23*
*Last updated: 2026-03-23 — Phase 1 planned (4 plans, 3 waves)*
