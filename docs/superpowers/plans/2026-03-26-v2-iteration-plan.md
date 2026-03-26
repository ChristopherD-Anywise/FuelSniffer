# FuelSniffer v2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform FuelSniffer from a private MVP into a public-ready fuel price intelligence app covering all of Queensland with accurate data and a polished station detail experience.

**Architecture:** Four independent sub-projects executed in order. Each produces working, testable software. Sub-project A replaces the clunky Leaflet popup with a native React detail panel. Sub-project B removes the hardcoded 50km radius to serve all of QLD. Sub-project C enriches station data via Google Places. Sub-project D adds daily aggregate retention policy for long-term trend storage.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, TimescaleDB 2.24, Drizzle ORM, Leaflet, Recharts, Zod, Tailwind CSS 4

---

## Sub-Project A: Station Detail Panel Redesign

**Problem:** The current map popup uses `createRoot` to render React inside Leaflet's DOM — causing race conditions, -1 sizing on charts, and a clunky UX that fights the framework.

**Solution:** Replace the Leaflet popup with a native React detail panel. On desktop: a slide-out panel on the right side of the map. On mobile: a slide-up bottom sheet. The map pin click selects a station and the detail panel renders as a normal React component — no portals, no `createRoot`. Map pans smoothly to the selected station.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/StationDetail.tsx` | Detail panel — station info, chart, nav links, fuel type tabs, nearby alternatives. Normal React component. |
| Modify | `src/components/MapView.tsx` | Remove `createRoot`/popup React rendering. Revert to simple HTML tooltip. Add smooth pan to selected station. |
| Delete | `src/components/StationPopup.tsx` | No longer needed — replaced by StationDetail |
| Delete | `src/components/PriceChart.tsx` | Unused — chart logic moves into StationDetail |
| Modify | `src/app/dashboard/DashboardClient.tsx` | Add StationDetail panel to layout, wire selection, remove activeFuel from MapView |
| Modify | `src/lib/map-utils.ts` | Update `getPinColour` to accept fuel type for per-fuel-type relative colouring |
| Modify | `src/app/globals.css` | Add slide-up/slide-out animation classes |

---

### Task A1: Strip React rendering from MapView, add smooth pan

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Remove createRoot import and all React portal logic**

Remove these imports:
```typescript
import { createRoot } from 'react-dom/client'
import StationPopup from '@/components/StationPopup'
```

Remove `rootsRef` and all `createRoot`/`unmount` logic from the markers effect. Replace the popup binding with a simple HTML tooltip:
```typescript
const popupHtml = `
  <div style="font-family:Inter,system-ui,sans-serif;width:240px;">
    <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px;">
      <span style="font-size:24px;font-weight:800;color:${colour};line-height:1;">${priceText}</span>
      <span style="font-size:12px;color:#94a3b8;">c/L</span>
    </div>
    <div style="font-size:14px;font-weight:600;color:#0f172a;">${station.name}</div>
    ${station.brand ? `<div style="font-size:11px;color:#94a3b8;">${station.brand}</div>` : ''}
    <div style="font-size:12px;color:#64748b;margin-top:2px;">${station.address || ''}</div>
  </div>
`
marker.bindPopup(popupHtml, { maxWidth: 260, closeButton: true })
```

Remove `activeFuel` and `activeFuelRef` from the component entirely (prop, interface, ref).

- [ ] **Step 2: Add smooth pan to selected station**

In the `selectedId` useEffect, add `map.panTo()`:
```typescript
useEffect(() => {
  if (selectedId) {
    const marker = markersRef.current.get(selectedId)
    if (marker) {
      marker.openPopup()
      map.panTo(marker.getLatLng(), { animate: true, duration: 0.3 })
    }
  } else {
    map.closePopup()
  }
}, [selectedId, map])
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/__tests__/map.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "refactor: remove React portal rendering from map popups, add smooth pan"
```

---

### Task A2: Update getPinColour for per-fuel-type relative colouring

**Files:**
- Modify: `src/lib/map-utils.ts`
- Modify: `src/__tests__/map.test.ts`

- [ ] **Step 1: The current `getPinColour(price, min, max)` colours relative to ALL displayed prices**

This is wrong for diesel (always ~300+) vs ULP (~245). The colours should be relative within the currently displayed fuel type, which they already are since `min`/`max` are computed from the filtered station list. Verify this is correct — no code change needed if the caller passes fuel-type-specific min/max. Add a comment documenting this design decision.

- [ ] **Step 2: Commit if any changes made**

```bash
git add src/lib/map-utils.ts
git commit -m "docs: clarify per-fuel-type relative colour mapping in getPinColour"
```

---

### Task A3: Create StationDetail panel component

**Files:**
- Create: `src/components/StationDetail.tsx`

- [ ] **Step 1: Create the StationDetail component**

This component receives a station object and renders a detail panel with:
- Station header (price badge, name, brand, address, distance, last updated time)
- Fuel type tabs — allow switching fuel type within the detail view to see different prices for the same station
- Price history chart (Recharts AreaChart, 24h/3d/7d toggle) — moved from StationPopup
- Navigation buttons (Google Maps, Apple Maps)
- Close button

Key design decisions:
- Use fixed-size AreaChart (width calculated from panel width, 160px height) to avoid ResponsiveContainer issues in animated panels
- Fetch history from `/api/prices/history` on mount and when time range or fuel type changes
- Panel layout: slides up from bottom on mobile (`fixed inset-x-0 bottom-0`), appears as right-side panel on desktop (`fixed right-0 top-0 bottom-0 w-[400px]`)
- Semi-transparent backdrop that closes the panel on click

```typescript
'use client'

import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationDetailProps {
  station: PriceResult
  fuelId: string
  allStations: PriceResult[]  // for nearby alternatives
  onClose: () => void
  onFuelChange: (fuelId: string) => void
}
```

The component should include:
- **Fuel type tabs** — row of pills showing available fuel types. When tapped, calls `onFuelChange` to update the parent's active fuel, which re-fetches prices and updates the chart.
- **Nearby alternatives** — filter `allStations` to those within 2km of the selected station, sorted by price, show top 3. Each shows name, price, distance delta.
- **"Not enough history yet"** message when data.length === 0

- [ ] **Step 2: Verify panel renders in dev server**

Open http://localhost:4000/dashboard, click a station card, verify the panel appears with chart, fuel tabs, and nearby alternatives.

- [ ] **Step 3: Commit**

```bash
git add src/components/StationDetail.tsx
git commit -m "feat: add StationDetail panel with chart, fuel tabs, nearby alternatives"
```

---

### Task A4: Wire StationDetail into DashboardClient

**Files:**
- Modify: `src/app/dashboard/DashboardClient.tsx`

- [ ] **Step 1: Update DashboardClient to render StationDetail**

Add `StationDetail` import. Remove `activeFuel={activeFuel}` from the `<MapView>` JSX props (the prop was removed from MapView's interface in A1 — passing it would cause a TypeScript error).

When `selectedId` is set, render the StationDetail panel at the root of the component tree (outside the grid columns, so it overlays):

```tsx
{selectedId && (() => {
  const station = sortedStations.find(s => s.id === selectedId)
  if (!station) return null
  return (
    <StationDetail
      station={station}
      fuelId={activeFuel}
      allStations={sortedStations}
      onClose={() => setSelectedId(null)}
      onFuelChange={id => updateParam('fuel', id)}
    />
  )
})()}
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Delete unused files**

```bash
rm src/components/StationPopup.tsx src/components/PriceChart.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/DashboardClient.tsx
git rm src/components/StationPopup.tsx src/components/PriceChart.tsx
git commit -m "feat: wire StationDetail panel into dashboard, remove old popup components"
```

---

### Task A5: Add slide animations via CSS

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/StationDetail.tsx`

- [ ] **Step 1: Add keyframe animations for the detail panel**

```css
/* Station detail panel animations */
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.detail-panel-mobile {
  animation: slide-up 0.2s ease-out;
}
.detail-panel-desktop {
  animation: slide-in-right 0.2s ease-out;
}
```

- [ ] **Step 2: Apply classes in StationDetail component**

Use `detail-panel-mobile` on mobile layout (below `md:` breakpoint), `detail-panel-desktop` on desktop.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css src/components/StationDetail.tsx
git commit -m "feat: add slide animations for station detail panel"
```

---

## Sub-Project B: All of Queensland

**Problem:** The scraper only stores stations within 50km of North Lakes. Users in Townsville, Cairns, or the Gold Coast see nothing.

**Solution:** Remove the geographic filter from the scraper — store ALL QLD stations. The radius filter moves to query-time only (already works this way in the API). Add location search (by station name or postcode) so users can find fuel anywhere in QLD without needing geolocation.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/scraper/normaliser.ts` | Remove `isWithinRadius` filter from `normaliseStation` |
| Modify | `src/lib/scraper/writer.ts` | Remove radius filter from both scraper paths |
| Create | `src/app/api/search/route.ts` | Location search — two modes: station name search (returns individual stations) and postcode search (returns area centroid) |
| Create | `src/components/LocationSearch.tsx` | Autocomplete search component |
| Modify | `src/components/FilterBar.tsx` | Add LocationSearch input |
| Modify | `src/app/dashboard/DashboardClient.tsx` | Wire search to map center + API queries |
| Modify | `src/__tests__/normaliser.test.ts` | Update tests for removed radius filter |

---

### Task B1: Remove geographic filter from scraper

**Files:**
- Modify: `src/lib/scraper/normaliser.ts`
- Modify: `src/lib/scraper/writer.ts`
- Modify: `src/__tests__/normaliser.test.ts`

- [ ] **Step 1: Update normaliseStation to accept all stations**

In `normaliser.ts`, remove the `isWithinRadius` check from `normaliseStation`. Keep the `isWithinRadius` function exported (still useful for query-time filtering), but `normaliseStation` should always return a station:

```typescript
export function normaliseStation(site: SiteDetails): NewStation {
  return {
    id:         site.SiteId,
    name:       site.Name,
    brand:      site.Brand ?? null,
    address:    site.Address ?? null,
    suburb:     null,
    postcode:   site.Postcode ?? null,
    latitude:   site.Lat,
    longitude:  site.Lng,
    isActive:   true,
    lastSeenAt: new Date(),
  }
}
```

Note: return type changes from `NewStation | null` to `NewStation`. Callers in `writer.ts` that do `.filter((s): s is NonNullable<typeof s> => s !== null)` should have this filter removed — it becomes dead code.

- [ ] **Step 2: Remove radius filter from CKAN scraper in writer.ts**

In `runCkanScrapeJob()`, remove the `nearbyRecords` filter that calls `isWithinRadius`. Process ALL records. Also update the CKAN station upsert to include `lastSeenAt: new Date()` — it's currently missing.

- [ ] **Step 3: Remove radius filter from Direct API scraper**

In `runDirectApiScrapeJob()`, the `inRadiusIds` filtering is no longer needed. Insert ALL normalised stations and ALL prices. Remove the `.filter(null)` after `.map(normaliseStation)` since the function no longer returns null.

- [ ] **Step 4: Update normaliser tests**

In `normaliser.test.ts`:
- Remove the test "returns null for stations outside 50km radius"
- Update "returns a NewStation for stations within radius" to test that all stations are returned regardless of location
- Keep `isWithinRadius` unit tests unchanged (function still exists for API-level use)

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/scraper/normaliser.ts src/lib/scraper/writer.ts src/__tests__/normaliser.test.ts
git commit -m "feat: store all QLD stations, remove ingest-time radius filter"
```

---

### Task B2: Add database indexes for query performance at scale

**Files:**
- Create: `src/lib/db/migrations/0004_performance_indexes.sql`
- Modify: `src/lib/db/migrate.ts`

With 1,800 QLD stations (up from ~100), the `DISTINCT ON (station_id)` query in `getLatestPrices` and the Haversine distance computation become expensive without proper indexes.

- [ ] **Step 1: Create the migration**

```sql
-- Composite index for the DISTINCT ON (station_id) query pattern
-- Used by getLatestPrices: DISTINCT ON (station_id) ... ORDER BY station_id, recorded_at DESC
CREATE INDEX IF NOT EXISTS idx_price_readings_station_fuel_recorded
ON price_readings (station_id, fuel_type_id, recorded_at DESC);

-- Index for station location-based queries (lat/lng filtering)
CREATE INDEX IF NOT EXISTS idx_stations_lat_lng
ON stations (latitude, longitude);

-- Index for search by name and postcode
CREATE INDEX IF NOT EXISTS idx_stations_postcode
ON stations (postcode);
```

Note: `ILIKE '%term%'` (leading wildcard) cannot use B-tree indexes. For 1,800 rows this is acceptable. If performance degrades at national scale, add a `pg_trgm` GIN index.

- [ ] **Step 2: Add to migration runner**

Add `'0004_performance_indexes.sql'` to the `files` array in `migrate.ts`.

- [ ] **Step 3: Run migration**

```bash
DATABASE_URL=... npx tsx src/lib/db/migrate.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/0004_performance_indexes.sql src/lib/db/migrate.ts
git commit -m "feat: add database indexes for query performance at 1800+ stations"
```

---

### Task B3: Add location search API (was B2)

**Files:**
- Create: `src/app/api/search/route.ts`

- [ ] **Step 1: Create the search endpoint**

Two search modes in one endpoint:

```typescript
// GET /api/search?q=townsville
// Returns two result types:
// { type: 'station', id: 123, name: 'BP Townsville', lat: -19.258, lng: 146.818 }
// { type: 'area', label: '4810 — Townsville', lat: -19.258, lng: 146.818, stationCount: 15 }
```

Implementation:
- Query stations where `name ILIKE '%${q}%'` — return top 5 station matches
- Query `SELECT postcode, AVG(latitude), AVG(longitude), COUNT(*) FROM stations WHERE postcode LIKE '${q}%' OR name ILIKE '%${q}%' GROUP BY postcode` — return top 5 area matches
- Validate and sanitize `q` parameter (min 2 chars, max 50, strip SQL injection via parameterized queries)
- Return combined results, areas first then stations, max 10 total

- [ ] **Step 2: Test manually**

```bash
curl "http://localhost:4000/api/search?q=cairns"
```

Expected: JSON array with area and station results

- [ ] **Step 3: Commit**

```bash
git add src/app/api/search/route.ts
git commit -m "feat: add location search API with station name and postcode/area modes"
```

---

### Task B4: Create LocationSearch component

**Files:**
- Create: `src/components/LocationSearch.tsx`

- [ ] **Step 1: Create the autocomplete search component**

A text input with debounced (300ms) autocomplete dropdown. Calls `/api/search?q=...` on keystroke. Displays results grouped by type (areas first, then stations). When a result is selected, calls `onSelect({ lat, lng, label })`.

UI: text input with search icon, dropdown appears below with results, click outside dismisses.

- [ ] **Step 2: Commit**

```bash
git add src/components/LocationSearch.tsx
git commit -m "feat: add LocationSearch autocomplete component"
```

---

### Task B5: Wire LocationSearch into FilterBar and Dashboard

**Files:**
- Modify: `src/components/FilterBar.tsx`
- Modify: `src/app/dashboard/DashboardClient.tsx`

- [ ] **Step 1: Add LocationSearch to FilterBar**

Add it next to the "Locate me" button. Pass `onLocationSelect` callback prop through FilterBar.

- [ ] **Step 2: Wire into DashboardClient**

When a search result is selected:
- Set `userLocation` to the result's lat/lng
- Set `locationStatus` to `'active'`
- Show the selected location label somewhere in the UI
- Map re-centers on the new location
- API queries use the new center point

- [ ] **Step 3: Run tests and verify**

Run: `npx vitest run`
Manual: Search for "Cairns" in the filter bar, verify map and list update.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterBar.tsx src/app/dashboard/DashboardClient.tsx
git commit -m "feat: wire location search into filter bar and dashboard"
```

---

### Task B6: Add marker clustering for map performance

**Files:**
- Modify: `package.json` (add leaflet.markercluster)
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Install marker clustering library**

```bash
npm install leaflet.markercluster @types/leaflet.markercluster
```

- [ ] **Step 2: Add clustering to MapView**

Use `L.markerClusterGroup` for all markers. Cluster shows count and uses average price colour at the cluster level. Individual markers expand on zoom.

- [ ] **Step 3: Test with large radius**

Verify clusters appear at low zoom, individual markers at high zoom.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/MapView.tsx
git commit -m "feat: add marker clustering for large station counts"
```

---

## Sub-Project C: Google Places Data Enrichment

**Problem:** Station addresses from the QLD API are sometimes incomplete or inaccurate. The API provides a Google Place ID (`GPI`) that we can use to cross-reference.

**Solution:** A background enrichment job that queries Google Places API using the stored `GPI` to validate addresses, get opening hours, and detect closed stations. Runs once daily, not on every scrape.

**Prerequisite:** User must have a Google Places API key with billing enabled.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/db/schema.ts` | Add `gpi`, `google_address`, `google_place_name`, `opening_hours`, `place_rating`, `last_enriched_at` to stations |
| Create | `src/lib/db/migrations/0006_google_places_columns.sql` | Migration for new columns (including `gpi`) |
| Modify | `src/lib/scraper/client.ts` | Add `GPI` to `SiteDetails` interface and normalization mapping |
| Modify | `src/lib/scraper/normaliser.ts` | Pass `gpi` through to NewStation |
| Create | `src/lib/enrichment/google-places.ts` | Google Places API client |
| Create | `src/lib/enrichment/enricher.ts` | Background enrichment job |
| Modify | `src/lib/db/migrate.ts` | Add 0004 migration to runner |
| Modify | `src/lib/scraper/scheduler.ts` | Schedule daily enrichment run |
| Modify | `src/lib/db/queries/prices.ts` | Return `google_address` when available, fall back to API address |
| Modify | `.env.example` | Add GOOGLE_PLACES_API_KEY |

---

### Task C1: Add GPI and Google Places columns to stations, update ingest

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/0006_google_places_columns.sql`
- Modify: `src/lib/db/migrate.ts`
- Modify: `src/lib/scraper/client.ts`
- Modify: `src/lib/scraper/normaliser.ts`

- [ ] **Step 1: Add columns to schema.ts**

```typescript
// In stations table, add:
gpi:              text('gpi'),                   // Google Place ID from QLD API
googleAddress:    text('google_address'),         // validated address from Google Places
googlePlaceName:  text('google_place_name'),      // name per Google
openingHours:     text('opening_hours'),          // JSON string of opening hours
placeRating:      doublePrecision('place_rating'), // Google rating 1-5
lastEnrichedAt:   timestamp('last_enriched_at', { withTimezone: true }),
```

- [ ] **Step 2: Write migration SQL**

```sql
ALTER TABLE stations ADD COLUMN IF NOT EXISTS gpi TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS google_address TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS google_place_name TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS opening_hours TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS place_rating DOUBLE PRECISION;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
```

- [ ] **Step 3: Add `GPI` to the `SiteDetails` interface in client.ts**

The `RawSiteDetailsSchema` already parses `GPI` from the API response (line 34), but the `SiteDetails` interface (line 42-50) and the normalization mapping (lines 163-171) drop it. Fix both:

In the `SiteDetails` interface, add:
```typescript
GPI: string | null
```

In the `getFullSiteDetails()` mapping, add:
```typescript
GPI: raw.GPI ?? null,
```

- [ ] **Step 4: Update normaliseStation to pass gpi through**

In `normaliser.ts`, add `gpi: site.GPI ?? null` to the returned NewStation object.

**Also update the CKAN scraper path:** The CKAN scraper in `writer.ts` (`runCkanScrapeJob`) builds station insert values manually — it does NOT call `normaliseStation`. Add `gpi: null` to its values object so the column is populated (CKAN data doesn't have Google Place IDs). Also ensure `lastSeenAt` is set (currently missing from the CKAN path).

- [ ] **Step 5: Add migration to runner and run**

Add `'0006_google_places_columns.sql'` to the `files` array in `migrate.ts`.

```bash
DATABASE_URL=... npx tsx src/lib/db/migrate.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0006_google_places_columns.sql src/lib/db/migrate.ts src/lib/scraper/client.ts src/lib/scraper/normaliser.ts
git commit -m "feat: store GPI during ingest, add Google Places columns to stations"
```

---

### Task C2: Create Google Places API client

**Files:**
- Create: `src/lib/enrichment/google-places.ts`

- [ ] **Step 1: Create the Places API client**

```typescript
// Uses Place Details API (New)
// Endpoint: https://maps.googleapis.com/maps/api/place/details/json
// Fields: formatted_address, name, opening_hours, rating
// Auth: API key from GOOGLE_PLACES_API_KEY env var
// Rate limit: ~1000 req/100s — we process slowly (100ms between calls)
// Cost: ~$0.005 per request for opening_hours + rating fields
```

The client should:
- Accept a Google Place ID string
- Return `{ address: string, name: string, openingHours: object | null, rating: number | null }` or `null` on failure
- Handle 404 (place not found — likely closed) gracefully
- Throw on missing API key

- [ ] **Step 2: Commit**

```bash
git add src/lib/enrichment/google-places.ts
git commit -m "feat: add Google Places API client for station enrichment"
```

---

### Task C3: Create enrichment job and schedule it

**Files:**
- Create: `src/lib/enrichment/enricher.ts`
- Modify: `src/lib/scraper/scheduler.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create the enricher module**

The enricher:
- Queries stations where `last_enriched_at IS NULL` or `last_enriched_at < NOW() - INTERVAL '30 days'`
- Skips stations where `gpi IS NULL`
- For each station, calls Google Places API
- Updates `google_address`, `google_place_name`, `opening_hours` (JSON stringified), `place_rating`, `last_enriched_at`
- Processes in batches of 50 with 100ms delay between calls
- Logs progress: `[enricher] Enriched 50/1800 stations...`
- Logs errors per station but continues processing

- [ ] **Step 2: Schedule daily enrichment**

In `scheduler.ts`, add:
```typescript
cron.schedule('0 3 * * *', async () => {
  // Only run if GOOGLE_PLACES_API_KEY is set
  if (!process.env.GOOGLE_PLACES_API_KEY) return
  const { runEnrichment } = await import('@/lib/enrichment/enricher')
  await runEnrichment()
}, { timezone: 'Australia/Brisbane' })
```

- [ ] **Step 3: Add GOOGLE_PLACES_API_KEY to .env.example**

```
GOOGLE_PLACES_API_KEY=your_key_here
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/enrichment/enricher.ts src/lib/scraper/scheduler.ts .env.example
git commit -m "feat: add daily Google Places enrichment job with 3am schedule"
```

---

### Task C4: Use enriched address in API responses, add stale price detection

**Files:**
- Modify: `src/lib/db/queries/prices.ts`

- [ ] **Step 1: Prefer google_address over raw API address**

In the `getLatestPrices` query, use `COALESCE(s.google_address, s.address) AS address`.

- [ ] **Step 2: Add stale price detection**

Stations that haven't reported a price in 7+ days are likely closed or not reporting. Add a `is_stale` boolean to the query output:
```sql
(l.source_ts < NOW() - INTERVAL '7 days') AS is_stale
```

Update the `PriceResult` interface to include `is_stale: boolean`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/prices.ts
git commit -m "feat: prefer Google Places address, flag stale prices in API"
```

---

## Sub-Project D: Daily Aggregate Retention Policy

**Problem:** Per PRD decision #4, hourly aggregates should be retained for 1 month, then rolled up to daily aggregates. Currently hourly aggregates are retained indefinitely.

**Solution:** Add a `daily_prices` continuous aggregate that rolls up from `hourly_prices`, and a retention policy on `hourly_prices` to drop data older than 30 days.

**Important:** TimescaleDB 2.24 supports hierarchical continuous aggregates (cagg on cagg). The `daily_prices` view will be a cagg over `hourly_prices`. This requires TimescaleDB 2.13+ which we have.

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/db/migrations/0005_daily_aggregate.sql` | Daily cagg + hourly retention policy |
| Modify | `src/lib/db/migrate.ts` | Add 0005 to runner |
| Modify | `src/app/api/prices/history/route.ts` | Query daily_prices for ranges > 30 days |
| Modify | `src/components/StationDetail.tsx` | Add 30d/90d time range options |

---

### Task D1: Create daily aggregate and hourly retention

**Files:**
- Create: `src/lib/db/migrations/0005_daily_aggregate.sql`
- Modify: `src/lib/db/migrate.ts`

- [ ] **Step 1: Write the migration**

```sql
-- Hierarchical continuous aggregate: daily rollup from hourly_prices
-- Requires TimescaleDB 2.13+ (we have 2.24)
CREATE MATERIALIZED VIEW daily_prices
WITH (timescaledb.continuous) AS
SELECT
  station_id,
  fuel_type_id,
  time_bucket('1 day', bucket) AS day_bucket,
  AVG(avg_price_cents)::NUMERIC(6,1) AS avg_price_cents,
  MIN(min_price_cents) AS min_price_cents,
  MAX(max_price_cents) AS max_price_cents
FROM hourly_prices
GROUP BY station_id, fuel_type_id, day_bucket;

-- Refresh daily_prices once per day
-- start_offset=31 days: MUST cover the full hourly retention window (30 days)
-- so all hourly data is materialized into daily before the hourly retention policy drops it.
-- If start_offset < hourly retention, data between start_offset and 30 days would never
-- be re-materialized if the daily cagg falls behind.
SELECT add_continuous_aggregate_policy('daily_prices',
  start_offset => INTERVAL '31 days',
  end_offset   => INTERVAL '0 days',
  schedule_interval => INTERVAL '1 day'
);

-- IMPORTANT: Before enabling hourly retention, backfill the daily cagg with all existing data.
-- Without this, any existing hourly data older than 30 days will be permanently lost.
CALL refresh_continuous_aggregate('daily_prices', NULL, NULL);

-- Retain hourly data for 30 days only (daily_prices preserves older data)
SELECT add_retention_policy('hourly_prices', INTERVAL '30 days');
```

- [ ] **Step 2: Add to migration runner**

Add `'0005_daily_aggregate.sql'` to the `files` array in `migrate.ts`.

- [ ] **Step 3: Run migration**

```bash
DATABASE_URL=... npx tsx src/lib/db/migrate.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/0005_daily_aggregate.sql src/lib/db/migrate.ts
git commit -m "feat: add daily aggregate with 30-day hourly retention policy"
```

---

### Task D2: Update history API and StationDetail for long ranges

**Files:**
- Modify: `src/app/api/prices/history/route.ts`
- Modify: `src/components/StationDetail.tsx`

- [ ] **Step 1: Extend the hours parameter and add daily fallback**

Change max from 168 to 8760 (365 days):
```typescript
hours: z.string().optional().default('168').pipe(
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(8760))
),
```

Add routing logic — for ranges > 720 hours (30 days), query `daily_prices`:
```typescript
if (hours > 720) {
  const rows = await db.execute(sql`
    SELECT day_bucket AS bucket, avg_price_cents AS avg_price,
           min_price_cents AS min_price, max_price_cents AS max_price
    FROM daily_prices
    WHERE station_id = ${station} AND fuel_type_id = ${fuel}
      AND day_bucket >= NOW() - ${hours + ' hours'}::interval
    ORDER BY day_bucket ASC
  `)
  return NextResponse.json(rows)
}
```

- [ ] **Step 2: Add 30d and 90d options to StationDetail time range selector**

Add `720` (30d) and `2160` (90d) to the time range pills alongside existing 24/72/168.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prices/history/route.ts src/components/StationDetail.tsx
git commit -m "feat: support 30d/90d price history via daily aggregates"
```

---

## PRD Items Deferred to v2.1

These items from PRD section 3.7 are intentionally deferred — they add polish but aren't critical for the v2.0 launch:

- **SEO pages** (3.1) — "cheapest fuel in [suburb]" server-rendered pages — requires going public first
- **Ad integration** (3.1) — needs traffic before it makes sense
- **Rate limiting** (3.1) — add before going public, not needed for QLD-wide internal use
- **Price cycle intelligence** (3.4) — requires 1+ month of historical data to detect patterns
- **Push notifications** (3.5) — requires account system and VAPID key infrastructure

---

## Execution Order

1. **Sub-Project A** (Station Detail Panel) — highest user-facing impact, fixes the biggest UX pain point
2. **Sub-Project B** (All of Queensland) — enables the app to serve all QLD users
3. **Sub-Project D** (Daily Aggregates) — quick DB migration, needed before long-term history in detail panel works
4. **Sub-Project C** (Google Places) — data accuracy enrichment, runs in background once API key is configured

## Dependencies

- A is independent — start immediately
- B is independent — can run in parallel with A
- D is independent — quick migration, but D2 requires StationDetail from A3 to exist (for adding time range buttons)
- C is independent — only requires a Google Places API key. No dependency on D.

## Estimated Scope

| Sub-Project | Tasks | Estimated Steps | Migrations |
|-------------|-------|-----------------|------------|
| A: Detail Panel | 5 tasks | ~17 steps | none |
| B: All of QLD | 6 tasks | ~24 steps | 0004 (indexes) |
| D: Daily Aggregates | 2 tasks | ~8 steps | 0005 (daily cagg) |
| C: Google Places | 4 tasks | ~14 steps | 0006 (places columns) |
| **Total** | **17 tasks** | **~63 steps** | **3 migrations** |

## Cleanup Notes

After Sub-Project B, update these stale comments:
- `client.ts` line 126: "Haversine filter narrows to North Brisbane" → remove, no longer accurate
- `MapView.tsx`: Rename `NORTH_LAKES` constant to `DEFAULT_CENTER` (still the default before geolocation)
- `normaliser.ts`: Add comment that `isWithinRadius` is retained for potential future use but not called at ingest
