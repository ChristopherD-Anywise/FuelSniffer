# Dashboard UI Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three independent dashboard UI issues — map cluster popup, side panel card, location search, and distance slider.

**Architecture:** Four independent changes touching 7 files. No shared state between fixes. Each task produces a working commit. All changes are frontend/API — no database migrations.

**Tech Stack:** Next.js 16, React 19, Leaflet + leaflet.markercluster, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-dashboard-ui-fixes-design.md`

---

## File Map

| File | Action | Task |
|------|--------|------|
| `src/components/MapView.tsx` | Modify lines 174–185 | 1 |
| `src/components/StationCard.tsx` | Modify lines 48, 58 | 2 |
| `src/lib/db/queries/prices.ts` | Modify line 27 | 2 |
| `src/app/api/search/route.ts` | Rewrite (remove station search + extractAreaName) | 3 |
| `src/components/LocationSearch.tsx` | Modify (remove station rendering) | 3 |
| `src/components/DistanceSlider.tsx` | Rewrite (add local drag state) | 4 |
| `src/app/dashboard/DashboardClient.tsx` | Modify lines 69–73 (remove debounce) | 4 |

---

### Task 1: Map — Uncluster on Side Panel Card Select

**Files:**
- Modify: `src/components/MapView.tsx:174-185`

**Context:** The `PriceMarkers` component has a `useEffect` watching `selectedId`. When a user clicks a card in the side panel, `selectedId` changes, and this effect opens the marker's popup and pans the map. The bug: if the marker is inside a `MarkerClusterGroup` cluster, `openPopup()` silently fails because the marker isn't on the map — it's hidden inside the cluster icon.

`leaflet.markercluster` provides `zoomToShowLayer(marker, callback)` on `L.MarkerClusterGroup`. This method zooms/pans the map until the marker exits its cluster, then fires the callback. The type definition is at `node_modules/@types/leaflet.markercluster/index.d.ts:261`.

`clusterRef` is already available in scope — it's declared at `MapView.tsx:38` as `useRef<L.MarkerClusterGroup | null>(null)` and populated at line 142.

- [ ] **Step 1: Edit the selectedId effect in MapView.tsx**

Open `src/components/MapView.tsx`. Replace lines 174–185 (the `// Open popup for selected station and pan to it` effect):

```ts
  // Open popup for selected station and pan to it
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

With:

```ts
  // Open popup for selected station — zoom to uncluster if needed
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

- [ ] **Step 2: Verify the app compiles**

Run from `fuelsniffer/`:
```bash
npx next build 2>&1 | tail -20
```
Expected: Build completes without type errors. `zoomToShowLayer` is typed in `@types/leaflet.markercluster`.

- [ ] **Step 3: Manual smoke test (if dev server available)**

Start `npm run dev`, open dashboard, verify:
1. Click a station card for a station that appears inside a cluster bubble → map zooms in, cluster splits, popup appears
2. Click a station card for an already-visible (unclustered) station → popup opens immediately as before
3. Click a different station while a popup is open → first popup closes, map zooms to new station
4. Click the already-selected card again → popup closes (deselect)

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "fix: zoom to uncluster marker when selecting station from side panel"
```

---

### Task 2: Side Panel Card — Remove Brand, Add 7-Day Price Change

**Files:**
- Modify: `src/components/StationCard.tsx:48,58`
- Modify: `src/lib/db/queries/prices.ts:27`

**Context:** `StationCard.tsx` renders each station row in the side panel. Line 58 shows the second line as `brand · distance · time ago`. Line 48 shows the price change indicator with just `{cents}¢`. The `price_change` field comes from `getLatestPrices()` in `prices.ts`, which defaults to a 24-hour lookback (line 27: `changeHours: number = 24`). With CKAN monthly data, 24h rarely produces a change. Switching to 168h (7 days) makes this useful.

- [ ] **Step 1: Change the price change lookback from 24h to 7 days**

Open `src/lib/db/queries/prices.ts`. On line 27, change:

```ts
  changeHours: number = 24
```

To:

```ts
  changeHours: number = 168
```

This changes the `LEFT JOIN LATERAL` subquery's `WHERE pr.recorded_at < NOW() - (${changeHours} || ' hours')::interval` to look back 7 days instead of 24 hours.

- [ ] **Step 2: Remove brand from the card's second line**

Open `src/components/StationCard.tsx`. On line 58, change:

```tsx
          {[station.brand, station.distance_km.toFixed(1) + ' km', ago].filter(Boolean).join(' · ')}
```

To:

```tsx
          {[station.distance_km.toFixed(1) + ' km', ago].filter(Boolean).join(' · ')}
```

- [ ] **Step 3: Add "/ 7d" label to the price change indicator**

In the same file (`StationCard.tsx`), on line 48, change:

```tsx
            {Math.abs(change).toFixed(1)}¢
```

To:

```tsx
            {Math.abs(change).toFixed(1)}¢ / 7d
```

- [ ] **Step 4: Verify the app compiles**

Run from `fuelsniffer/`:
```bash
npx next build 2>&1 | tail -20
```
Expected: Build completes without errors.

- [ ] **Step 5: Run existing dashboard tests**

```bash
npx vitest run src/__tests__/dashboard.test.ts
```
Expected: All tests pass (the `sortStations` tests don't depend on `price_change` display).

- [ ] **Step 6: Manual smoke test (if dev server available)**

Start `npm run dev`, open dashboard, verify:
1. Station cards show `1.2 km · 3 mins ago` (no brand name)
2. If a station has a price change over 7 days, a coloured arrow + `5.1¢ / 7d` appears below the price
3. If no price change data exists for 7 days, no indicator is shown (no crash, no empty space)

- [ ] **Step 7: Commit**

```bash
git add src/components/StationCard.tsx src/lib/db/queries/prices.ts
git commit -m "fix: remove brand from card, show 7-day price change with label"
```

---

### Task 3: Location Search — Suburb/Postcode Only

**Files:**
- Modify: `src/app/api/search/route.ts` (rewrite)
- Modify: `src/components/LocationSearch.tsx`

**Context:** The search API currently runs two queries — one for area results (grouped by postcode, with labels derived from station names via `extractAreaName`) and one for individual station results. The frontend renders both in the dropdown. This task removes station results entirely and replaces the postcode-grouped area search with a proper suburb + postcode search using the `suburb` column (already populated by the CKAN scraper).

- [ ] **Step 1: Rewrite the search API route**

Open `src/app/api/search/route.ts`. Replace the entire file with:

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

const SearchQuerySchema = z.object({
  q: z
    .string({ required_error: 'q parameter is required' })
    .min(2, 'q must be at least 2 characters')
    .max(50, 'q must be at most 50 characters'),
})

type SearchResult = {
  type: 'area'
  label: string
  lat: number
  lng: number
  stationCount: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const parsed = SearchQuerySchema.safeParse({
    q: searchParams.get('q') ?? undefined,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return NextResponse.json({ error: firstIssue.message }, { status: 400 })
  }

  const q = parsed.data.q

  const rows = await db.execute(sql`
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
  `)

  const results: SearchResult[] = (rows as unknown as Array<Record<string, unknown>>).map(row => ({
    type: 'area' as const,
    label: `${row.suburb}${row.postcode ? ` (${row.postcode})` : ''}`,
    lat: Number(row.lat),
    lng: Number(row.lng),
    stationCount: Number(row.station_count),
  }))

  return NextResponse.json(results, { status: 200 })
}
```

This removes:
- The station name search query
- The `StationResult` and `AreaResult` types
- The `extractAreaName` function and its brand prefix list
- The `stationList` variable and its loop

- [ ] **Step 2: Simplify the LocationSearch component**

Open `src/components/LocationSearch.tsx`. Make three changes:

**Change 2a — Update the `SearchResult` interface (lines 9–17).** Replace:

```ts
interface SearchResult {
  type: 'area' | 'station'
  label?: string
  name?: string
  id?: number
  lat: number
  lng: number
  stationCount?: number
}
```

With:

```ts
interface SearchResult {
  type: 'area'
  label: string
  lat: number
  lng: number
  stationCount?: number
}
```

**Change 2b — Simplify `handleSelect` (line 51).** Replace:

```ts
    const label = result.type === 'area' ? result.label! : result.name!
```

With:

```ts
    const label = result.label
```

**Change 2c — Remove station rendering from the dropdown (lines 83–154).** Replace everything from `const areas = results.filter(...)` down to the closing `</div>` of the dropdown container (the entire return JSX block starting at line 86). Replace the full return statement with:

```tsx
  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* Search icon */}
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search suburb or postcode..."
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 pl-9 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-colors w-56"
      />

      {isOpen && results.length > 0 && (
        <div className="absolute bg-white border border-slate-200 rounded-lg shadow-lg mt-1 py-1 max-h-64 overflow-y-auto z-50 w-full min-w-56">
          {results.map((result, i) => (
            <button
              key={`area-${i}`}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <span className="text-sm font-medium text-slate-900">
                {result.label}
              </span>
              {result.stationCount != null && (
                <span className="text-xs text-slate-400 ml-1.5">
                  ({result.stationCount} station{result.stationCount !== 1 ? 's' : ''})
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
```

Also delete the now-unused line:
```ts
  const areas = results.filter((r) => r.type === 'area')
  const stations = results.filter((r) => r.type === 'station')
```

These two lines (currently at lines 83–84) are no longer needed since results are rendered directly.

- [ ] **Step 3: Verify the app compiles**

Run from `fuelsniffer/`:
```bash
npx next build 2>&1 | tail -20
```
Expected: Build completes without type errors.

- [ ] **Step 4: Manual smoke test (if dev server available)**

Start `npm run dev`, open dashboard, verify:
1. Type "North" → dropdown shows suburb results like `North Lakes (4509)` with station counts
2. Type "4509" → dropdown shows postcode match `North Lakes (4509)`
3. No individual station names appear in dropdown
4. Click a suburb result → map centres on that suburb, station list updates
5. Type "zzzz" → no results, dropdown doesn't appear

- [ ] **Step 5: Commit**

```bash
git add src/app/api/search/route.ts src/components/LocationSearch.tsx
git commit -m "fix: search shows only suburb/postcode results, not individual stations"
```

---

### Task 4: Distance Slider — Smooth Dragging

**Files:**
- Rewrite: `src/components/DistanceSlider.tsx`
- Modify: `src/app/dashboard/DashboardClient.tsx:69-73`

**Context:** The current slider calls `onChange` on every `input` event. `DashboardClient` debounces this at 400ms before updating the URL param, which triggers a `useEffect → fetchPrices → setStations → re-render`. This re-render during dragging causes the slider to jitter. The fix: maintain local `dragValue` state for instant visual feedback, only fire `onChange` on mouse/touch release.

- [ ] **Step 1: Rewrite DistanceSlider with local drag state**

Open `src/components/DistanceSlider.tsx`. Replace the entire file with:

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

Key differences from the old file:
- Adds `useState(value)` for `dragValue`
- Adds `useEffect` to sync prop → local state
- `onChange` on the `<input>` only updates `dragValue` (no parent callback)
- `onMouseUp` and `onTouchEnd` fire the parent `onChange`
- Label displays `dragValue` instead of `value`

- [ ] **Step 2: Remove debounce from DashboardClient**

Open `src/app/dashboard/DashboardClient.tsx`. Remove lines 69–73:

```ts
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleRadiusChange(km: number) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateParam('radius', String(km)), 400)
  }
```

Replace with:

```ts
  function handleRadiusChange(km: number) {
    updateParam('radius', String(km))
  }
```

Then check the import list at line 1. `useRef` is still used by `cardRefsMap` (line 38), so do NOT remove it from imports.

- [ ] **Step 3: Verify the app compiles**

Run from `fuelsniffer/`:
```bash
npx next build 2>&1 | tail -20
```
Expected: Build completes without errors. No unused import warnings for `useRef` since `cardRefsMap` still uses it.

- [ ] **Step 4: Run existing dashboard tests**

```bash
npx vitest run src/__tests__/dashboard.test.ts
```
Expected: All tests pass. Tests cover `sortStations` and `isStale`, not the slider or radius logic.

- [ ] **Step 5: Manual smoke test (if dev server available)**

Start `npm run dev`, open dashboard, verify:
1. Drag slider left/right → label updates instantly and smoothly, no jitter
2. Release slider → station list reloads with new radius
3. While dragging, the station list does NOT reload (no mid-drag fetch)
4. Navigate back/forward in browser → slider position syncs with URL param
5. On mobile (or touch simulator): touch-drag slider → same smooth behaviour, updates on release

- [ ] **Step 6: Commit**

```bash
git add src/components/DistanceSlider.tsx src/app/dashboard/DashboardClient.tsx
git commit -m "fix: smooth distance slider — only fetch on release, live label during drag"
```

---

## Post-Implementation

After all 4 tasks are committed:

- [ ] **Final build check**: `npx next build` — ensure clean build with all changes combined
- [ ] **Run full test suite**: `npx vitest run` — all existing tests still pass
- [ ] **Deploy**: Rebuild Docker image and restart on Mac Mini:
  ```bash
  docker compose build --no-cache app && docker compose up -d app
  ```
