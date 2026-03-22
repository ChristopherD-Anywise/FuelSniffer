# Phase 1: Data Pipeline - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

QLD Fuel Price API integration, TimescaleDB schema design, 15-minute scraper with health monitoring. Delivers clean, correctly-encoded fuel price data flowing into the database on schedule. No UI, no dashboard, no alerts — just the data pipeline.

</domain>

<decisions>
## Implementation Decisions

### Deployment Setup
- **D-01:** Docker Compose for all services (TimescaleDB, Next.js app with embedded scraper)
- **D-02:** Target platform is a home server/PC running x86 Linux
- **D-03:** Cloudflare Tunnel for HTTPS access (no port forwarding, no manual cert management)

### Data Storage
- **D-04:** Keep raw 15-minute data for 7 days before rolling up to hourly via TimescaleDB continuous aggregates
- **D-05:** Soft-delete closed/relocated stations — mark as inactive, keep history, hide from current views
- **D-06:** Only store stations within ~50km of North Lakes (filter on ingest, not query time)
- **D-07:** Store ALL fuel types the API returns (filter in the UI layer, not at storage)

### Scraper Behavior
- **D-08:** On API failure: retry 3 times with backoff, then skip that cycle and try again at next 15-min window
- **D-09:** Always insert a row every 15 minutes regardless of whether price changed (consistent time series)
- **D-10:** Minimal logging — errors and summary stats only (e.g. "150 prices updated")
- **D-11:** Immediate fetch on startup, then every 15 minutes on schedule

### Claude's Discretion
- Health monitoring implementation details (healthchecks.io integration, /api/health endpoint design)
- Database schema design (table structure, indexes, hypertable configuration)
- TimescaleDB continuous aggregate configuration
- Price encoding conversion approach (API integer ÷ 10 → cents/L)
- Timezone handling implementation (UTC storage, Australia/Brisbane display)
- Station distance calculation method (haversine or PostGIS)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### QLD Fuel Price API
- `.planning/research/STACK.md` — API endpoint details, auth flow, price encoding
- `.planning/research/FEATURES.md` — API endpoints, fuel type IDs, geographic filtering
- `.planning/research/PITFALLS.md` — Price integer encoding (÷10), timezone trap (Australia/Brisbane not Sydney), stale data handling

### Architecture
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, TimescaleDB schema patterns
- `.planning/research/SUMMARY.md` — Key findings and day-one correctness traps

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — first phase establishes patterns

### Integration Points
- Docker Compose will be the deployment foundation for all subsequent phases
- Database schema established here constrains all future query patterns
- Scraper schedule and data shape feed directly into Phase 2 dashboard queries

</code_context>

<specifics>
## Specific Ideas

- QLD Government fuel price API at `fppdirectapi-prod.fuelpricesqld.com.au` — register at fuelpricesqld.com.au as "data consumer" for free token
- Prices returned as integers (1459 = 145.9 c/L) — must divide by 10
- Queensland has no DST — always UTC+10, use `Australia/Brisbane` timezone
- Stations must report within 30 minutes of price change — 15-min polling is appropriate

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-data-pipeline*
*Context gathered: 2026-03-23*
