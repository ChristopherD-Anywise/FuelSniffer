# Fillip SP-7 — Trip Planner Polish (D2) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the existing `/dashboard/trip` A→B planner to production quality: fix all open bugs from the audit, apply SP-3 design tokens, integrate D1 verdict chips (SP-4) and D4 true-cost prices (SP-6) per-station, add sort/filter/total-trip-cost, pass a mobile-first responsive pass, and reach 100 % a11y compliance on trip controls.

**Depends on:** SP-3 (tokens + SlotVerdict/SlotTrueCost), SP-4 (`getSignalForStation`), SP-6 (`effective_price_cents` + `applied_programme_id` on price endpoints)

**Branch:** `sp7-trip-polish` branched from `fillip-integration`

**Baseline:** 601 passing tests (1 pre-existing failure in `input-validation.test.ts` unrelated to trip code — do not regress below 601).

**Lint baseline:** 42 errors — do not add new lint errors above this count.

---

## Bug Audit Status

| # | Item | Status | Action |
|---|---|---|---|
| 1 | Price ÷10 display bug | **DONE** (commit `42a6757`) | Add regression test (T-TEST-1) |
| 2 | `force-dynamic` on trip page | **DONE** (commit `7ca6ad3`) | Verify still present after restructure |
| 3 | MAPBOX_TOKEN gating + `<TripDisabled />` | **DONE** (commits `9620dd1` / `57dddc1`) | Preserve server-side env check in page.tsx |
| 4 | AddressSearch ARIA + click-outside | **DONE** (commit `57dddc1`) | Preserve through reskin |
| 5 | Form-as-overlay attempt | **REVERTED** (commit `c50a848`) | Do NOT reintroduce; form is persistent left rail |
| 6 | Map marker overlap | **OPEN** | T-BUG-1: Add leaflet.markercluster |
| 7 | Default corridor width 2 km → 3 km | **OPEN** | T-BUG-2: Change default + update test |
| 8 | Detour minutes tooltip (assumes 60 km/h) | **OPEN** | T-BUG-3: Add "≈ at 60 km/h" tooltip |
| 9 | Submit button disabled state contrast | **OPEN** | T-BUG-4: Fix via design tokens |
| 10 | Geolocation error `role="status"` | **OPEN** | T-BUG-5: Add role="status" aria-live |
| 11 | "No stations found" empty state | **OPEN** | T-BUG-6: Improve copy + CTA buttons |
| 12 | Map fitBounds on every route change | **OPEN** | T-BUG-7: Add `userInteractedRef` flag |
| 13 | Silent failure on corridor re-fetch | **OPEN** | T-BUG-8: Add non-blocking toast |
| 14 | Selected station list scroll | **OPEN** | T-BUG-9: Add `scrollIntoView` |
| 15 | Route errors as raw HTTP messages | **OPEN** | T-BUG-10: Friendly copy |
| 16 | Mobile viewport stacking | **OPEN** | T-MOB-1: Bottom-sheet on mobile |

---

## File Structure

**Files created** (all under `fuelsniffer/`):

| Path | Responsibility |
|---|---|
| `src/components/TripStationCard.tsx` | New extracted card component (replaces inline markup in TripStationList) with D1 verdict chip, D4 effective price, "Set as best fill", meta row |
| `src/components/TripSortFilter.tsx` | Horizontal sort+filter control bar above station list |
| `src/components/TripTotalCost.tsx` | Expandable "Trip fuel cost" panel with tank size / efficiency inputs |
| `src/components/TripToast.tsx` | Non-blocking in-memory toast for non-critical errors |
| `src/lib/trip/sort-filter.ts` | Sort comparators (effective price, detour, verdict) + filter predicate |
| `src/__tests__/trip/trip-card-price.test.tsx` | Price format regression test (no ÷10) |
| `src/__tests__/trip/trip-sort-filter.test.ts` | Sort comparator + filter predicate unit tests |
| `src/__tests__/trip/trip-total-cost.test.ts` | Total cost computation + "save <$0.50 hide" rule |
| `src/__tests__/trip/trip-station-card.test.tsx` | Verdict chip renders all four variants + quiet-omit |

**Files modified:**

| Path | Change |
|---|---|
| `src/app/dashboard/trip/TripClient.tsx` | Add sort/filter state, URL params, debounce on route-change refetch (250 ms), toast for silent failure, limit 20→30 |
| `src/app/api/trip/stations/route.ts` | Raise default limit cap to 30 |
| `src/components/TripForm.tsx` | Default corridorKm 2→3; add swap-direction button; corridor slider tick marks + helper text; token-driven styles; geolocation error `role="status"` |
| `src/components/TripMap.tsx` | Add `leaflet.markercluster`; `userInteractedRef` flag; verdict dot on marker; `scrollIntoView` callback |
| `src/components/TripStationList.tsx` | Delegate each row to `TripStationCard`; improved empty state; `role="status"` results count |
| `src/components/TripDisabled.tsx` | Token-driven styles (minor cleanup) |

**Deliberately NOT changed:**
- `src/lib/trip/corridor-query.ts` — the SQL stays identical; limit is passed from the API route
- `src/lib/cycle/queries.ts` — `getSignalForStation` used as-is from SP-4
- `src/lib/discount/calculator.ts` — effective price consumed from API response fields already added by SP-6
- `price_readings` table — no new DB migrations for SP-7

---

## Tasks

### T-BUG-1 — Map marker clustering
- [ ] Verify `leaflet.markercluster` is in package.json (per CLAUDE.md it's listed as a dep)
- [ ] In `TripMap.tsx`: import `L.markerClusterGroup`; wrap station markers in a cluster group
- [ ] Cluster icon shows count + cheapest price in cluster
- [ ] Selected station is always rendered outside the cluster (remove from cluster when selected, add back when deselected)
- [ ] Lazy-load the cluster plugin: only call `L.markerClusterGroup()` when `stations.length >= 10`; below threshold use plain markers (saves bundle for tight corridors)
- [ ] Add `userInteractedRef` flag: set on `map.on('dragstart')` and `map.on('zoomstart')`; if true, skip `fitBounds` on subsequent route changes

### T-BUG-2 — Default corridor width
- [ ] In `TripForm.tsx` change `useState(2)` → `useState(3)` (corridorKm default)
- [ ] Add `aria-valuetext` attribute to corridor slider: `"${corridorKm} kilometres"` (not just a number)
- [ ] Add numeric tick marks at 1, 2, 5, 10, 20 km using `<datalist>` + `list` attribute on the range input
- [ ] Add quiet helper text below slider: "Wider catches more stations but slows the search."
- [ ] Update `TripClient.tsx` corridor fetch to pass `limit: 30` (was 20)
- [ ] Update `/api/trip/stations/route.ts`: raise default from 20 to 30 in schema `.default(30)`

### T-BUG-3 — Detour tooltip
- [ ] In `TripStationCard.tsx` (new component, see T-RESKIN-1) add `title="approx. at 60 km/h"` on the detour display element
- [ ] Add `aria-label` that spells it out: `"${detour} minutes detour (approx. at 60 km/h)"`

### T-BUG-4 — Disabled-button contrast
- [ ] In `TripForm.tsx` submit button: replace `#555555` hard-code with `var(--color-text-subtle)` on `var(--color-border)` background — the token values already meet WCAG AA in both themes

### T-BUG-5 — Geolocation error a11y
- [ ] In `TripForm.tsx` geolocation error paragraph: add `role="status"` and `aria-live="polite"` so screen readers announce the "Location access denied" message

### T-BUG-6 — Empty state improvement
- [ ] In `TripStationList.tsx` empty state: replace plain text with a block that shows `No fuel stations within {corridorKm} km of this route for {fuelTypeLabel}.`
- [ ] Add two inline action buttons: `Widen to 5 km` (calls a new `onWidenCorridor` callback) and `Try a different fuel` (calls `onChangeFuel` callback)
- [ ] Wire the callbacks in `TripClient.tsx` to update form state and re-fetch

### T-BUG-7 — Map fitBounds + userInteracted flag
- [ ] Covered in T-BUG-1 (`userInteractedRef`); separate bullet to ensure it's tested

### T-BUG-8 — Non-blocking toast on route-change failure
- [ ] Create `src/components/TripToast.tsx`: a small positioned notice that auto-dismisses after 4 s, `role="status"` aria-live="polite"`
- [ ] In `TripClient.tsx` `handleRouteChange` catch block: set toast message "Couldn't refresh stations for new route" instead of swallowing silently

### T-BUG-9 — Selected station list scroll
- [ ] In `TripStationList.tsx`: add `ref` to each list item div; when `selectedId` changes, call `ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })`
- [ ] Respect `prefers-reduced-motion`: use `behavior: 'auto'` when reduced-motion is set

### T-BUG-10 — Friendly route error copy
- [ ] In `TripForm.tsx` route-fetch error handler: map raw HTTP messages to friendly copy:
  - `HTTP 4xx` → "Check the start and end pins and try again."
  - `HTTP 5xx` or network → "We couldn't plan that route. Try moving the pins off water or off a highway."
  - Generic → "Route planning failed. Please try again."

### T-RESKIN-1 — Extract TripStationCard component
- [ ] Create `src/components/TripStationCard.tsx` with the card layout from spec §3.3:
  - Rank pill (pill shape, SP-3 tokens, #1 uses `--color-accent`)
  - Station name + brand/suburb line (token typography)
  - D1 verdict chip slot (imports `SlotVerdict` — quiet-fail if `verdict` is null/undefined)
  - Effective price as primary large number (from `station.effectivePriceCents ?? station.priceCents`)
  - Pylon strikethrough when `effectivePriceCents < priceCents`
  - Meta row: detour minutes · detour km · "save $X / fill" (see T-D4-3)
  - Actions row: NavigateButton (restyled) + "Set as best fill ★" button
  - `role="listitem"`, keyboard: Enter/Space = select, Tab navigates to action buttons
- [ ] Update `TripStationList.tsx` to render `<TripStationCard>` per station

### T-RESKIN-2 — Token migration across all trip components
- [ ] `TripForm.tsx`: replace remaining hard-coded hex/pixel values with SP-3 CSS vars; `--radius-sm` on inputs, `--shadow-sm` on form card, remove inline `labelStyle` object (use a shared `eyebrow` class or inline `var()`)
- [ ] `TripMap.tsx`: map marker colours already use `getCssVar` — confirm; add `--map-tile-filter` CSS filter to TileLayer wrapper div (for dark mode map inversion, matching SP-3's pattern)
- [ ] `TripClient.tsx`: header — replace bespoke FILLIP wordmark block with `<AppHeader>` from SP-3 (or the equivalent shared component); sub-title "Trip Planner"
- [ ] `TripDisabled.tsx`: minor token cleanup; ensure it uses `var(--color-bg)`, `var(--color-text)`, `var(--color-accent)`
- [ ] Dark/light mode: spot-check all four components in both themes; no hard-coded hex colours should remain

### T-D1-1 — Verdict chip on TripStationCard
- [ ] Extend `CorridorStation` interface in `corridor-query.ts` to add optional `verdict?: CycleSignalView | null`
- [ ] In `/api/trip/stations/route.ts`: after `findStationsAlongRoute`, batch-call `getSignalForStation(stationId, fuelTypeId)` for each returned station (Promise.allSettled for resilience); attach verdict to each station response
- [ ] In `TripStationCard.tsx`: render `<SlotVerdict verdict={station.verdict} />` in the top-right of the name row (before the price); quiet failure = chip not rendered when verdict is null
- [ ] Both dark + light modes: `SlotVerdict` already handles token-driven colours via `--color-price-down` / `--color-price-up`

### T-D1-2 — Verdict dot on map marker
- [ ] In `TripMap.tsx` marker HTML: add a 6 px dot at bottom-right of the price pill when `verdict` is present
- [ ] Dot colour: `--verdict-fill-now` for FILL_NOW, `--verdict-wait` for WAIT_FOR_DROP, `--verdict-hold` for HOLD, no dot for UNCERTAIN or null
- [ ] In the popup HTML: render the full verdict chip + 1-line explainer (e.g. "Chermside U91 at 14-day low")

### T-D4-1 — Effective price as primary number
- [ ] In `TripStationCard.tsx`: use `station.effectivePriceCents ?? station.priceCents` as the primary price display
- [ ] Only show strikethrough pylon price when `effectivePriceCents !== undefined && effectivePriceCents < priceCents`
- [ ] Sort default in `TripClient.tsx` must use `effectivePriceCents ?? priceCents` (ascending)
- [ ] Map marker pill: use `effectivePriceCents ?? priceCents` (already formatted with `toFixed(1)`)

### T-D4-2 — Programme transparency tooltip
- [ ] In `TripStationCard.tsx`: add a small `ⓘ` icon next to the effective price
- [ ] On hover/focus/tap: show tooltip "Effective price assumes: [programme names]. Edit in Settings → Discounts."
- [ ] Link routes to `/settings/discounts` (delivered by SP-6)

### T-D4-3 — "Save $X" callout in meta row
- [ ] In `TripStationList.tsx` (or passed as prop to `TripStationCard`): compute `worstEffective = max(station.effectivePriceCents ?? station.priceCents)` across all stations
- [ ] Per-station: `saving = (worstEffective - thisEffective) * tankSize / 100` (in dollars)
- [ ] Only display if `saving >= 0.50`
- [ ] Also show a "trip total" callout above the list (see T-TOTAL-1)

### T-SORT-1 — Sort controls
- [ ] Create `src/components/TripSortFilter.tsx`: horizontal bar with sort selector and brand multi-select + verdict filter
- [ ] Sort options: `effective_price` (default), `detour_minutes`, `verdict` (FILL_NOW first)
- [ ] Create `src/lib/trip/sort-filter.ts`: `sortStations(stations, sort)` and `filterStations(stations, {brands, verdict})` pure functions
- [ ] Verdict sort order: FILL_NOW=0, HOLD=1, WAIT_FOR_DROP=2, UNCERTAIN=3, null=4
- [ ] State lives in URL search params: `?sort=detour&brands=Shell,7-Eleven&verdict=FILL_NOW`
- [ ] In `TripClient.tsx`: read URL params on mount; update URL on sort/filter change (no page reload, `window.history.replaceState`)

### T-TOTAL-1 — Trip total fuel cost panel
- [ ] Create `src/components/TripTotalCost.tsx`: expandable panel
- [ ] Inputs: tank size (default 50 L), efficiency (default 9 L/100 km); preset buttons: 6.5 / 8.0 / 11.0 / 14.0 / 16.0
- [ ] Persist tank + efficiency to `localStorage` (key: `fillip:trip:tank`, `fillip:trip:efficiency`)
- [ ] Computation: `fuelNeeded = min(tripDistanceKm * efficiency / 100, tankSize)`, per-station cost = `fuelNeeded * effectiveCents / 100`
- [ ] Display: cheapest option cost, most expensive, potential saving
- [ ] Wire `tripDistanceKm` from `routeResult.primary.distance / 1000`
- [ ] "Set as best fill" action: add `?bestFill={stationId}` to URL params; the chosen card renders a "Best fill ★" badge

### T-MOB-1 — Mobile responsive pass
- [ ] `TripClient.tsx`: on `< 640 px`, show a sticky summary bar at top (collapsed form): "From: {startLabel} · To: {endLabel} · {fuelLabel} · {corridorKm}km [Edit ▾]"
- [ ] Tap "Edit" on sticky bar expands the form as a top-anchored slide-down sheet; use `max-h + overflow-hidden + transition-max-height`; respect `prefers-reduced-motion` (skip transition)
- [ ] Station list on mobile: bottom-sheet drawer (CSS-only, no library dep); default 50 % height, snap to 100 % or collapsed to peek (80 px); draggable via `touchstart/touchmove/touchend` listeners
- [ ] Map fills screen between summary bar and bottom-sheet
- [ ] Touch targets: bump form controls to `min-height: 44px` on mobile (media query or Tailwind `sm:h-10`)
- [ ] Tablet (`640–1024 px`): two-column with 320 px form rail instead of 380 px

### T-A11Y-1 — Accessibility hardening
- [ ] Station list: add `role="status"` aria-live="polite"` on the results count line (e.g. "12 stations found") so screen readers announce when results update
- [ ] Add a skip link `<a href="#station-list">Skip to station list</a>` before the map container
- [ ] Corridor slider: `aria-valuetext="${corridorKm} kilometres"` (already planned in T-BUG-2)
- [ ] Verdict chip `aria-label`: "Verdict: fill now" (full state name, not just icon); already done in `SlotVerdict` — verify `aria-label` passes through to trip context
- [ ] Station card keyboard: verify `<article>` (or `role="listitem"` div) focus order — card focusable, Tab moves to NavigateButton then Set-as-best-fill; not double-focus-stops
- [ ] Map markers: existing `alt` attribute and keyboard panning (Leaflet default) — confirm still working after cluster refactor

### T-PERF-1 — Performance hardening
- [ ] Confirm `dynamic = 'force-dynamic'` still on `page.tsx` after any restructure (do not remove)
- [ ] Confirm TripMap is `dynamic(..., { ssr: false })` — already done in `TripClient.tsx:12`; no Leaflet in initial JS chunk
- [ ] Add 250 ms debounce to `handleRouteChange` in `TripClient.tsx` (currently fires immediately; use `useRef` timeout pattern)
- [ ] Skeleton heights: verify `<LoadingSkeleton />` matches approximate rendered height to minimise CLS

### T-TEST-1 — Price format regression (no ÷10)
- [ ] Create `src/__tests__/trip/trip-card-price.test.tsx` (vitest + RTL, happy-dom)
- [ ] Test: `<TripStationCard station={{priceCents: 1979, ...}} />` renders "197.9¢" (not "19.8¢" or "197.9" without the ¢)
- [ ] Test: `priceCents: 2019` renders "201.9¢"
- [ ] Test: `priceCents: 1500` renders "150.0¢"

### T-TEST-2 — Sort/filter unit tests
- [ ] Create `src/__tests__/trip/trip-sort-filter.test.ts`
- [ ] Test effective price sort: ascending order, ties broken by detour
- [ ] Test detour sort: ascending
- [ ] Test verdict sort: FILL_NOW < HOLD < WAIT_FOR_DROP < UNCERTAIN < null
- [ ] Test brand filter: `filterStations([...], {brands: ['Shell']})` returns only Shell stations
- [ ] Test verdict filter: `filterStations([...], {verdict: 'FILL_NOW'})` returns only FILL_NOW stations
- [ ] Test null/undefined effective price falls back to pylon in sort

### T-TEST-3 — Total trip cost unit tests
- [ ] Create `src/__tests__/trip/trip-total-cost.test.ts`
- [ ] Test: 100 km trip × 8 L/100km = 8 L fuel needed
- [ ] Test: capped at tank size (50 L)
- [ ] Test: cost = `fuelNeeded * effectiveCents / 100`
- [ ] Test: saving < $0.50 → not shown; saving = $0.50 → shown; saving > $0.50 → shown

### T-TEST-4 — TripStationCard component tests
- [ ] Create `src/__tests__/trip/trip-station-card.test.tsx`
- [ ] Test: renders all four verdict variants (FILL_NOW, HOLD, WAIT_FOR_DROP, UNCERTAIN)
- [ ] Test: no verdict → chip absent (no placeholder text, just layout gap)
- [ ] Test: effectivePriceCents < priceCents → strikethrough pylon shown
- [ ] Test: effectivePriceCents === priceCents → no strikethrough
- [ ] Test: "Set as best fill" button triggers `onSetBestFill` callback

---

## Explicit DEFER List

The following are explicitly out of scope for SP-7. Do not implement them.

- **Multi-stop optimisation** — TSP-grade; separate future SP
- **Towing / load / vehicle weight profiles** — needs vehicle model
- **EV mixed-mode** — charge-stop suggestions
- **Live re-routing** — continuous GPS polling
- **Saved trips / trip history** — requires user-level persistence
- **Cross-trip price history per station** — link out to dashboard, no inline chart
- **Per-vehicle saved profiles** — tank + efficiency stay device-local (localStorage) for v1
- **Form-as-overlay pattern** — explicitly rejected in spec §3.2, do not reintroduce
- **Sharing a planned trip** — owned by SP-8 (share-card / viral)
- **Show "top 10" toggle** when >10 results — can be added in SP-8 polish pass
- **Playwright e2e tests** — out of scope for this implementation pass (CI infra not wired); create placeholders as `.skip` if needed

---

## Open Question Defaults (from spec §14)

| Q | Question | Decision |
|---|---|---|
| Q1 | Default corridor width | **3 km** |
| Q2 | Cluster threshold | **80 px** (leaflet.markercluster default, ~= 80) |
| Q3 | Tank-size default | **50 L** |
| Q4 | Efficiency default | **9 L/100 km** (slightly higher than spec's 8 — conservative for QLD driving) |
| Q5 | Tank/efficiency persistence | **`localStorage`** |
| Q6 | D1 unavailable | **Hide chip entirely** |
| Q7 | Result cap | **30** |
| Q8 | Sort/filter via URL | **Yes** for sort + filter; **no** for tank/efficiency |
| Q10 | Bottom-sheet library | **CSS + hook only**, no dep |
| Q11 | Verdict chip shape | **Pill** |
| Q12 | Route-change debounce | **250 ms** |
| Q13 | Effective-price tooltip | **Both** — `ⓘ` icon + hover/focus/tap tooltip |

---

## Sequencing

Phase A (bugs + reskin, can run independently):
T-BUG-1 through T-BUG-10, T-RESKIN-1, T-RESKIN-2, T-PERF-1

Phase B (D1/D4 integration, depends on Phase A):
T-D1-1, T-D1-2, T-D4-1, T-D4-2, T-D4-3

Phase C (sort/filter/total, depends on Phase A):
T-SORT-1, T-TOTAL-1

Phase D (mobile + a11y, depends on Phase A + B):
T-MOB-1, T-A11Y-1

Phase E (tests, can run alongside each phase):
T-TEST-1, T-TEST-2, T-TEST-3, T-TEST-4
