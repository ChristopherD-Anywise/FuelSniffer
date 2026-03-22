# Project Research Summary

**Project:** FuelSniffer
**Domain:** Fuel price scraping and dashboard (Queensland, Australia)
**Researched:** 2026-03-22
**Confidence:** MEDIUM-HIGH

## Executive Summary

FuelSniffer is a self-hosted, full-stack fuel price tracking dashboard targeting a small group of friends in North Brisbane. Queensland operates a government-mandated fuel price reporting scheme where all retailers must report price changes within 30 minutes, providing a free JSON API (`fppdirectapi-prod.fuelpricesqld.com.au`) that makes this project unusually accessible — no scraping, no HTML parsing, no unofficial feeds. The right approach is a monorepo Next.js 16 application combining API routes and the React dashboard, backed by TimescaleDB for time-series storage and a node-cron scheduler for 15-minute polling. The architecture is deliberately simple: one codebase, one database, one process manager (PM2), one server.

The product's genuine value proposition over existing apps (PetrolSpy, MotorMouth, FuelRadar) is local historical ownership. Competitors show live prices; FuelSniffer uniquely stores its own history, enabling Brisbane-specific cycle analysis and "best time to fill" intelligence once enough data accumulates. The launch version (v1) is simply "current cheapest fuel near North Lakes in a mobile-friendly list" — the differentiating features come in later phases once data has built up over weeks. This is a hard dependency, not a choice: cycle detection is meaningless without 30+ days of readings.

The primary risks are operational, not architectural. The scraper is a background process on a home server — silent failures are the main threat. Timezone handling (Queensland does not observe DST; do not use `Australia/Sydney`) and price integer encoding (divide raw API value by 10 to get cents per litre) are correctness traps that must be addressed on day one in the data layer, as fixing them after data accumulates requires expensive migrations. The QLD API token must be treated as a secret from the first commit.

---

## Key Findings

### Recommended Stack

A single Next.js 16 (App Router) application eliminates the separate-backend complexity that would otherwise arise from a scraper + API + frontend architecture. The scraper runs as a standalone process managed by PM2 but shares the same codebase and database connection config. TimescaleDB (PostgreSQL extension) provides native time-series queries via hypertables and continuous aggregates — it handles 15-minute raw data, hourly rollups, and automatic retention without any additional infrastructure. Drizzle ORM keeps time-series SQL readable without the overhead of a Rust binary.

**Core technologies:**
- **Next.js 16 (App Router):** Full-stack framework for API routes and dashboard UI — eliminates separate backend process for a single-developer project
- **TypeScript 5.x:** End-to-end type safety critical for scraper-to-dashboard data pipeline where shape mismatches corrupt stored data
- **TimescaleDB 2.24.0-pg17:** PostgreSQL extension with native time-series support (hypertables, continuous aggregates, retention policies) — runs in Docker with zero extra infra overhead
- **Drizzle ORM ^0.40:** Lightweight, SQL-close ORM ideal for time-series queries; no Rust binary; migration files are plain readable SQL
- **node-cron ^3.0:** Zero-dependency scheduler; sufficient for single-server where missed scrapes are not catastrophic (PM2 handles restarts)
- **web-push ^3.6:** VAPID browser push — self-hosted, no Firebase/FCM dependency
- **Recharts ^3.8:** React-native declarative charts; `ResponsiveContainer` handles mobile layout without config overhead
- **axios ^1.7:** HTTP client for token-authenticated QLD API requests; interceptors handle auth header injection once

**Version compatibility note:** Next.js 16 requires Node.js 20.9+ and ships with React 19.2. Pin `timescale/timescaledb:2.24.0-pg17` — do not track `latest` (auto-upgrades PostgreSQL major version). Use the `postgres` npm driver, not `pg`, as that is what Drizzle's PostgreSQL adapter expects.

See `/Users/chrisdennis/Documents/GitHub/FuelSniffer/.planning/research/STACK.md` for full alternatives analysis and installation commands.

---

### Expected Features

Brisbane has an approximately 7-week fuel price cycle (trough → sharp rise → peak → gradual fall). Tuesday is typically cheapest. This cycle pattern is the central insight that makes historical data valuable — and the reason the roadmap must sequence "get data flowing" before "build trend features."

**Must have (table stakes — v1 launch):**
- QLD API integration — scrapes every 15 min, stores prices and station metadata
- Current prices list view — sorted cheapest first, filtered to 20km of North Lakes
- Fuel type filter — at minimum ULP91 and ULP95
- Mobile-responsive layout — usable in a parked car on a phone
- Data freshness indicator (per-station) — users need to trust the data
- Station detail view — address, brand, last updated

**Should have (v1.x — after data accumulates):**
- Price history charts — add after 7–14 days of data; line chart with 7/14/30-day window
- Price delta indicator — up/down arrow + cents change since last reading
- Map view — colour-coded pins (green = cheap, red = expensive)
- Favourite stations — localStorage or DB-backed list
- Station comparison charts — side-by-side price history for 2–3 stations
- Push notification price alerts — Web Push + Service Worker (requires HTTPS)

**Defer to v2+:**
- Cycle position indicator — needs 30+ days of data and cycle detection algorithm
- "Best time to fill" summary card — depends on cycle detection
- Cheapest time heatmap (day/hour patterns) — meaningful only after 3+ weeks of data
- Area aggregate trend charts — useful but lower priority than per-station charts

**Anti-features (do not build):**
- Crowdsourced price reporting — unnecessary given QLD mandatory reporting; massive moderation overhead
- Native iOS/Android app — PWA with Web Push satisfies the use case
- Full user account system — shared URL or HTTP Basic Auth is sufficient for a small trusted group
- WebSocket real-time streaming — 15-min polling cadence makes this pointless complexity

See `/Users/chrisdennis/Documents/GitHub/FuelSniffer/.planning/research/FEATURES.md` for full feature dependency graph and competitor analysis.

---

### Architecture Approach

The architecture follows a five-layer pipeline: Data Ingestion (cron scheduler → QLD API client → normaliser) → Storage (TimescaleDB hypertable for raw 15-min readings, continuous aggregate for hourly rollups, retention policy to drop raw rows after 2 days) → API Layer (Next.js Route Handlers serving price queries, station data, alert CRUD, push subscriptions) → Notification Layer (post-ingest alert evaluator → VAPID push dispatcher) → Presentation Layer (React dashboard + Service Worker). The scraper writes directly to the database — not through the API — to avoid an unnecessary internal HTTP hop. All services run in a single Docker Compose stack on one host.

**Major components:**
1. **Scraper / QLD API Client** — authenticated HTTP polling every 15 min; normalises price integers, deduplicates, upserts to hypertable
2. **TimescaleDB** — stores `price_readings` (hypertable), `stations` (dimension table), `push_subscriptions`; materialises `hourly_prices` continuous aggregate automatically
3. **Next.js API Routes** — stateless REST endpoints: `/api/prices`, `/api/stations`, `/api/prices/:stationId/history`, `/api/alerts`, `/api/push/subscribe`
4. **Alert Evaluator** — runs as a post-ingest hook; compares current prices against stored thresholds; dispatches via web-push
5. **React Dashboard** — price table + map + charts + alert management; Service Worker handles push receipt
6. **Reverse Proxy (Caddy)** — TLS termination (required for Service Worker / push); routes `/api/*` to Next.js, serves static assets

**Key patterns:**
- Scheduled Pull with Idempotent Upsert (not webhook/stream — QLD API is polling-based)
- Tiered Retention: raw 15-min rows kept 2 days; hourly cagg kept indefinitely
- Alert Evaluation as Post-Ingest Hook (no queue needed at this scale)

**Recommended build order (hard dependencies):** DB schema → Scraper + normaliser → Scheduler → API routes → Core dashboard → Charts/trends → Alerts + push

See `/Users/chrisdennis/Documents/GitHub/FuelSniffer/.planning/research/ARCHITECTURE.md` for data flow diagrams and anti-patterns.

---

### Critical Pitfalls

1. **Price integer encoding** — The QLD API returns `Price` as an integer (e.g., `1459`); divide by 10 to get cents per litre (145.9 c/L). Missing this produces 10x prices that look plausible in the raw data but make charts and alerts wrong. Fix: define a single `rawToPrice()` function on day one; add a DB assertion that stored values fall in the 100–250 range. Recovery after data is collected requires a full migration.

2. **Timezone: Queensland does not observe DST** — Use `Australia/Brisbane` (UTC+10 permanently), never `Australia/Sydney` (which shifts to UTC+11 in summer). The QLD API returns `TransactionDateUtc` in UTC; store all timestamps as UTC, convert for display only. A timezone bug discovered after weeks of data collection requires rewriting all stored timestamps. Set `TZ=Australia/Brisbane` in every Docker/PM2 config on day one.

3. **Scraper silently fails with no alerting** — Cron jobs that crash do not announce themselves. Solution: write a heartbeat timestamp to a DB table after every successful scrape; expose it via a `/api/health` endpoint; register the endpoint with healthchecks.io (free tier dead-man's-switch). The dashboard should prominently show "last successful update" so users can self-detect staleness.

4. **Storing all raw 15-minute rows forever** — 100 stations × 6 fuel types × 96 readings/day grows to ~500MB/year without aggregation. Implement TimescaleDB hourly continuous aggregate and 2-day raw retention policy from the schema design phase — retrofitting it later requires dropping and recreating the hypertable structure.

5. **Push subscription rot** — Browser push subscriptions expire or are revoked silently. Always handle HTTP 410 (Gone) responses from push services by immediately deleting that subscription from the database. Without this, the dead-subscription list grows and alert delivery can hang or crash. Alert state must also be tracked to prevent re-firing on every scrape cycle while a price condition persists.

See `/Users/chrisdennis/Documents/GitHub/FuelSniffer/.planning/research/PITFALLS.md` for full recovery strategies and the "looks done but isn't" checklist.

---

## Implications for Roadmap

Based on the research, the hard dependency chain is: schema → scraper → API → dashboard → history features → alerts. Features requiring historical data cannot be built until data exists. This dictates a sequential phase structure.

### Phase 1: Foundation and Data Ingestion

**Rationale:** Everything else depends on data flowing into the database. The scraper, schema, and database infrastructure must be correct before any UI or analytics work begins. The three day-one correctness traps (timezone, price encoding, data retention) must be addressed here — they cannot be patched cheaply later.

**Delivers:** A running scraper that polls the QLD API every 15 minutes, normalises and stores price readings in TimescaleDB, and proves the data pipeline end-to-end with real data. Health monitoring configured.

**Addresses features:** QLD API integration, data freshness tracking (per-station `TransactionDateUtc`), 15-min to hourly data retention pipeline

**Avoids pitfalls:** Price integer encoding (rawToPrice function + DB assertion), timezone configuration (`TZ=Australia/Brisbane` + UTC storage), silent scraper failure (heartbeat table + healthchecks.io), storage growth (hourly cagg + 2-day retention policy from day one), geo-filtering on API calls (do not pull full QLD dataset)

**Research flag:** NEEDS RESEARCH — QLD API authentication flow, exact endpoint parameters, and geographic filter IDs require live API access to confirm. Register as "data consumer" at fuelpricesqld.com.au before this phase begins.

---

### Phase 2: Core Dashboard (MVP)

**Rationale:** Once data is flowing, validate the product concept quickly with a minimal but functional dashboard. This is the v1 that gets shared with friends. Map view and charts are not required — the list is sufficient to be useful.

**Delivers:** A mobile-responsive dashboard showing current cheapest fuel prices within 20km of North Lakes, with fuel type filter, per-station data freshness indicator, and station detail view. Self-hostable via PM2 + Docker Compose + Caddy (HTTPS required for later push support).

**Addresses features (P1 — all table stakes):** Current prices list view, fuel type filter, distance/radius filter, mobile-responsive layout, data freshness indicator, station detail view

**Uses stack:** Next.js 16 App Router (API routes + React UI), Recharts (not yet needed — deferred to Phase 3), Tailwind CSS, date-fns for AEST display conversion

**Avoids pitfalls:** Stale station display (per-station "price as of [time]" with staleness colouring); price display format ("$1.459/L" to match pump format, not raw API values)

**Research flag:** STANDARD PATTERNS — Next.js App Router dashboard and REST API are well-documented; no phase research needed.

---

### Phase 3: History and Trend Features

**Rationale:** After 7–14 days of data collection, the historical features become meaningful. Price history charts and station comparisons are the primary differentiator over existing apps. These depend on the hourly continuous aggregate established in Phase 1.

**Delivers:** Price history line charts per station (7/14/30-day windows defaulting to 7 days), price delta indicators (up/down arrows with cents change), station comparison charts (2–3 stations side by side), map view with colour-coded pins, and favourite stations.

**Addresses features (P2):** Price history charts, price delta indicator, map view, station comparison charts, favourite stations

**Implements architecture:** Queries against `hourly_prices` continuous aggregate for history; queries against raw `price_readings` hypertable for today's granularity

**Avoids pitfalls:** Chart data range defaults to 7-day view (not "all time" which loads slowly and obscures short-term trends); raw 15-min table not queried for multi-week history (use hourly cagg)

**Research flag:** STANDARD PATTERNS — Recharts line chart patterns are well-documented. TimescaleDB cagg query patterns established in Phase 1.

---

### Phase 4: Alerts and Push Notifications

**Rationale:** Push notifications are the highest complexity feature and depend on HTTPS infrastructure (already established in Phase 2 via Caddy). Building last ensures the core data pipeline is stable and the data model is not changing under the alert logic.

**Delivers:** Web Push notification alerts when fuel price drops below a user-configured threshold within the chosen radius. Configurable per fuel type. Subscription state shown in UI. Dead subscription cleanup on HTTP 410.

**Addresses features (P2):** Push notification price alerts, configurable alert thresholds

**Implements architecture:** Alert Evaluator (post-ingest hook), Web Push Dispatcher (VAPID), Service Worker (push receiver), push_subscriptions table management

**Avoids pitfalls:** Alert double-firing (track alert state — fire once when condition first met, re-arm only when condition clears and re-triggers); push subscription rot (410 handler + subscription lifecycle UI); iOS PWA testing (push only works from installed PWA on home screen, not Safari tab); separate VAPID keys per environment

**Research flag:** MODERATE COMPLEXITY — Web Push + Service Worker integration has known iOS quirks. Phase research recommended to confirm current iOS Safari PWA push behaviour before implementation begins.

---

### Phase 5: Cycle Intelligence (v2)

**Rationale:** The "best time to fill" and cycle position features require 30+ days of clean data and a cycle detection algorithm. This is the highest-value long-term differentiator but cannot be rushed. Build only once data has matured.

**Delivers:** Brisbane price cycle position indicator, "best time to fill" summary card, cheapest time-of-week heatmap (day/hour patterns), area aggregate trend charts.

**Addresses features (P3):** Cycle position indicator, "best time to fill" card, cheapest time heatmap, area aggregate trend charts

**Avoids pitfalls:** Cycle detection requires clean timezone handling (established Phase 1) and at least 30 days of correctly-stored data; do not attempt until data integrity has been validated

**Research flag:** NEEDS RESEARCH — Brisbane-specific cycle detection algorithms are not well-documented in open sources. Phase research on time-series cycle analysis techniques recommended before implementation.

---

### Phase Ordering Rationale

- **Phase 1 before everything:** The entire product is data-dependent. No UI features are buildable without a working scraper. The correctness constraints (timezone, encoding, retention) have exponential recovery cost if deferred — they must be right before data accumulates.
- **Phase 2 before Phase 3:** Historical charts require data to exist. Starting the dashboard in Phase 2 begins the data accumulation clock; Phase 3 work starts once real data has collected for 1–2 weeks.
- **Phase 4 last:** Alerts depend on stable data model, HTTPS infrastructure, and a working frontend — all established in earlier phases. Alert logic that fires on stale or miscoded data is worse than no alerts.
- **Phase 5 explicitly gated on data maturity:** Cycle detection on less than 30 days of data produces misleading results. The roadmap should include an explicit "data maturity checkpoint" before Phase 5 work begins.

---

### Research Flags

**Needs phase-level research:**
- **Phase 1 (QLD API):** Authentication flow, geographic filter parameter values (geoRegionId for North Brisbane), exact response schema with live data. Complete API registration before roadmap is finalised.
- **Phase 5 (Cycle Detection):** Time-series cycle detection for fuel price patterns. Brisbane cycle is ~7 weeks and documented qualitatively, but algorithmic detection approach is not established.

**Standard patterns (skip research-phase):**
- **Phase 2 (Next.js dashboard):** App Router API routes and React dashboard are mature, well-documented patterns.
- **Phase 3 (Charts):** Recharts + TimescaleDB cagg query patterns are straightforward; no research needed beyond the data model established in Phase 1.

**Moderate complexity (targeted research recommended):**
- **Phase 4 (Push/iOS):** Web Push standard patterns are well-documented, but iOS Safari PWA push behaviour has known quirks and evolves with iOS releases. Targeted research on current iOS 18+ PWA push status recommended.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core framework choices (Next.js 16, TimescaleDB, Drizzle, Recharts) confirmed via official sources. QLD API client choice (axios) confirmed via community integrations. |
| Features | HIGH | QLD API data availability confirmed via Open Data Portal and Home Assistant community. Feature set derived from government API capabilities + clear project scope. |
| Architecture | HIGH | Standard scraper/API/dashboard patterns; TimescaleDB continuous aggregate design is well-documented. Component boundaries are clean and low-risk. |
| Pitfalls | MEDIUM-HIGH | QLD-specific pitfalls (price encoding, timezone, token management) confirmed via community integrations. Push notification pitfalls from established patterns. iOS PWA push behaviour is the one area with ongoing evolution. |

**Overall confidence: MEDIUM-HIGH**

The stack, architecture, and pitfalls are well-understood. The single gap is the QLD API live behaviour — specifically the geographic filter parameter IDs for the North Brisbane area and token authentication flow. This must be validated in Phase 1 before any dependent work proceeds.

---

### Gaps to Address

- **QLD API geographic parameters:** `geoRegionId` values for North Lakes / North Brisbane area are not confirmed without live API access. Register at fuelpricesqld.com.au before Phase 1 implementation begins; test endpoints with curl before writing scraper code.
- **QLD API rate limits and ToS:** The API terms of service must be reviewed post-registration. Confirm that 15-minute polling cadence is within acceptable use. No documented rate limit found in research, but ToS governs token continuation.
- **iOS PWA push current status:** iOS Safari PWA push notifications have historically been unreliable and version-gated. Verify current iOS 18+ behaviour before committing to iOS push support in Phase 4.
- **Token rotation policy:** It is not documented whether the QLD API token has an expiry or can be rotated by the provider. Confirm during registration; document in RUNBOOK.md regardless.

---

## Sources

### Primary (HIGH confidence)
- [Next.js 16 release blog](https://nextjs.org/blog/next-16) — version, Turbopack stable, Node.js 20.9 minimum, React 19.2
- [TimescaleDB Docker Hub](https://hub.docker.com/r/timescale/timescaledb) — 2.24.0-pg17 tag, Docker setup
- [Recharts GitHub releases](https://github.com/recharts/recharts/releases) — 3.8.0 current stable
- [web-push npm](https://www.npmjs.com/package/web-push) — v3.x active, VAPID support
- [Queensland Open Data Portal — Fuel Price Reporting 2025](https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025) — API availability, field names, monthly CSV fallback
- [TimescaleDB Continuous Aggregates documentation](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/create-a-continuous-aggregate/) — cagg design patterns

### Secondary (MEDIUM confidence)
- [Home Assistant Community — Queensland Fuel Prices Integration](https://community.home-assistant.io/t/queensland-fuel-prices-integration/406642) — confirmed exact API endpoints, auth header format, price integer encoding
- [QLD Treasury — Fuel Price Apps and Websites](https://www.treasury.qld.gov.au/policies-and-programs/fuel-in-queensland/fuel-price-apps-websites/) — registration path
- [ACCC — Petrol price cycles in the 5 largest cities](https://www.accc.gov.au/consumers/petrol-and-fuel/petrol-price-cycles-in-the-5-largest-cities) — Brisbane ~7 week cycle pattern
- [BullMQ vs node-cron — Better Stack](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/) — scheduling library tradeoffs
- [Drizzle vs Prisma 2026 — makerkit.dev](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) — ORM comparison
- [Healthchecks.io](https://healthchecks.io) — cron job dead-man's-switch monitoring
- [Web Push pitfalls (2024)](https://www.dr-lex.be/info-stuff/web-push.html) — push notification implementation experience

### Tertiary (LOW confidence / validate on implementation)
- [FuelPricesQLD Direct API (OUT) v1.6 PDF](https://www.fuelpricesqld.com.au/documents/FuelPricesQLDDirectAPI(OUT)v1.6.pdf) — official docs (requires registration to access; unverified before sign-up)
- [FuelPrice.io API](https://fuelprice.io/api/) — third-party fallback option (commercial, not recommended for this project)

---

*Research completed: 2026-03-22*
*Ready for roadmap: yes*
