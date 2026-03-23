---
phase: 02-core-dashboard
plan: 07
subsystem: dashboard
tags: [dashboard, orchestration, url-params, split-view, card-map-sync]
dependency_graph:
  requires: [02-05, 02-06]
  provides: [dashboard-page, DashboardClient, LoadingSkeleton, EmptyState, ErrorState]
  affects: [fuelsniffer/src/app/dashboard/, fuelsniffer/src/components/]
tech_stack:
  added: []
  patterns: [useSearchParams, dynamic-ssr-false, debounced-slider, card-pin-sync, url-params-state]
key_files:
  created:
    - fuelsniffer/src/app/dashboard/page.tsx
    - fuelsniffer/src/app/dashboard/DashboardClient.tsx
    - fuelsniffer/src/components/LoadingSkeleton.tsx
    - fuelsniffer/src/components/EmptyState.tsx
    - fuelsniffer/src/components/ErrorState.tsx
  modified:
    - fuelsniffer/src/components/StationCard.tsx
    - fuelsniffer/src/components/StationList.tsx
decisions:
  - "StationCard accepts optional cardRef callback prop; StationList accepts cardRefsMap and wires ref registration — enables DashboardClient to scrollIntoView on pin click without forwardRef complexity"
  - "DashboardClient passes cardRefsMap.current (the Map object) to StationList so ref registrations persist across renders"
  - "ErrorState uses HTML entity &apos; for apostrophe in 'Couldn't load prices' to satisfy React/JSX linting"
metrics:
  duration: 121s
  completed_date: 2026-03-23
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Phase 2 Plan 7: Dashboard Orchestration Layer Summary

**One-liner:** Full dashboard wired with URL-param state, split-view layout, card/pin sync, and all loading/empty/error states using DashboardClient + Suspense shell.

---

## What Was Built

### DashboardPage (`fuelsniffer/src/app/dashboard/page.tsx`)
Server Component shell that exports page metadata and wraps DashboardClient in a Suspense boundary with LoadingSkeleton as fallback. Required because `useSearchParams()` in DashboardClient needs a Suspense boundary per Next.js 16 rules.

### DashboardClient (`fuelsniffer/src/app/dashboard/DashboardClient.tsx`)
The orchestration layer. Responsibilities:
- Reads `fuel`, `radius`, `sort` from URL search params with defaults (`'2'`, `20`, `'price'`)
- Fetches `/api/prices?fuel=...&radius=...` on mount and when params change (via `useCallback` + `useEffect`)
- Writes param changes with `router.replace()` (not push) to avoid history pollution
- Debounces radius slider changes 400ms before updating URL
- Manages `selectedId` state for card/pin sync
- On pin click: sets selectedId, scrolls card into view, switches mobile to list view
- On card click: toggles selectedId
- Renders split layout: `md:grid-cols-2` desktop, mobile toggles list/map
- MapView loaded via `dynamic(() => import('@/components/MapView'), { ssr: false })`
- Renders LoadingSkeleton, ErrorState, EmptyState, or StationList based on state

### LoadingSkeleton (`fuelsniffer/src/components/LoadingSkeleton.tsx`)
Five skeleton cards with `animate-pulse`, matching StationCard's `grid-cols-[80px_1fr_56px]` 3-column layout and 80px min-height. No spinner.

### EmptyState (`fuelsniffer/src/components/EmptyState.tsx`)
Centred layout with dynamic `fuelLabel` and `radius` props. Copy: "No stations found" / "No {fuelLabel} stations within {radius} km..."

### ErrorState (`fuelsniffer/src/components/ErrorState.tsx`)
Client component (needs onClick). Copy: "Couldn't load prices" / "Something went wrong..." with "Try loading again" button (blue-600, h-11) that calls `onRetry`.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] StationCard and StationList updated for card ref registration**

- **Found during:** Task 2 — plan described passing `cardRefsMap` to StationList but existing StationCard/StationList had no ref support
- **Issue:** DashboardClient needs to scroll cards into view when a map pin is clicked. This requires each StationCard to register its DOM element with a ref map.
- **Fix:** Added optional `cardRef` callback prop to StationCard (`ref` on root div), and optional `cardRefsMap` prop to StationList that wires ref registration/cleanup for each card.
- **Files modified:** `fuelsniffer/src/components/StationCard.tsx`, `fuelsniffer/src/components/StationList.tsx`
- **Commit:** f516e59

---

## Known Stubs

None — all data flows wired. DashboardClient fetches live from `/api/prices`.

---

## Self-Check: PASSED

All created files verified present:
- FOUND: fuelsniffer/src/app/dashboard/page.tsx
- FOUND: fuelsniffer/src/app/dashboard/DashboardClient.tsx
- FOUND: fuelsniffer/src/components/LoadingSkeleton.tsx
- FOUND: fuelsniffer/src/components/EmptyState.tsx
- FOUND: fuelsniffer/src/components/ErrorState.tsx

All commits verified:
- FOUND: 83e29f0 (Task 1 — state components)
- FOUND: f516e59 (Task 2 — DashboardClient + DashboardPage)
