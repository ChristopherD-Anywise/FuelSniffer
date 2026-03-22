# Pitfalls Research

**Domain:** Fuel price scraping and tracking dashboard (Queensland, Australia)
**Researched:** 2026-03-22
**Confidence:** HIGH (QLD-specific pitfalls), MEDIUM (general time-series/push patterns)

---

## Critical Pitfalls

### Pitfall 1: API Token Treated as a Static Credential

**What goes wrong:**
The fuelpricesqld.com.au API requires a subscriber token obtained via a signup process. Developers hard-code this token in source code or `.env` committed to version control. If the token is rotated by the government provider (which has happened with previous third-party API feeds being deprecated), the entire scraper silently fails with no data ingested — potentially for days before anyone notices.

**Why it happens:**
The token feels like config, so it goes into the config file. Personal projects skip secrets hygiene. The API gives no advance warning of credential changes.

**How to avoid:**
- Store the token exclusively in a `.env` file that is `.gitignore`d from day one
- Add a scraper health check that verifies a non-empty response from the API before committing a scrape run as "successful"
- Build an alert or log entry when zero price records are returned (distinguishable from a legitimate empty response)
- Document token renewal process in a `RUNBOOK.md` so it's not forgotten 6 months later

**Warning signs:**
- Dashboard shows no price updates for the last N minutes/hours
- Scraper logs show HTTP 401 or empty `SitePrices` arrays
- Station "last seen" timestamps frozen at a specific point in time

**Phase to address:** Scraper foundation phase (Phase 1 / data ingestion)

---

### Pitfall 2: Scraper Silently Fails and No One Knows

**What goes wrong:**
Cron/scheduled tasks that fail do not produce visible errors on a self-hosted home server. The scraper process crashes (OOM, network timeout, uncaught exception), cron restarts it next cycle, and the database has silent gaps of 15, 30, 60 minutes with no price data. Users see a chart with missing segments and assume the data is live.

**Why it happens:**
Cron job exits with code 0 even when the scraper errors out internally (if error is caught and swallowed). No external monitoring on a home server. A personal project gets checked every few days, not every 15 minutes.

**How to avoid:**
- Implement a "heartbeat" table: every successful scrape run writes a timestamp. A separate lightweight health check endpoint exposes the last successful scrape time
- Use a dead-man's-switch monitor (healthchecks.io free tier) — the scraper pings a URL after each successful run; if the ping stops, an alert fires via email
- Add structured logging with explicit `SCRAPE_SUCCESS` / `SCRAPE_FAILURE` log entries
- Dashboard prominently shows "last successful update" timestamp so users can self-detect staleness
- Distinguish between "API returned no changes" (valid) and "API was unreachable" (failure) — log these differently

**Warning signs:**
- Chart time axis has gaps at regular intervals
- "Last updated" timestamp stale by more than 20 minutes
- Log file size stops growing

**Phase to address:** Scraper foundation phase (Phase 1). Monitoring/ops hardening is worth a dedicated task in that phase.

---

### Pitfall 3: Price Data is Stale at the Source — Not Just in Your Scraper

**What goes wrong:**
Queensland regulations require retailers to report price changes within 30 minutes of a bowser change. In practice, some stations report late, infrequently, or not at all. Stations that have permanently closed still appear in the dataset for months. A dashboard displaying "price last updated 3 hours ago" for a station is showing real API data — the station just hasn't complied. Users trust the price, drive there, and find a different price on the bowser.

**Why it happens:**
The dataset is government-mandated reporting, not live sensor data. Compliance varies. The API makes no distinction between "recently reported" and "last known price from 8 hours ago."

**How to avoid:**
- Every price record in the database stores its source `TransactionDateUtc` alongside the scrape timestamp — these are different fields
- Dashboard displays a per-station "price as of [time]" rather than a global "last updated" timestamp
- Apply a visual staleness indicator: prices older than 2 hours shown with a warning colour (amber/grey), prices older than 6 hours shown as "price may be outdated"
- Filter out stations with no price update in 24+ hours from the default view (they can be shown via an "include stale stations" toggle)

**Warning signs:**
- A station's `TransactionDateUtc` is significantly older than the scrape timestamp
- Stations in the dataset with addresses that do not correspond to active service stations

**Phase to address:** Data model design (Phase 1) for schema. Dashboard UX (Phase 2/3) for staleness indicators.

---

### Pitfall 4: Timezone Confusion Between Queensland, UTC, and the Server

**What goes wrong:**
Queensland does not observe daylight saving time. It is permanently UTC+10 (AEST). However, other Australian states (NSW, VIC, TAS) shift to UTC+11 in summer. If the server or any library defaults to "Australia/Sydney" instead of "Australia/Brisbane", time-based queries and chart labels shift by one hour for half the year. "Cheapest time of day" analysis becomes wrong. Alert thresholds that fire at "8am local" fire at 7am or 9am depending on the season. The QLD API returns `TransactionDateUtc` in UTC — requiring explicit conversion.

**Why it happens:**
"Australia/Sydney" is the most commonly cited timezone in Australian examples online. Developers use it without knowing Sydney observes DST. JavaScript `new Date()` uses the system timezone, which may be UTC on a server. Libraries like Moment.js historically conflated AEST/AEDT under a single `EST` label.

**How to avoid:**
- Set the server's timezone environment variable explicitly: `TZ=Australia/Brisbane` in all Docker/process configs
- Store all timestamps in the database as UTC
- Use `Australia/Brisbane` (not `Australia/Sydney`) in all `Intl.DateTimeFormat` or date-fns/Luxon timezone conversions
- Write a timezone unit test: confirm that a UTC timestamp known to be 10am Brisbane shows as 10am Brisbane regardless of what month it is (i.e., does not shift with NSW DST)
- Never rely on `new Date().toLocaleDateString()` on the server — always pass an explicit timezone

**Warning signs:**
- "Cheapest time of day" analysis shows an anomalous 1-hour shift in the data between October and April
- Alert notifications fire one hour off from expected time in summer
- Chart X-axis labels shift unexpectedly at DST boundary dates

**Phase to address:** Data model and scraper (Phase 1). Date utility layer should be established before any time-based querying is built.

---

### Pitfall 5: Price Encoding — Integer Division Error

**What goes wrong:**
The fuelpricesqld.com.au API returns `Price` as an integer. Based on documented community experience (Home Assistant integration), prices require division by 10 to convert to cents per litre (e.g., `1459` = 145.9 cents/litre = $1.459/litre). If this division is missed or applied inconsistently, prices stored in the database are an order of magnitude wrong. Charts show fuel at $14.59/litre. Alert thresholds never fire because stored values never match real-world prices.

**Why it happens:**
The API documentation is sparse (no functional Swagger UI). Developers assume the API returns decimal values matching the display price. Integer encoding for precision preservation is a common API pattern that is easy to miss without reading the raw response carefully.

**How to avoid:**
- On day one, log raw API response values alongside their human-readable equivalent
- Write a validation assertion: if any `Price` value exceeds 500 (after conversion to cents/litre), log a data integrity warning — this catches encoding mistakes before they persist to the database
- Define a single canonical price conversion function (e.g., `rawToPrice(raw: number): number`) and use it everywhere — never inline the division

**Warning signs:**
- Database prices are in the 1000–2000 range instead of 140–220
- Alert thresholds never fire despite prices meeting conditions
- Chart Y-axis shows values like 1459 instead of 145.9

**Phase to address:** Scraper and data ingestion (Phase 1).

---

### Pitfall 6: Push Notification Subscription Rot

**What goes wrong:**
Browser Push API subscriptions expire, become invalid when a user clears browser data, or are silently revoked by iOS/Safari. The server accumulates a growing list of dead push endpoints. When a price alert fires, the server attempts delivery to all stored subscriptions including the dead ones, generating a flood of 404/410 HTTP errors from push services. On a self-hosted server without proper error handling, this can cause the alert delivery loop to hang or crash. Users who cleared their browser data never receive alerts but receive no feedback that they are no longer subscribed.

**Why it happens:**
Push subscriptions are not persistent forever. Apple's WebKit PWA implementation is documented as buggy and was nearly removed. A small personal project tends not to implement subscription lifecycle management. The Web Push spec requires servers to handle 410 Gone responses by deleting that subscription, but this step is often skipped.

**How to avoid:**
- On every push delivery attempt, handle HTTP 410 (Gone) and HTTP 404 responses by immediately deleting that subscription from the database
- Add a UI indicator showing whether the current browser has an active push subscription ("Alerts: On / Off")
- Implement a re-subscribe flow in the dashboard — simple button that re-registers the current browser
- Cap the delivery retry attempts per subscription to 3 before marking it as dead
- For iOS Safari specifically: test on iOS with a PWA installed to the home screen — push only works from installed PWAs on iOS, not browser tabs

**Warning signs:**
- Subscription table grows unboundedly over months
- Alert delivery logs show a high ratio of 404/410 errors
- A user reports "I stopped getting alerts" after an iOS update or browser reset

**Phase to address:** Alert and notification phase (Phase 3/4). Subscription lifecycle management must be built alongside the push delivery mechanism, not as an afterthought.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store all prices as raw 15-min rows forever, no aggregation | Simple schema, easy to query | Database grows ~500MB/year for 100 stations; queries slow down | Never — implement hourly aggregation from the start |
| Use `Australia/Sydney` timezone instead of `Australia/Brisbane` | Works right now (March) | Charts shift by 1 hour in October when NSW enters DST | Never for this QLD-only project |
| Skip "last successful scrape" heartbeat tracking | Saves 20 lines of code | Silent data gaps go undetected for hours/days | Never for a self-hosted background job |
| Hard-code price thresholds in alert queries | Avoids building alert config UI | Changing a threshold requires a code deploy | Acceptable in Phase 1 MVP; build config UI in later phase |
| Single shared auth token for all friends | No auth system to build | No way to revoke individual access; one token leak = everyone in | Acceptable for v1 small trusted group; revisit if any issues arise |
| Skip dead push subscription cleanup | No extra code needed | Delivery errors accumulate; potential crash on alert fire | Never — cleanup is 5 lines of code |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| fuelpricesqld.com.au API | Assuming Swagger/docs are accurate — they are reportedly non-functional | Test endpoints directly with curl/Postman; trust raw response over docs |
| fuelpricesqld.com.au API | Pulling all QLD data at once without geographic filtering | Use `geoRegionLevel` and `geoRegionId` parameters; excessive data causes performance issues |
| fuelpricesqld.com.au API | Treating API token as permanent — never checking expiry | Document token rotation procedure; add monitoring for auth failures |
| Web Push API (VAPID) | Using same VAPID keys across dev and prod environments | Generate separate VAPID key pairs per environment; document them securely |
| Web Push API (iOS) | Testing push in desktop Safari and assuming iOS works the same | Test on actual iOS PWA installed to home screen — iOS push only works from installed PWAs |
| Cron/scheduler | Using system cron without capturing exit codes | Use a process manager (PM2, systemd) with restart-on-failure; log stdout/stderr |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Querying raw 15-min price rows for trend charts spanning weeks | Chart load time > 5 seconds | Pre-aggregate to hourly rollups; only query raw data for today's view | ~30 days of data for 100 stations (~28,000 rows/day) |
| Loading all stations on dashboard without geographic filter | Initial page load slow; mobile browsers struggle | Default to 20km radius filter; lazy-load out-of-radius stations | >200 stations in active dataset |
| Running aggregation rollup synchronously during scrape cycle | Scrape job blocks for 2-3 seconds per run | Run aggregation as a separate scheduled job (e.g., hourly, offset from scrape) | When database has more than a few weeks of data |
| Storing chart data as JSON blobs in database | Flexible at first | Cannot be indexed or queried; dashboard queries pull entire blobs | Immediately — avoid this pattern entirely |
| Sending push notifications synchronously in the scrape loop | Simple to implement | Alert delivery blocks scrape; one dead subscription causes timeout | With 5+ subscribers + 1 dead subscription |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing `.env` with API token to git repo | Government API token exposed; potential ToS violation | `.gitignore` `.env` from day one; use `git-secrets` or pre-commit hook |
| Exposing dashboard on public internet without any auth | Any internet user can see your location-based price data and alert configs | Even for friends: put behind VPN, Basic Auth, or IP allowlist; do not expose raw on port 80/443 |
| VAPID private key stored in plaintext in code | Push notification system can be hijacked | Store VAPID keys in `.env` only; never in source code |
| No rate limiting on dashboard API endpoints | Automated scraping of your scraper; server overload | Add basic rate limiting (e.g., 60 req/min per IP) even for a personal project |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing one global "data last updated" timestamp | Users don't know which stations have stale prices | Show per-station "price as of [time]" with staleness colouring |
| Price alerts that fire on every scrape cycle while condition is met | User gets 96 notifications/day for a price that stays below threshold | Track alert state: fire once when condition first met; re-arm only when condition clears, then re-triggers |
| No visual indication that push alerts are active in current browser | Users unsure if alerts are working; can't debug subscription state | Show "Alerts enabled in this browser" badge; allow manual test notification |
| Displaying prices with full precision from API (e.g., 145.9 c/L) without context | Confusing for users unfamiliar with "cents per litre" format | Display as "$1.459/L" consistently; match pump display format |
| Default radius too large (whole Brisbane) for initial load | Map/list overwhelms users; harder to see local patterns | Default to 20km radius around North Lakes as specified; make radius adjustable but not larger than 50km by default |
| Charts default to "all time" view | Slow to load; short-term trends obscured by long-term noise | Default to 7-day view; allow user to expand to 30/90 days |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Scraper:** Appears to run — verify it writes a heartbeat timestamp and the health endpoint reflects it; don't just check if the process is running
- [ ] **Price alerts:** Alert fires in test — verify it does NOT fire again on the next scrape cycle if price hasn't changed; check debounce/state logic
- [ ] **Timezone display:** Charts show correct Brisbane time — verify in October/November that times do not shift with NSW daylight saving (Queensland stays UTC+10)
- [ ] **Stale station filtering:** Dashboard shows "active" stations — verify closed/non-reporting stations are filtered or marked, not silently shown with old prices
- [ ] **Push notifications:** Desktop browser test passes — verify on iOS PWA installed to home screen; iOS push is a separate code path
- [ ] **Price encoding:** Values look plausible in UI — verify raw database values are in the 100–250 range (cents/litre), not 1000–2500 (raw integer)
- [ ] **Hourly aggregation:** Historical chart works — verify raw 15-min rows are being rolled up and not duplicated in the hourly table
- [ ] **Dead subscription cleanup:** Push delivery succeeds — verify HTTP 410 responses from push services result in subscription deletion from database

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| API token expired / rotated — days of missing data | LOW | Re-register at fuelpricesqld.com.au; update `.env`; restart scraper; gaps in data are permanent but future data resumes normally |
| Timezone bug discovered after weeks of data collection | HIGH | Write a migration to shift all stored local timestamps by the offset error; re-aggregate hourly rollups from corrected raw data; validate with known price events |
| Price encoding bug (10x prices in database) | HIGH | Write migration to divide all stored Price values by 10; recalculate any derived aggregates; alert thresholds may need recalibration |
| Push subscription table filled with dead endpoints | LOW | One-time cleanup query: delete subscriptions where last delivery attempt returned 410; add 410 handler to prevent recurrence |
| Silent scraper failure — multi-day data gap | MEDIUM | Data gap is permanent; restart scraper with fixed monitoring; document the gap date range for chart annotations |
| Scraper pulls all QLD data without geo-filter — server OOM | LOW | Add geo filter parameters to API call; restart; no data loss if crash occurred before write |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| API token as static credential | Phase 1: Scraper & Data Ingestion | `.env` exists, is git-ignored, token renewal is documented |
| Silent scraper failure | Phase 1: Scraper & Data Ingestion | Health check endpoint returns last scrape timestamp; heartbeat monitoring configured |
| Source data staleness | Phase 1: Data Model + Phase 2: Dashboard | `TransactionDateUtc` stored per record; staleness colouring visible in UI |
| Timezone (UTC vs AEST, QLD vs NSW) | Phase 1: Data Model | Timezone unit test passes; server `TZ=Australia/Brisbane` set |
| Price integer encoding | Phase 1: Scraper & Data Ingestion | Database spot-check shows prices in 100–250 c/L range |
| Push subscription rot | Phase 3/4: Alerts & Notifications | 410 handler deletes dead subscriptions; UI shows subscription state |
| Time-series storage growth | Phase 1: Data Model | Hourly aggregation job exists and runs; raw table has retention policy |
| Alert double-firing | Phase 3/4: Alerts & Notifications | Alert state tracked in DB; verified via consecutive-scrape test |
| Geographic data volume | Phase 1: Scraper | Geo filter parameters used in all API calls; not pulling full QLD dataset |

---

## Sources

- Queensland Government Open Data Portal — Fuel Price Reporting 2025: https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025
- Home Assistant Community — Queensland Fuel Prices Integration (real-world API usage experience): https://community.home-assistant.io/t/queensland-fuel-prices-integration/406642
- QLD Treasury — Report Your Fuel Prices: https://www.treasury.qld.gov.au/policies-and-programs/fuel-in-queensland/report-your-fuel-prices/
- QLD Treasury — Fuel Price Apps and Websites: https://www.treasury.qld.gov.au/policies-and-programs/fuel-in-queensland/fuel-price-apps-websites/
- Sprintlaw — Web Scraping Laws in Australia: https://sprintlaw.com.au/articles/web-scraping-laws-in-australia-legal-risks-and-compliance/
- Web Push Notifications implementation pitfalls (2024): https://www.dr-lex.be/info-stuff/web-push.html
- Building Robust Push Notifications for PWAs: https://yundrox.dev/posts/claritybox/building-robust-pwa-push-notifications/
- TimescaleDB vs PostgreSQL for time-series: https://maddevs.io/writeups/time-series-data-management-with-timescaledb/
- Healthchecks.io — cron job dead-man's-switch monitoring: https://healthchecks.io
- Moment-timezone AEST/AEDT issue: https://github.com/moment/moment-timezone/issues/372

---
*Pitfalls research for: Fuel price scraping and tracking dashboard (Queensland, Australia)*
*Researched: 2026-03-22*
