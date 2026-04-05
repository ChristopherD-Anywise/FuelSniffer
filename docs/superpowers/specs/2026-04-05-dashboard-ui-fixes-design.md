# Dashboard UI Fixes — Design Spec
**Date:** 2026-04-05  
**Status:** Approved

## Overview

Three independent UI fixes for the FuelSniffer dashboard:

1. **Map cluster + side panel card** — clicking a station in the side panel ungroups its map cluster and opens the popup; card removes brand from second line; card adds 7-day price change indicator
2. **Location search** — dropdown shows only suburb/postcode area results, not individual stations
3. **Distance slider** — smooth dragging with live label update, URL only updates on release

---

## Fix 1: Map — Uncluster on Side Panel Card Select

### Problem

When a user clicks a station card in the side panel, `DashboardClient` sets `selectedId`, which triggers a `useEffect` in `MapView/PriceMarkers` that calls `marker.openPopup()`. If the marker is inside a `MarkerClusterGroup` cluster (i.e. it has not been spiderfied or zoomed into), Leaflet silently ignores `openPopup()` because the marker is not currently on the map — it is hidden inside the cluster. The popup never appears.

### Solution

In `PriceMarkers` (`src/components/MapView.tsx`), update the `useEffect` that watches `selectedId` to use `clusterRef.current.zoomToShowLayer(marker, callback)` before opening the popup.

`zoomToShowLayer` is a method on `L.MarkerClusterGroup` that zooms and pans the map just enough so the given marker exits its cluster and becomes individually visible. It accepts a callback that fires once the animation completes and the marker is on the map. Open the popup inside that callback.

#### Exact change to `MapView.tsx` — the `selectedId` effect (lines 175–185)

**Current:**
```ts
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

**Replace with:**
```ts
useEffect(() => {
  if (selectedId) {
    const marker = markersRef.current.get(selectedId)
    const cluster = clusterRef.current
    if (marker && cluster) {
      cluster.zoomToShowLayer(marker, () => {
        marker.openPopup()
      })
    }
  } else {
    map.closePopup()
  }
}, [selectedId, map])
```

**Notes:**
- Remove the `map.panTo` call — `zoomToShowLayer` handles positioning.
- `clusterRef.current` is already in scope inside `PriceMarkers`.
- If `cluster` is null (stations list empty), the guard prevents a crash.
- No changes to marker creation, cluster setup, or any other effects.

---

## Fix 2: Side Panel Card — Remove Brand, Add 7-Day Price Change

### 2a. Remove brand from second line

**File:** `src/components/StationCard.tsx`

The second line currently renders:
```ts
{[station.brand, station.distance_km.toFixed(1) + ' km', ago].filter(Boolean).join(' · ')}
```

Remove `station.brand` from the array. The station name is already shown on the first line; the brand is redundant.

**Replace with:**
```ts
{[station.distance_km.toFixed(1) + ' km', ago].filter(Boolean).join(' · ')}
```

Result: second line becomes `1.2 km · 3 mins ago`.

### 2b. Add 7-day price change indicator

**File:** `src/lib/db/queries/prices.ts`

`getLatestPrices` has a `changeHours` parameter defaulting to `24`. Change the default to `168` (7 days = 7 × 24). This affects the `LEFT JOIN LATERAL` subquery that calculates `price_change` — it looks back 168 hours instead of 24.

```ts
// Before:
export async function getLatestPrices(
  fuelTypeId: number,
  radiusKm: number,
  userLocation?: { lat: number; lng: number },
  changeHours: number = 24
): Promise<PriceResult[]>

// After:
export async function getLatestPrices(
  fuelTypeId: number,
  radiusKm: number,
  userLocation?: { lat: number; lng: number },
  changeHours: number = 168
): Promise<PriceResult[]>
```

**File:** `src/components/StationCard.tsx`

The card already has a price change block (lines 37–49) but the label shows only the raw cents value. Update it to append `/ 7d` to make the timeframe explicit.

**Current:**
```tsx
{change !== null && change !== 0 && (
  <div className={`flex items-center gap-0.5 text-[11px] font-semibold leading-tight ${
    change > 0 ? 'text-red-500' : 'text-emerald-600'
  }`}>
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      {change > 0
        ? <path d="M5 2L8.5 7H1.5L5 2Z" />
        : <path d="M5 8L1.5 3H8.5L5 8Z" />
      }
    </svg>
    {Math.abs(change).toFixed(1)}¢
  </div>
)}
```

**Replace with:**
```tsx
{change !== null && change !== 0 && (
  <div className={`flex items-center gap-0.5 text-[11px] font-semibold leading-tight ${
    change > 0 ? 'text-red-500' : 'text-emerald-600'
  }`}>
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      {change > 0
        ? <path d="M5 2L8.5 7H1.5L5 2Z" />
        : <path d="M5 8L1.5 3H8.5L5 8Z" />
      }
    </svg>
    {Math.abs(change).toFixed(1)}¢ / 7d
  </div>
)}
```

**Notes:**
- `price_change` is already in `PriceResult` and already queried — this is purely a display and default-value change.
- When `price_change` is `null` (no reading exists from 7 days ago) or `0` (no change), nothing is shown. This is correct behaviour.
- The 24h default was almost never showing because CKAN data doesn't update frequently. The 7d window gives a meaningful trend once real-time Direct API data is flowing.

---

## Fix 3: Location Search — Areas Only (No Stations)

### Problem

The current `/api/search` endpoint returns two result types: `area` (grouped by postcode, derived from station names) and `station` (individual station name matches). The area labels are constructed by stripping brand prefixes from station names (e.g. "BP North Lakes" → "North Lakes area"), which is fragile. Users typing a suburb name expect to see suburb results, not a list of service stations.

### Solution

**File:** `src/app/api/search/route.ts`

Replace the existing two-query approach with a single query that searches the `suburb` and `postcode` columns directly. Group by `suburb` to get the centroid and station count. Remove the station name search query entirely.

**New query:**
```sql
SELECT
  suburb,
  postcode,
  AVG(latitude)::numeric(10,6) AS lat,
  AVG(longitude)::numeric(10,6) AS lng,
  COUNT(*)::int AS station_count
FROM stations
WHERE is_active = true
  AND suburb IS NOT NULL
  AND (
    suburb ILIKE ${'%' + q + '%'}
    OR postcode LIKE ${q + '%'}
  )
GROUP BY suburb, postcode
ORDER BY COUNT(*) DESC
LIMIT 8
```

**New result label format:**
```ts
label: `${row.suburb} (${row.postcode})`
// e.g. "North Lakes (4509)"
```

**Remove entirely:**
- The station name search query (`stationRows` db.execute call)
- The `StationResult` type
- The `for (const row of stationList)` loop
- The `extractAreaName` function and its brand list
- The `stationList` variable

**Updated `SearchResult` type** (file-level):
```ts
type SearchResult = {
  type: 'area'
  label: string
  lat: number
  lng: number
  stationCount: number
}
```

**File:** `src/components/LocationSearch.tsx`

Remove station-specific rendering from the dropdown:
- Delete the `const stations = results.filter(...)` line
- Delete the `{stations.length > 0 && ...}` block
- Delete the divider between areas and stations (`{areas.length > 0 && stations.length > 0 && <div .../>}`)
- The `areas` variable and its rendering block remain unchanged

Also update the `SearchResult` interface at the top of the file to remove the station-specific fields:
```ts
// Before:
interface SearchResult {
  type: 'area' | 'station'
  label?: string
  name?: string
  id?: number
  lat: number
  lng: number
  stationCount?: number
}

// After:
interface SearchResult {
  type: 'area'
  label: string
  lat: number
  lng: number
  stationCount?: number
}
```

Update `handleSelect` to remove the station branch:
```ts
// Before:
const label = result.type === 'area' ? result.label! : result.name!

// After:
const label = result.label
```

**Notes:**
- The `suburb` column is already populated by the CKAN scraper (`runCkanScrapeJob` sets `suburb: r.Site_Suburb`).
- Grouping by `suburb, postcode` handles the case where the same suburb spans multiple postcodes — each combination gets its own result.
- The `LIMIT 8` (increased from 5) gives more room for suburb results since we no longer pad with stations.
- The `onSelect` callback in `DashboardClient` (`handleLocationSelect`) sets `userLocation` to the centroid lat/lng — this is unchanged and works correctly with area results.

---

## Fix 4: Distance Slider — Smooth Dragging

### Problem

`DistanceSlider` calls `onChange` on every `input` event. `DashboardClient.handleRadiusChange` debounces this by 400ms before updating the URL. While dragging, the URL updates mid-drag, triggering `useEffect → fetchPrices`, which re-fetches data and causes a re-render. This interrupts the drag and makes the slider feel jittery.

### Solution

Split slider state into two layers:
- **`dragValue`** — local state, updates instantly on every drag event. Controls the label and the input's displayed position.
- **`onChange` (committed value)** — fires only on `mouseup`/`touchend`, meaning the URL and data fetch only happen when the user finishes dragging.

**File:** `src/components/DistanceSlider.tsx`

Full replacement:
```tsx
'use client'

import { useState, useEffect } from 'react'

interface DistanceSliderProps {
  value: number
  onChange: (km: number) => void
}

export default function DistanceSlider({ value, onChange }: DistanceSliderProps) {
  const [dragValue, setDragValue] = useState(value)

  // Keep dragValue in sync if the prop changes from outside (e.g. URL navigation)
  useEffect(() => {
    setDragValue(value)
  }, [value])

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="range"
        min={1}
        max={50}
        step={1}
        value={dragValue}
        onChange={(e) => setDragValue(Number(e.target.value))}
        onMouseUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        className="w-[100px]"
      />
      <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
        {dragValue}km
      </span>
    </div>
  )
}
```

**File:** `src/app/dashboard/DashboardClient.tsx`

Remove the debounce entirely from `handleRadiusChange`. The slider now only calls `onChange` on release, so debouncing is no longer needed.

```ts
// Before:
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
function handleRadiusChange(km: number) {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => updateParam('radius', String(km)), 400)
}

// After:
function handleRadiusChange(km: number) {
  updateParam('radius', String(km))
}
```

Also remove the `debounceRef` declaration line entirely.

**Notes:**
- The `useEffect` syncing `dragValue` from `value` prop handles the case where the URL is changed externally (e.g. browser back/forward) — the slider position stays in sync.
- `onMouseUp` and `onTouchEnd` read `e.target.value` directly rather than `dragValue` to avoid stale closure issues.
- Keyboard arrow key changes (accessibility) still fire `onChange` via the existing `onMouseUp` path on most browsers. If keyboard-only users need finer control, this is sufficient for now.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/components/MapView.tsx` | `selectedId` effect: use `zoomToShowLayer` before `openPopup` |
| `src/components/StationCard.tsx` | Remove brand from second line; append `/ 7d` to change label |
| `src/lib/db/queries/prices.ts` | Change `changeHours` default from `24` to `168` |
| `src/app/api/search/route.ts` | Replace two-query approach with suburb/postcode-only query; remove station results and `extractAreaName` |
| `src/components/LocationSearch.tsx` | Remove station rendering, update `SearchResult` interface, simplify `handleSelect` |
| `src/components/DistanceSlider.tsx` | Add `dragValue` local state; fire `onChange` only on `mouseup`/`touchend` |
| `src/app/dashboard/DashboardClient.tsx` | Remove `debounceRef` and debounce logic from `handleRadiusChange` |
