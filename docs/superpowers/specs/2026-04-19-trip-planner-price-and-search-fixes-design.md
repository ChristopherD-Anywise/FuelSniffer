# Trip Planner + Price Indicator + Suburb Search Fixes

**Date:** 2026-04-19
**Status:** Approved (pending final review)

## Scope

Three related fixes bundled into one change:

1. **Trip planner** — replace raw lat/lng fields with Mapbox-geocoded address search via a server-side proxy; hard-disable the page when `MAPBOX_TOKEN` is missing.
2. **"¢ / 7d" indicator** — fix the station list chip so it matches the station popup's semantic (current price − oldest price in the 168h window), and show on every station with sufficient history.
3. **Suburb search** — fix `stations.suburb` being NULL for 98.5% of rows by backfilling via a static QLD postcode→suburb lookup, and by using the same lookup at scrape time going forward.

### Out of scope
- Reverse geocoding the current-location button (keep as raw coords)
- "Use current location" on the End field (Start only, matching today)
- Two-token Mapbox setup (single server-side token only)
- Trip map / station list redesigns — once token + address are fixed, the existing UI works
- Geocoding any station coordinates (stations already have lat/lng)

## Background

### Trip planner
Today the trip form in [TripForm.tsx](fuelsniffer/src/components/TripForm.tsx) expects users to type `-27.4698, 153.0251` into raw text fields and uses a `parseCoord` helper to validate. It has a single "use my current location" button on the Start field. `MAPBOX_TOKEN` is required for route calculation; when unset, `/dashboard/trip` fails with a 502 and a half-working UI.

### Price indicator
[StationCard.tsx](fuelsniffer/src/components/StationCard.tsx) renders a `"X.X¢ / 7d"` chip from `station.price_change`, which is computed server-side in [prices.ts](fuelsniffer/src/lib/db/queries/prices.ts):

```sql
LEFT JOIN LATERAL (
  SELECT price_cents
  FROM price_readings pr
  WHERE pr.station_id = l.station_id
    AND pr.fuel_type_id = ${fuelTypeId}
    AND pr.recorded_at < NOW() - (${changeHours} || ' hours')::interval
  ORDER BY pr.recorded_at DESC
  LIMIT 1
) prev ON true
```

This picks "the most recent reading from *before* 7 days ago" — which can be any age (8 days, 6 months, a year). Stations with no reading before the cutoff return NULL and the chip is hidden.

Meanwhile [StationPopup.tsx:101](fuelsniffer/src/components/StationPopup.tsx) computes its "¢ / 7d" delta as `price - data[0].avg`, where `data` comes from `/api/prices/history?hours=168` — i.e. the oldest bucket within the 168h window. That's the honest "7-day change" semantic.

The two views disagree, and the card's version is wrong.

### Suburb search
`/api/search` ([route.ts](fuelsniffer/src/app/api/search/route.ts)) filters stations with `suburb ILIKE '%q%' OR postcode LIKE 'q%'`. Of 1,807 active stations, only 27 have a non-NULL `suburb`. `extractSuburb()` in [normaliser.ts:62](fuelsniffer/src/lib/scraper/normaliser.ts) matches `"..., SUBURB, QLD POSTCODE"` but the QLD API returns bare street addresses like `"1256 Anzac Avenue"` — so it falls through to NULL for 98.5% of records. Postcode is always present, so the fallback path is postcode→suburb lookup.

## Design

### 1. Suburb search fix

**`src/lib/data/qld-postcodes.json`** — new file. Static lookup table:

```json
{
  "4006": "Fortitude Valley",
  "4017": "Brighton",
  "4503": "Rothwell",
  ...
}
```

Sourced from Australia Post's public postcode dataset, filtered to QLD. One entry per postcode (primary/most-common suburb). ~600 entries, ~20KB. Committed to repo; no runtime fetch.

**`src/lib/scraper/normaliser.ts`** — update `extractSuburb`:
- New signature: `extractSuburb(address: string | null, postcode: string | null): string | null`
- Try the existing regex first (retains correctness for any enriched addresses)
- Fallback: `postcodeToSuburb[postcode] ?? null`
- `normaliseStation` passes both `site.Address` and `site.Postcode`

**`src/lib/db/scripts/backfill-suburbs.ts`** — new one-off script:
- Iterate all stations where `suburb IS NULL AND postcode IS NOT NULL`
- `UPDATE stations SET suburb = $1 WHERE id = $2` using the lookup table
- Runs via `npx tsx src/lib/db/scripts/backfill-suburbs.ts`
- Idempotent — safe to re-run
- Logs count of updated rows and unresolved postcodes

**API:** no changes to `/api/search/route.ts` — once suburbs are populated, `suburb ILIKE` matches, and labels render as `"Fortitude Valley (4006)"` instead of `"Postcode 4006"`.

**Tests:**
- `extractSuburb('1256 Anzac Avenue', '4503')` → `'Rothwell'`
- `extractSuburb('123 Main St, NORTH LAKES QLD 4509', '4509')` → `'NORTH LAKES'` (regex wins)
- `extractSuburb('bare street', '9999')` → `null` (unknown postcode)
- `extractSuburb(null, null)` → `null`
- Backfill integration test: seed stations with NULL suburb + known postcodes → run script → assert populated

### 2. Price indicator fix

**`src/lib/db/queries/prices.ts`** — replace the LATERAL subquery so `price_change` matches the popup's computation (current price minus oldest reading in the 168h window).

Constraint to verify at implementation time: the popup hits `/api/prices/history?hours=168`, which reads from `price_readings_daily` (materialized view, bucketed). The new LATERAL must query the *same source* to guarantee byte-identical match. If `/api/prices/history` actually hits raw `price_readings` with its own bucketing, we use raw readings instead.

Assumed shape (subject to confirming the history endpoint's source):

```sql
LEFT JOIN LATERAL (
  SELECT avg_price AS prev_price
  FROM price_readings_daily
  WHERE station_id = l.station_id
    AND fuel_type_id = ${fuelTypeId}
    AND bucket >= NOW() - INTERVAL '168 hours'
  ORDER BY bucket ASC
  LIMIT 1
) prev ON true
```

Then `price_change = l.price_cents::numeric - prev.prev_price::numeric`.

Behavior:
- Matches popup exactly
- Shows on every station with ≥1 reading in the last 168h
- `price_change = null` (chip hidden) only when a station has zero readings in the 168h window — which is correct
- `PriceResult.price_change` field shape unchanged — no API contract change
- `StationCard.tsx` needs no changes

**Tests:**
- Station with readings at t=170h and t=12h → `price_change` = current − value at t=12h (first in window)
- Station with readings only older than 168h → `price_change` = `null`
- Cross-check: a seeded station's `getLatestPrices` `price_change` equals what `StationPopup` would compute client-side given the same history rows

### 3. Trip planner — geocoded address search + token gating

#### 3a. Geocoding proxy

**`src/app/api/geocode/route.ts`** — new server-side Mapbox proxy.

- Input: query param `q`, Zod-validated (min 2, max 100 chars)
- Reads `process.env.MAPBOX_TOKEN` at request time
- If unset: return 503 `{ error: 'geocoding_unavailable' }` so the client shows a clear message
- Calls `https://api.mapbox.com/search/geocode/v6/forward` with:
  - `country=au`
  - `proximity=153.02,-27.47` (Brisbane)
  - `limit=5`
  - `types=address,postcode,place,locality`
  - `access_token=<env>`
- Returns `[{ label, lat, lng }, ...]` — same shape the client already handles for `LocationSearch`
- Rate-limited using the same middleware/pattern as `/api/trip/route`
- In-memory LRU cache (5 min TTL, ~500 entries) keyed on normalised query (lowercase + trim)
- Errors from Mapbox: return 502 with a generic message; log details server-side

#### 3b. AddressSearch component

**`src/components/AddressSearch.tsx`** — new. Functionally the same shape as [LocationSearch.tsx](fuelsniffer/src/components/LocationSearch.tsx) but points at `/api/geocode`:

- Debounced input (300ms)
- Arrow key navigation, Enter to select, Escape to close
- Click-outside to close
- Displays result labels (e.g. "123 Example St, Brisbane QLD 4000")
- On select: calls `onSelect({ lat, lng, label })`

Reused styling matches the existing input design in TripForm (40px height, same palette).

#### 3c. TripForm refactor

**`src/components/TripForm.tsx`** — remove `parseCoord`, replace text inputs with `AddressSearch`:

- Internal state: `start: { lat, lng, label } | null`, `end: { lat, lng, label } | null`
- Start field: `AddressSearch` + existing "use my current location" button (Q4 → Start only)
  - When user clicks locate, state becomes `{ lat, lng, label: 'Current location' }`
  - AddressSearch input shows `label` as display-only (read-only or editable — editing replaces state with the new search)
- End field: `AddressSearch` only (no locate button)
- Submit disabled until `start && end`
- On submit: POSTs `{ start: {lat,lng}, end: {lat,lng}, alternatives: true }` to `/api/trip/route` (unchanged)

#### 3d. Token gating

**`src/app/dashboard/trip/page.tsx`** — server component reads `process.env.MAPBOX_TOKEN` at request time:

- If unset: render a static "Trip planner requires Mapbox configuration" panel with a link to `docs/setup/mapbox-token.md` and return. No form, no map, no client JS for the trip flow loaded.
- If set: render the current page as today.

#### 3e. Setup docs

**`docs/setup/mapbox-token.md`** — new:
- Where to sign up (mapbox.com)
- Which scopes the token needs (Geocoding + Directions, both default-included in a public scoped token, but we use a secret token)
- Where to put it: `.env` (`MAPBOX_TOKEN=...`) and confirm `docker-compose.yml` already wires it into the `app` service's environment
- How to restart: `docker compose up -d --build app`
- How to verify: curl `/api/geocode?q=brisbane` returns JSON results

**Tests for the trip planner work:**
- `/api/geocode` — Zod validation (q missing, too short, too long)
- `/api/geocode` — token-missing returns 503
- `/api/geocode` — Mapbox success path (msw-mocked), verifies output shape + Australian bias params in the outgoing URL
- `/api/geocode` — Mapbox 5xx returns 502
- `/api/geocode` — second identical request within 5 min is served from cache (msw asserts only one upstream call)
- `AddressSearch` — debounce, keyboard nav, click-outside
- `TripForm` — disabled submit until both locations set; geolocate populates start with "Current location" label
- Token-gated page — renders fallback when `MAPBOX_TOKEN=''`, renders form when set

## Build order

One PR, three commits (or three sub-PRs if you'd rather review separately):

1. **Suburb fix** — lowest risk, unblocks search immediately.
   - Add `qld-postcodes.json`
   - Update `normaliser.ts` + tests
   - Add backfill script + test
   - Run backfill against prod DB
2. **Price indicator fix** — self-contained SQL change.
   - Update `getLatestPrices` in `prices.ts`
   - Cross-check test against popup computation
3. **Trip planner** — adds new surfaces.
   - Add `/api/geocode/route.ts` + tests
   - Add `AddressSearch.tsx` + tests
   - Refactor `TripForm.tsx`
   - Gate `/dashboard/trip` server-side
   - Write `docs/setup/mapbox-token.md`
   - Walk through MAPBOX_TOKEN setup together

## Files touched

| File | Change |
|---|---|
| `src/lib/data/qld-postcodes.json` | new |
| `src/lib/scraper/normaliser.ts` | `extractSuburb` signature + postcode fallback |
| `src/lib/scraper/writer.ts` | (verify — may not need change) |
| `src/lib/db/scripts/backfill-suburbs.ts` | new |
| `src/lib/db/queries/prices.ts` | LATERAL rewrite |
| `src/app/api/geocode/route.ts` | new |
| `src/components/AddressSearch.tsx` | new |
| `src/components/TripForm.tsx` | address fields, remove `parseCoord` |
| `src/app/dashboard/trip/page.tsx` | token gate |
| `docs/setup/mapbox-token.md` | new |
| Tests for each of the above | new/updated |
