---
phase: 02-core-dashboard
plan: "05"
subsystem: ui-components
tags: [ui, components, filter, station-card, tailwind, tdd]
dependency_graph:
  requires: [02-03]
  provides: [FuelTypePills, DistanceSlider, FilterBar, StationCard, StationList, isStale, sortStations]
  affects: [02-07]
tech_stack:
  added: []
  patterns: [vanilla Tailwind CSS, controlled components, TDD with vi.useFakeTimers, date-fns formatDistanceToNowStrict]
key_files:
  created:
    - fuelsniffer/src/lib/dashboard-utils.ts
    - fuelsniffer/src/components/FuelTypePills.tsx
    - fuelsniffer/src/components/DistanceSlider.tsx
    - fuelsniffer/src/components/FilterBar.tsx
    - fuelsniffer/src/components/StationCard.tsx
    - fuelsniffer/src/components/StationList.tsx
  modified:
    - fuelsniffer/src/__tests__/dashboard.test.ts
decisions:
  - "isStale() boundary is exclusive (> not >=) so a price recorded exactly 60 minutes ago is not stale"
  - "StationCard price display divides price_cents by 10 to convert from QLD API integer encoding to c/L display"
  - "FilterBar renders two separate layout divs (hidden md:flex and flex md:hidden) for desktop vs mobile — avoids complex responsive class juggling on a single element"
metrics:
  duration_seconds: 256
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_changed: 7
---

# Phase 02 Plan 05: Filter Bar and Station Card Components Summary

**One-liner:** Vanilla Tailwind UI components — FuelTypePills, DistanceSlider, FilterBar, StationCard, StationList — plus isStale/sortStations utilities with 5 passing unit tests.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| Task 1 (TDD RED) | Failing dashboard.test.ts with isStale/sortStations tests | 5d01485 | dashboard.test.ts |
| Task 1 (TDD GREEN) | dashboard-utils.ts with isStale() and sortStations() | 5d01485 | dashboard-utils.ts |
| Task 2 | All 5 UI components: FuelTypePills, DistanceSlider, FilterBar, StationCard, StationList | 64ffb27 | 5 component files |

## What Was Built

### `fuelsniffer/src/lib/dashboard-utils.ts`

Exports `isStale(recordedAt: Date): boolean` — returns true when `Date.now() - recordedAt > 3600000ms` (exclusive boundary). Exports `sortStations(stations: PriceResult[], sort: SortMode): PriceResult[]` — sorts by `parseFloat(price_cents)` ascending for 'price' mode, or `distance_km` ascending for 'distance' mode. Non-mutating (spreads input array).

### `fuelsniffer/src/components/FuelTypePills.tsx`

6 fuel type pills (ULP91, ULP95, ULP98, Diesel, E10, E85) with QLD API fuelTypeId values. Inactive pills: `bg-white border border-zinc-300 text-zinc-700`. Active pill: `bg-blue-600 text-white border-transparent`. Each pill wrapped in `min-h-[44px]` div for touch target compliance.

### `fuelsniffer/src/components/DistanceSlider.tsx`

Native `<input type="range">` with min=1, max=50, step=1, `accent-blue-600` styling. "Within [N] km" label updates live on every tick.

### `fuelsniffer/src/components/FilterBar.tsx`

`sticky top-0 z-10 bg-zinc-100 border-b border-zinc-200`. Desktop (md+): single row `h-14` with pills, slider, and sort toggle. Mobile (<md): `h-[88px]` stacked layout with pills+map-toggle row and slider+sort row. Sort toggle buttons: "Cheapest first" (price) / "Nearest first" (distance) with active `bg-blue-600`. Mobile map toggle: "Map"/"List" with `md:hidden`.

### `fuelsniffer/src/components/StationCard.tsx`

`grid grid-cols-[80px_1fr_56px] p-4 min-h-[80px]`. Price block: `text-[28px] font-bold` with `opacity-40` wrapper when stale. Station info: `text-lg font-bold` name, `text-[15px]` address with `opacity-40` when stale (name is NOT dimmed). Freshness: `formatDistanceToNowStrict` + " ago" when fresh; "Outdated · Price may be outdated" when stale. Selected state: `border-l-4 border-blue-600`. Price display divides `price_cents` by 10 (QLD API encoding).

### `fuelsniffer/src/components/StationList.tsx`

`overflow-y-auto divide-y divide-zinc-100` container. Maps `stations` to `StationCard` with `isSelected={station.id === selectedId}` and `onClick`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all components are fully implemented. No hardcoded empty values, placeholder text, or unwired data sources.

## Verification Results

```
Test Files  1 passed (1)
Tests       5 passed (5)
TypeScript  Clean (npx tsc --noEmit, no errors)
```

Acceptance criteria satisfied:
- All 5 component files exist in `fuelsniffer/src/components/`
- All components have `'use client'` directive
- `opacity-40` applied to stale price block and address block in StationCard
- `ULP91` through `E85` pills with correct QLD API IDs
- `sticky top-0` in FilterBar
- `min-h-[44px]` touch targets on FuelTypePills
- `formatDistanceToNowStrict` imported from `date-fns`
- `StationCard` imported and used in StationList
- 5 unit tests for isStale() and sortStations() all pass
- TypeScript clean

## Self-Check: PASSED
