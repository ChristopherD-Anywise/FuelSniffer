# FuelSniffer — Product Requirements Document

## 1. Product Vision

FuelSniffer is a fuel price intelligence platform that helps Australian drivers find the cheapest fuel near them, understand price trends, and get notified when prices drop. It starts with Queensland and expands nationwide.

**Core promise:** Never overpay for fuel again.

**Target audience:** Australian drivers who regularly fill up and care about getting a fair price — not extreme couponers, just people who want to quickly check if now is a good time to fill up and where to go.

## 2. What We Built (MVP — v1.0)

### 2.1 Data Pipeline

- **Primary source:** Queensland Government Fuel Price Direct API (real-time, event-driven price reports from stations)
- **Fallback source:** CKAN Open Data Portal (monthly CSV dumps, no auth required) — automatic failover when primary is unavailable
- **Scrape frequency:** Every 15 minutes via cron scheduler
- **Deduplication:** Only stores actual price changes by comparing `source_ts` (when the station reported) against existing data — not time-series padding
- **Geographic filter:** Haversine distance filter at ingest time — only stores stations within a configurable radius of a reference point
- **Price validation:** Sentinel values (999.9 c/L) and out-of-range prices are rejected at ingest with logging
- **Brand resolution:** Station brand is an integer ID in the API — resolved to human-readable name via a separate brands endpoint, cached per scrape cycle

### 2.2 Data Storage

- **Time-series database** with hypertable partitioning on `recorded_at`
- **Continuous aggregate** (hourly rollup) for trend queries — avg/min/max price per station per hour
- **Retention policy:** 7 days for raw 15-minute data, hourly aggregates retained indefinitely
- **Schema:** Stations (metadata + lat/lng), Price Readings (station + fuel type + price + timestamps), Scrape Health (monitoring)

### 2.3 API Layer

| Endpoint | Purpose |
|---|---|
| `GET /api/prices?fuel=N&radius=N&lat=N&lng=N` | Latest price per station, sorted by price, with Haversine distance |
| `GET /api/prices/history?station=N&fuel=N&hours=N` | Hourly price history for a station (queries continuous aggregate) |
| `GET /api/health` | Scrape health status — last run time, prices ingested, error state |
| `POST /api/auth/login` | Invite code authentication |
| `GET /api/admin/invite-codes` | Admin: manage access codes |

### 2.4 Frontend Dashboard

- **Station list:** Sorted by price or distance, shows price badge, station name, brand, address, distance, and time since last price report (from API `source_ts`, not scrape time)
- **Interactive map:** Price-coloured pin markers (green=cheap, red=expensive via HSL interpolation), click to open popup
- **Map popup:** Station details + embedded price history chart (Recharts area chart with 24h/3d/7d toggle) + Google Maps / Apple Maps navigation links
- **Fuel type selector:** Pills for ULP, P95, P98, E10, Diesel, Premium Diesel, LPG
- **Radius slider:** 1–50km configurable
- **Geolocation:** "Locate me" button to center on user's position
- **URL-driven state:** Fuel type, radius, and sort mode persisted in URL params
- **Responsive:** Two-column (list + map) on desktop, toggle between list/map on mobile

### 2.5 Authentication

- Invite code system for private MVP — 8-char hex codes, individually revocable
- Session cookies (JWT) with 7-day expiry
- Middleware-based route protection

### 2.6 What Worked Well

- **Scrape-then-filter pattern:** Fetch all QLD data, filter to radius at ingest. Simple, avoids complex geo-queries against the external API.
- **source_ts deduplication:** Massive storage reduction (~6x) by only storing actual price changes rather than re-recording unchanged prices every 15 minutes.
- **Continuous aggregates:** Pre-computed hourly rollups make trend queries fast without burdening the raw table.
- **Automatic data source failover:** CKAN fallback means the app works even without API credentials — useful for development and resilience.
- **Brand resolution at ingest:** Joining brand IDs to names once during scrape means the API layer returns human-readable data without extra lookups.

### 2.7 What Needs Improvement

- **Map popup UX:** Current implementation uses `createRoot` to render React inside Leaflet popups — works but is clunky, has race conditions during unmount, and the popup sizing is fragile.
- **Data accuracy:** Station addresses come from the API as-is. Need cross-referencing with Google Places (GPI field exists) to validate and enrich location data.
- **No historical backfill:** Trend charts are empty until enough scrape cycles accumulate. Should pre-populate from CKAN monthly archives.
- **Single region:** Currently hardcoded to North Lakes, QLD. Needs to be user-configurable.

## 3. Product Roadmap — v2.0 and Beyond

### 3.1 Phase: Go Public

**Goal:** Remove invite-code gate, add ad-supported access for anyone.

- Replace invite code auth with open access (optional account for saved preferences)
- Ad integration — non-intrusive banner/interstitial that doesn't interfere with the core "check price quickly" flow
- Privacy policy, terms of service
- Rate limiting and abuse protection on API endpoints
- SEO: server-rendered pages for "cheapest fuel in [suburb]" queries

### 3.2 Phase: All of Queensland

**Goal:** Remove the 50km radius filter. Show every station in QLD.

- Remove hardcoded North Lakes reference point — user's location (or search) becomes the center
- Dynamic radius: user sets their search radius, API filters to that
- Suburb/postcode search: "Show me fuel near Townsville" without requiring geolocation
- Performance: with ~1,800 QLD stations, ensure map rendering and API queries remain fast
- Station clustering on map at low zoom levels

### 3.3 Phase: Nationwide Expansion

**Goal:** Cover all Australian states and territories.

- **Data source audit per state:**
  - QLD: Direct API (have it) + CKAN fallback
  - NSW: FuelCheck API (government-mandated reporting)
  - VIC: Victorian government fuel price data
  - SA: SA fuel pricing scheme
  - WA: FuelWatch (government)
  - TAS, NT, ACT: research required — may need third-party aggregators
- Unified data model: normalise each state's schema to a common format at ingest
- Multi-source scraper architecture: per-state scraper modules with a shared writer/normaliser interface
- State selector or automatic detection based on user location

### 3.4 Phase: Fuel Price Cycle Intelligence

**Goal:** Help users understand price patterns and time their fill-ups.

- **Cycle detection:** Analyse historical data to identify the fuel price cycle (typically 2–4 weeks in capital cities, flatter in regional areas)
- **Cycle visualisation:** "Where are we in the cycle?" indicator — rising, peak, falling, trough
- **Buy/wait recommendation:** "Prices are rising — fill up now" or "Prices are falling — wait 2 days"
- **Per-region cycles:** Different areas cycle at different times — detect and display per-suburb or per-cluster
- **Confidence scoring:** Cycles aren't perfectly regular — show confidence level based on historical pattern consistency

### 3.5 Phase: Push Notifications

**Goal:** Proactive alerts when fuel hits a user's target price.

- **Browser push notifications** (Web Push API with VAPID keys — self-hosted, no Firebase dependency)
- **Alert configuration:**
  - Per fuel type (e.g. "alert me for Diesel only")
  - Per radius (e.g. "within 15km of my home")
  - Price threshold (e.g. "below 240 c/L") or relative ("cheapest in my area dropped 5+ cents")
- **Delivery rules:** Max 1 notification per day to avoid fatigue. Batch multiple station matches into one notification.
- **Cycle-based alerts:** "Prices are at the bottom of the cycle — good time to fill up"

### 3.6 Phase: Data Accuracy & Enrichment

**Goal:** Ensure station data is trustworthy and complete.

- **Google Places cross-reference:** Use the `GPI` (Google Place ID) already in API data to:
  - Validate/correct station addresses
  - Get opening hours (API has fields but they're mostly empty)
  - Get user ratings and photos
  - Detect closed/relocated stations
- **Stale price detection:** Flag stations that haven't reported a price change in X days — likely closed or not reporting
- **Data freshness indicator:** Clear visual signal showing how recent each price is (already partially done with `source_ts`)

### 3.7 Phase: Map & Popup Redesign

**Goal:** Fix the clunky popup UX, make the map interaction feel native.

- **Replace Leaflet popup with a custom panel:** Instead of fighting Leaflet's popup system with React portals, use a slide-up detail panel (mobile) or side panel (desktop) that renders as a normal React component
- **Station detail view:** Full page/panel with:
  - Price history chart (larger, interactive)
  - Station metadata (address, brand, opening hours)
  - Navigation links
  - Fuel type tabs within the detail view
  - "Nearby alternatives" — other stations within 2km
- **Map improvements:**
  - Cluster markers at low zoom
  - Smooth pan to selected station
  - Better price-to-colour mapping that accounts for fuel type (diesel is always more expensive than ULP — colour should be relative within fuel type)

## 4. Success Metrics

| Metric | MVP Target | v2.0 Target |
|---|---|---|
| Data freshness | 95% of prices < 30 min old | 95% of prices < 15 min old |
| Scraper uptime | 95% | 99.5% |
| Page load (dashboard) | < 3s | < 1.5s |
| Active users | 5–10 friends | 1,000+ monthly |
| State coverage | QLD only | QLD + NSW + VIC |
| Price accuracy | Trust API (no validation) | Cross-referenced with Google Places |

## 5. Non-Functional Requirements

- **Self-hosted:** Must run on personal infrastructure without cloud vendor lock-in. Cloud deployment optional for scale.
- **Lightweight:** Scraper must be respectful of source API rate limits. Single-process architecture preferred until scale demands otherwise.
- **Privacy:** No user tracking beyond what's needed for notifications. No selling of user data. Ad integration must be privacy-respecting.
- **Offline resilience:** CKAN fallback ensures data availability even if the primary API is down. Scraper failures are logged and monitored via health endpoint + dead man's switch.

## 6. Decisions Made

1. **Monetisation:** Ads from day one of public launch. No freemium or subscription tier.
2. **Account system:** Anonymous browsing, no login required. Optional sign-up only for push notification alerts and saved preferences.
3. **Data API:** No public API. "Contact us for data access, fees apply" — positioned as a commercial data licensing opportunity.
4. **Data retention:** Raw 15-minute data retained 7 days (existing). Hourly aggregates retained 1 month, then rolled up to daily aggregates and retained indefinitely.
5. **State expansion order:** QLD (done) → VIC → NSW → then remaining states.
