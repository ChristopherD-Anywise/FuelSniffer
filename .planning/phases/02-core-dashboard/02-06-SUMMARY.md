---
phase: 02-core-dashboard
plan: 06
subsystem: dashboard-map
tags: [leaflet, react-leaflet, map, divicon, colour-interpolation]
dependency_graph:
  requires: [02-03, 02-04]
  provides: [MapView component, getPinColour utility, Leaflet assets]
  affects: [02-07]
tech_stack:
  added: [leaflet, react-leaflet, @types/leaflet]
  patterns: [Leaflet DivIcon, HSL linear interpolation, useMap hook, useEffect markers]
key_files:
  created:
    - fuelsniffer/src/components/MapView.tsx
    - fuelsniffer/src/lib/map-utils.ts
    - fuelsniffer/public/leaflet/marker-icon.png
    - fuelsniffer/public/leaflet/marker-icon-2x.png
    - fuelsniffer/public/leaflet/marker-shadow.png
  modified:
    - fuelsniffer/src/__tests__/map.test.ts
    - fuelsniffer/package.json
    - fuelsniffer/package-lock.json
decisions:
  - "MapView.tsx is plain 'use client' component; dynamic() with ssr:false belongs in the consumer (DashboardClient, Plan 07) to prevent Leaflet window access crash"
  - "PriceMarkers implemented as a child component using useMap hook — react-leaflet has no native DivIcon component so markers are managed imperatively via useEffect"
  - "Leaflet broken icon fix applied at module top-level: delete _getIconUrl + mergeOptions pointing to /leaflet/ public assets"
metrics:
  duration: 3 minutes
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_changed: 8
requirements_delivered: [DASH-04]
---

# Phase 02 Plan 06: MapView Component Summary

**One-liner:** Leaflet/react-leaflet map with custom DivIcon price pins colour-coded via HSL interpolation (green cheapest, red most expensive) and broken icon fix.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | getPinColour() utility + map.test.ts (TDD) | 4abd9fe | src/lib/map-utils.ts, src/__tests__/map.test.ts |
| 2 | Build MapView component and copy Leaflet assets | 8337f95 | src/components/MapView.tsx, public/leaflet/*.png, package.json |

---

## What Was Built

### getPinColour() — `fuelsniffer/src/lib/map-utils.ts`

HSL linear interpolation across the current result set min/max price:
- `t = (price - min) / (max - min)`, clamped to 0 when min === max
- Hue: 120 (green) → 0 (red) as t goes 0 → 1
- Saturation: 70% → 75%
- Lightness: 35% → 45%
- Returns strings like `hsl(120,70%,35%)` exactly matching UI-SPEC.md tokens

### MapView — `fuelsniffer/src/components/MapView.tsx`

- `'use client'` component (no `ssr:false` inside — that belongs in the consumer)
- `MapContainer` centred on North Lakes (-27.2353, 153.0189) at zoom 12
- OpenStreetMap tiles via standard OSM URL
- `PriceMarkers` child component uses `useMap()` hook and manages markers imperatively via `useEffect`
- Each station renders a `L.divIcon` — 32px circle, HSL colour from `getPinColour()`, white 700-weight price text at 10px
- Selected pin: white outline ring (3px solid) + scale(1.2)
- Click handler calls `onPinClick(station.id)`
- Leaflet broken icon fix: `delete _getIconUrl` + `L.Icon.Default.mergeOptions` pointing to `/leaflet/` public assets

### Leaflet Assets — `fuelsniffer/public/leaflet/`

Copied from `node_modules/leaflet/dist/images/`:
- `marker-icon.png`
- `marker-icon-2x.png`
- `marker-shadow.png`

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None — MapView is a fully wired component accepting live PriceResult[] data. No placeholder or hardcoded data.

---

## Consumer Usage Note

When importing MapView in DashboardClient (Plan 07), use:
```typescript
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })
```
This is mandatory — Leaflet accesses `window` at import and will crash server rendering.

---

## Self-Check: PASSED

- [x] `fuelsniffer/src/lib/map-utils.ts` exists and exports `getPinColour`
- [x] `fuelsniffer/src/components/MapView.tsx` exists, `'use client'` at line 1
- [x] `fuelsniffer/public/leaflet/marker-icon.png` exists
- [x] `fuelsniffer/public/leaflet/marker-icon-2x.png` exists
- [x] `fuelsniffer/public/leaflet/marker-shadow.png` exists
- [x] 4 getPinColour tests all PASS
- [x] `npx tsc --noEmit` exits 0
- [x] No `ssr:false` in MapView.tsx
- [x] Commit 4abd9fe exists (Task 1)
- [x] Commit 8337f95 exists (Task 2)
