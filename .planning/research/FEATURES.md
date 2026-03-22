# Feature Research

**Domain:** Fuel price tracking dashboard (Queensland, Australia)
**Researched:** 2026-03-22
**Confidence:** HIGH (QLD API details), MEDIUM (competitor feature parity)

---

## Critical Finding: Queensland Fuel Price Data Source

This is the primary data source for the entire project. Understanding it fully is prerequisite to everything else.

### Official API: FuelPricesQLD Direct API (OUT) v1.6

Queensland has a government-mandated fuel price reporting scheme. All fuel retailers must report price changes within 30 minutes. The state provides this data to developers via a free outbound API.

**Registration:** Sign up at https://www.fuelpricesqld.com.au as a "data consumer." After accepting the Limited Use Licence Terms of Service, you receive a security token by email. The API is free.

**API Base URL:** `https://fppdirectapi-prod.fuelpricesqld.com.au/`

**Authentication:** Bearer token header
```
Authorization: FPDAPI SubscriberToken=YOUR_TOKEN_HERE
```

**Key Endpoints (confirmed from community integrations):**

| Endpoint | Purpose |
|----------|---------|
| `GET /Price/GetSitesPrices?countryId=21&geoRegionLevel=X&geoRegionId=Y` | Current prices for all stations in a region |
| `GET /Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=X&geoRegionId=Y` | Station metadata (name, address, lat/lng, brand) |
| `GET /Subscriber/GetCountryFuelTypes?countryId=21` | List of fuel type IDs and names |

**Geographic parameters:**
- `geoRegionLevel`: 1 = suburb, 2 = city, 3 = state
- `geoRegionId`: Corresponding numeric ID for the region
- `countryId=21` is the constant for Australia/Queensland

**Response format:** JSON. The `Price` field is an integer — divide by 10 to get cents per litre (e.g., `1234` = 123.4 c/L).

**Data freshness:** Stations must report within 30 minutes of a price change. The API reflects near-real-time data.

**Official documentation:** `https://www.fuelpricesqld.com.au/documents/FuelPricesQLDDirectAPI(OUT)v1.6.pdf` (requires registration to access)

**Open Data Portal (historical/monthly CSVs):** https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025
- Monthly CSV files with fields: Site Brand, Address, Suburb, Postcode, Latitude, Longitude, Fuel Type ID, Price, Transaction DateUTC
- License: CC-BY 4.0
- Note: The 2025 dataset shows "last updated January 2026" — the monthly CSV dumps are useful for backfilling history but are not the real-time source

**Alternative data aggregators (if official API has friction):**
- FuelMap app endpoints: `http://www.fuelmap.com.au/app/getprices2.php` — unofficial, scrape risk
- FuelPrice.io API: Commercial third-party at ~$250 AUD/month — not warranted for this use case

**Confidence:** HIGH — confirmed via Home Assistant community integration threads and official government portal documentation.

---

## Queensland Fuel Price Cycle Context

Brisbane has an approximately 7-week price cycle (up from 4 weeks in 2018). Within each cycle:
- Days 1–2: Trough (optimal fill time)
- Days 2–4: Sharp rise
- Days 4–5: Peak (avoid filling)
- Days 5–7: Gradual fall back toward trough

Tuesday is typically the cheapest day of the week in Brisbane. The cycle is not strictly weekly — it drifts. This pattern is what makes trend analysis genuinely useful to users.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features every fuel price app has. Missing these = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Current prices for nearby stations | Core value proposition — without this, there is no product | LOW | Pull from QLD API on each page load or from cache |
| Station list view with prices | Users need to scan and compare quickly | LOW | Sorted by price or distance |
| Map view with station pins | Every app has this; users orient spatially | MEDIUM | Color-coded pins (green = cheap, red = expensive) |
| Fuel type filter | ULP91, ULP95, ULP98, Diesel, E10, E85 are all different products | LOW | Dropdown/tab filter; persist preference in localStorage |
| Distance/radius filter | "Near me" is the primary use case | LOW | Default 20km radius per PROJECT.md; allow adjustment |
| Price sorting (cheapest first) | Obvious user need | LOW | Secondary sort by distance |
| Station detail view | Address, brand, fuel types available, last updated timestamp | LOW | Single click/tap from list or map |
| Mobile-responsive layout | Most fuel price lookups happen in/near cars | LOW | Tailwind or similar responsive grid |
| Data freshness indicator | Users need to trust the data is current | LOW | Show "last updated X minutes ago" per station |

### Differentiators (Competitive Advantage)

Features that go beyond the baseline. These are where FuelSniffer competes given its specific context (North Brisbane focus, historical data ownership, personal project with full data control).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Price history charts (per station) | See whether a station is at its cycle high or low right now | MEDIUM | Line chart with 7/14/30 day window; Chart.js or similar |
| Price-over-time for an area (aggregate) | Understand the North Brisbane market, not just individual stations | MEDIUM | Average/min/max band chart across all tracked stations |
| Cycle position indicator | Tell the user where we are in the ~7-week Brisbane cycle | HIGH | Requires enough historical data to detect cycle phase; valuable once working |
| Cheapest time pattern (day-of-week heatmap) | "Tuesday is cheapest" validated against your actual local data | MEDIUM | Aggregate historical data by day-of-week and hour |
| Station comparison charts | Side-by-side price history for 2–3 stations | MEDIUM | Helps identify which stations move first in the cycle |
| Push notification price alerts | "ULP91 dropped below 170c/L within 20km" | HIGH | Web Push API + Service Worker; requires HTTPS and user opt-in |
| Configurable alert thresholds | Price-below-X triggers notification | LOW | Per fuel type, per price level |
| Favourite stations | Quick access to the stations you actually use | LOW | localStorage or DB-backed list |
| Price delta indicator | Show how much a price changed since last check (up/down arrows + cents) | LOW | Compare current price to previous recorded price |
| "Best time to fill" summary card | Single-answer card: "Now is a good time" / "Wait 2 days" based on cycle | HIGH | Requires cycle detection; high user value once working |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Crowdsourced price reporting | GasBuddy/MotorMouth use this for freshness | Requires moderation, spam prevention, user trust model; adds massive complexity; QLD mandatory reporting makes it unnecessary | Rely entirely on official API which is near-real-time |
| User accounts / login | Multiple users sharing the app | Auth system, password resets, session management — heavyweight for "a few friends"; attack surface; hosting complexity | Shared-secret URL or simple HTTP basic auth for the small group |
| Native mobile app (iOS/Android) | Better UX, push notifications | App store submission, platform-specific code, review cycles, updates; not warranted for small group | PWA with Web Push satisfies notification need; responsive web covers UX |
| SMS/email alerts | Broader notification delivery | Third-party services (Twilio, SendGrid), costs, rate limits, spam risk | Web Push covers the use case for users who accept the notification prompt |
| Fuel station reviews/ratings | Users want to share experiences | Content moderation, off-topic for price tracking, social features are a different product | Link to Google Maps for reviews |
| Route-based price finding | "Cheapest along my route" like Waze | Requires mapping SDK, routing API, significant UX complexity | Out of scope for local North Brisbane focus |
| Fuel economy tracking (MPG/L per 100km) | Vehicle management features | Different product category; requires fill-up logging | Link to LubeLogger or Fuelly |
| Real-time price streaming (WebSockets) | Feels modern | QLD API updates at most every 30 minutes when stations report; polling every 15 min is appropriate; WebSockets add infrastructure complexity for no real benefit | 15-minute polling with cache is correct approach |
| Public-facing service | Share more widely | Scaling, abuse, moderation, legal liability for data accuracy | Keep private; PROJECT.md explicitly out of scope |

---

## Feature Dependencies

```
[QLD API Integration] (data ingestion)
    └──required by──> [Current Prices View]
    └──required by──> [Station List View]
    └──required by──> [Map View]
    └──required by──> [Fuel Type Filter]

[Current Prices View]
    └──required by──> [Price Delta Indicator]
    └──required by──> [Favourite Stations]

[Historical Data Storage] (15-min raw, hourly aggregated)
    └──required by──> [Price History Charts]
    └──required by──> [Station Comparison Charts]
    └──required by──> [Cheapest Time Heatmap]
    └──required by──> [Cycle Position Indicator]
    └──required by──> [Area Aggregate Charts]
    └──required by──> ["Best Time to Fill" Card]

[Price History Charts]
    └──enhances──> [Station Comparison Charts]

[Cycle Position Indicator]
    └──required by──> ["Best Time to Fill" Card]

[HTTPS + Service Worker]
    └──required by──> [Push Notification Alerts]

[Push Notification Alerts]
    └──required by──> [Configurable Alert Thresholds]

[Distance Filter]
    └──enhances──> [Current Prices View]
    └──enhances──> [Push Notification Alerts]
```

### Dependency Notes

- **Historical data storage requires QLD API integration:** You cannot build trend features without first having a scraper that stores data over time. The scraper must run for at least 7–14 days before cycle analysis becomes meaningful.
- **Cycle position indicator requires sufficient history:** Detecting cycle phase requires recognising the ~7-week pattern. Plan for at least 30 days of data collection before this feature is useful.
- **Push alerts require HTTPS:** Service Workers only work on HTTPS origins. Self-hosted deployment must have a valid TLS certificate (Let's Encrypt). This is an infrastructure prerequisite, not a feature prerequisite.
- **Cheapest time heatmap requires multiple weeks of data:** Day-of-week patterns aren't reliable with less than 2–3 weeks of data at 15-minute granularity.

---

## MVP Definition

### Launch With (v1)

Minimum to make the product useful to the small group of friends.

- [ ] QLD API integration — scrapes every 15 minutes, stores prices and station metadata
- [ ] Current prices list view — sorted cheapest first, filtered to 20km of North Lakes
- [ ] Fuel type filter — at minimum ULP91 and ULP95 (most common)
- [ ] Mobile-responsive layout — usable in a parked car on a phone
- [ ] Data freshness indicator — users need to trust the data
- [ ] Station detail view — address and last-updated time

### Add After Validation (v1.x)

Features to add once v1 is running and collecting data.

- [ ] Price history charts — after 7–14 days of data has accumulated
- [ ] Map view — useful but list view is sufficient for MVP
- [ ] Price delta indicator — requires one cycle of previous-vs-current data
- [ ] Favourite stations — add once users know which stations they care about
- [ ] Station comparison charts — after history charts are working
- [ ] Push notification alerts — requires HTTPS setup and Service Worker infrastructure

### Future Consideration (v2+)

Features requiring more data or significant complexity investment.

- [ ] Cycle position indicator — needs 30+ days of data and cycle detection algorithm
- [ ] "Best time to fill" summary card — depends on cycle detection
- [ ] Cheapest time heatmap (day/hour patterns) — needs 3+ weeks of data
- [ ] Area aggregate trend charts — useful but lower priority than per-station charts

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| QLD API integration + scraper | HIGH | MEDIUM | P1 |
| Current prices list view | HIGH | LOW | P1 |
| Fuel type filter | HIGH | LOW | P1 |
| Mobile-responsive layout | HIGH | LOW | P1 |
| Data freshness indicator | MEDIUM | LOW | P1 |
| Station detail view | MEDIUM | LOW | P1 |
| Price history charts | HIGH | MEDIUM | P2 |
| Map view | MEDIUM | MEDIUM | P2 |
| Price delta indicator | MEDIUM | LOW | P2 |
| Favourite stations | MEDIUM | LOW | P2 |
| Push notification alerts | HIGH | HIGH | P2 |
| Configurable alert thresholds | MEDIUM | LOW | P2 (depends on alerts) |
| Station comparison charts | MEDIUM | MEDIUM | P2 |
| Cycle position indicator | HIGH | HIGH | P3 |
| "Best time to fill" card | HIGH | HIGH | P3 |
| Cheapest time heatmap | MEDIUM | MEDIUM | P3 |
| Area aggregate trend charts | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Add after launch once data is accumulating
- P3: Future work requiring data maturity or significant complexity

---

## Competitor Feature Analysis

| Feature | PetrolSpy | MotorMouth | FuelRadar | FuelSniffer Approach |
|---------|-----------|------------|-----------|----------------------|
| Real-time prices | Yes | Yes | Yes (15-min) | Yes — 15-min polling from official QLD API |
| Map view | Yes | Yes | Yes (color-coded) | Yes — color-coded pins |
| List/table view | Yes | Yes | Yes | Yes — default view |
| Fuel type filter | Yes | Yes | Yes | Yes |
| Price history charts | Yes (cycle graphs) | 7-day history | Yes (90-day) | Yes (own historical DB) |
| Price cycle tracking | Yes (Sydney/Mel/Bris) | 7-day forecast | Yes (AI cycle analysis) | Yes — Brisbane-specific |
| Push alerts | App-based | App-based | App-based | Web Push (PWA) |
| Crowdsourced prices | Yes | Yes | No (official API only) | No — official API only |
| Route-based | No | No | No | No |
| Historical replay | No | No | Yes (go back in time) | Partial — charts only |
| CSV export | No | No | Yes | Maybe v2 |
| Self-hosted | No | No | No | Yes — unique |
| North Brisbane focus | No (all AU) | No (all AU) | No (all AU) | Yes — deliberate scope |
| Multi-user (small group) | No (single user app) | No | No | Yes — shared dashboard |

---

## Sources

- Queensland Open Data Portal — Fuel Price Reporting 2025: https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025
- FuelPricesQLD official portal: https://www.fuelpricesqld.com.au
- QLD Treasury fuel price data page: https://www.treasury.qld.gov.au/research-and-publications/fuel-price-data/
- Home Assistant Community — Queensland Fuel Prices Integration: https://community.home-assistant.io/t/queensland-fuel-prices-integration/406642
- PetrolSpy Australia: https://petrolspy.com.au
- FuelRadar Australia: https://fuelradar.com.au
- QLD Fuel Price Cycle Tracker: https://qldfuelprices.com.au/cycle.php
- ACCC — Petrol price cycles in the 5 largest cities: https://www.accc.gov.au/consumers/petrol-and-fuel/petrol-price-cycles-in-the-5-largest-cities
- Carsales — Best apps for cheap petrol: https://www.carsales.com.au/editorial/details/auto-extras-the-best-apps-for-pain-relief-at-the-petrol-pump-116395/
- GitHub — pyfuelprices QLD issue: https://github.com/pantherale0/pyfuelprices/issues/9

---

*Feature research for: Fuel price tracking dashboard, Queensland Australia*
*Researched: 2026-03-22*
