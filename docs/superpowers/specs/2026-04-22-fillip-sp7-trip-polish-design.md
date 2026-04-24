# SP-7 — Trip Polish (D2: single-trip A→B planner refresh)

**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `2026-04-22-fillip-master-design.md` (§4 D2)
**Depends on:** SP-3 (UX core / dark mode / design tokens), SP-4 (D1 cycle engine), SP-6 (D4 true-cost prices)
**Type:** Sub-project design spec
**Branch (target):** `claude/funny-williams-d5c07f` → eventually merged to `fuel-spy`/main

---

## 1. Goal & non-goals

### 1.1 Goal

Take the existing `/dashboard/trip` route — already functional after the Phase-2 trip planner work (commits `4caca6c` → `c50a848`) — and elevate it to **the best single-trip A→B fuel planner in Australia**. Polish only: bug fixes, design-system reskin, and tight integration with the two new platform features that arrived between the trip planner's first ship and Fillip 1.0 (D1 verdict, D4 true-cost).

The user finishes SP-7 saying: "I open it, I type two addresses, in under two seconds I see exactly which station to fill at, what I'll really pay, and whether to do it now or wait."

### 1.2 Explicit non-goals (deferred — listed again in §13)

- Multi-stop / multi-waypoint optimisation (TSP-flavoured)
- Towing / load / vehicle weight profiles
- EV mixed-mode (charge stop suggestions)
- Live re-routing (continuous polling against current location)
- Saved trips / trip history
- Sharing a planned trip (covered separately by SP-8 share-card)

These remain queued as future sub-projects.

---

## 2. Bug audit checklist

Before any visual work, the existing flow gets a single full pass. The list below is what to check; ✓ items are confirmed already fixed, ☐ items are the polish targets.

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Price displayed as cents-per-litre, **not** divided by 10 | ✓ fixed | Commit `42a6757`. Both `TripStationList.tsx:45` and `TripMap.tsx:95` use `priceCents.toFixed(1)` directly. Add a regression test (see §11). |
| 2 | `/dashboard/trip` reads `MAPBOX_TOKEN` at request time | ✓ fixed | Commit `7ca6ad3` adds `export const dynamic = 'force-dynamic'` in `page.tsx`. Verify still present after any restructure. |
| 3 | Page gracefully degrades when `MAPBOX_TOKEN` is unset | ✓ fixed | Commits `9620dd1` / `57dddc1`. `<TripDisabled />` rendered server-side. Reskin must keep this branch — do not move the env check into a client component. |
| 4 | AddressSearch combobox ARIA + click-outside | ✓ fixed | `AddressSearch.tsx` has `role="combobox"`, `aria-expanded`, `aria-activedescendant`, listbox/option roles, mousedown click-outside handler. Keep all of this through the reskin. |
| 5 | Form-as-map-overlay attempt | reverted | Commits `fdf9330` → `c50a848`. Do **not** reintroduce the overlay layout — see §4.4 for the chosen alternative. |
| 6 | Map marker overlap when two stations are within ~50 m | ☐ open | Current `L.marker` per station with no clustering. Cluster threshold needs design — see §4.5. |
| 7 | Default corridor width | ☐ open | TripForm default is `2 km` (commit-confirmed at `TripForm.tsx:26`). Master spec mentions a "5 km buffer?" — that was an earlier guess. **Current code = 2 km, slider 0.5–20 km.** Recommendation in §6. |
| 8 | Detour minutes calculation | ☐ open | `detourMinutes()` in `TripStationList.tsx:14` simplifies `meters/1000 * (60/60)` and rounds — i.e. assumes 60 km/h flat. Acceptable for v1, document the assumption, surface a tooltip ("≈ at 60 km/h"). |
| 9 | Submit button disabled state contrast | ☐ open | `#555555` on `#2a2a2a` is below WCAG AA. Reskin will fix via design tokens. |
| 10 | Geolocation error vanishes after 3 s | ☐ minor | `setTimeout` in `TripForm.tsx:46`. Keep but ensure error is announced to screen readers (`role="status"`). |
| 11 | "No stations found" copy | ☐ open | Current copy is fine but doesn't tell the user *what* to do beyond "try widening". Improve in §4.7. |
| 12 | Map fitBounds on every route change | ☐ acceptable | Current behaviour; can feel jumpy if user has zoomed. Add a `userInteractedRef` flag to skip auto-fit after the user has panned/zoomed manually. |
| 13 | `/api/trip/stations` re-fetch on route change has silent failure path | ☐ minor | `TripClient.tsx:104` swallows the error to keep prior stations. Add a non-blocking toast: "couldn't refresh stations for new route". |
| 14 | Selected station never auto-scrolls into view in the list | ☐ open | When a marker is clicked on the map the list does not scroll to the matching item. Add `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`. |
| 15 | `/api/trip/route` errors are propagated as raw HTTP messages | ☐ open | Wrap in friendly copy ("We couldn't plan that route — try moving the pin off-water/off-highway"). |
| 16 | Mobile viewport — left column stacks above map | ☐ open | Current `md:grid-cols-[380px_1fr]` collapses to a single column. Map gets `h-[50vh]`. Improve mobile flow in §10. |

---

## 3. Visual redesign brief

### 3.1 Design system source of truth

SP-7 inherits SP-3's tokens. SP-3 must therefore have shipped (or at minimum the token file landed) before SP-7 starts. The tokens we consume:

- Colour scale (`--fillip-bg-0/1/2/3`, `--fillip-fg-0/1/2`, semantic `success/warn/danger`, brand accent `--fillip-accent` replacing the current hard-coded `#f59e0b`).
- Surface elevations (card, popover, modal).
- Type ramp (display/title/body/caption + the all-caps "eyebrow" label currently inlined as `labelStyle`).
- Spacing scale (4px base — current code uses ad-hoc `12 / 14 / 16 / 20`; consolidate).
- Radius scale (`sm 6 / md 8 / lg 10 / xl 12 / 2xl 16`).
- Dark/light parity — every screen must have both modes; chip variants in §5 must specify both.

### 3.2 Information architecture

The page keeps its current 2-column layout (form-left, map-right on desktop) — this won out over the overlay attempt because:

- The overlay (`fdf9330`) hid the form behind a "Edit Trip" pill, requiring two clicks to change anything.
- Reverting (`c50a848`) restored an immediately-editable form, which testers strongly preferred.
- The form is small (4 fields) and benefits from being persistently visible — the user re-runs queries frequently while exploring (changing fuel type, dragging the corridor slider).

Therefore: **persistent form left rail, no overlay**. The "Edit Trip" affordance is *the form itself*, always visible.

### 3.3 Card redesign — `TripStationCard` (replaces inline card markup in `TripStationList.tsx`)

```
┌──────────────────────────────────────────────────────┐
│ [#1] Shell Chermside           ●  FILL NOW    197.9¢ │   ← top row
│      Shell · Chermside                       (179.9¢) │   ← strikethrough pylon
│ ─────────────────────────────────────────────────────│
│ +3 min detour · 1.4 km off route · save $4.40 / fill │   ← meta row
│                                                       │
│ [ Open in Maps ▸ ]   [ Set as best fill ★ ]          │   ← actions
└──────────────────────────────────────────────────────┘
```

Components:

- **Rank chip** — keep the `#1`/`#2` numeric rank but switch from solid block to a subtle pill.
- **Name + brand line** — typography from SP-3 token `body-strong` and `caption-muted`.
- **D1 verdict chip** — see §5.
- **Effective price (large)** — what the user actually pays (D4) — primary visual weight.
- **Pylon price (strikethrough, small, inline)** — only shown if effective ≠ pylon.
- **Meta row** — detour minutes · detour km · "save $X / fill" callout (computed against the worst station shown, see §8).
- **Actions row** — `Navigate` (existing component, restyled) + `Set as best fill` (new — pins the row visually, becomes the recommended choice in any subsequent UI).

Card is `role="listitem"`, fully keyboard-operable (Enter selects, Space selects, Tab moves between actions inside the card).

### 3.4 Re-skinned form

Same fields, design-system tokens replace inline styles. Two specific tweaks:

- **Swap-direction button** between Start and End (small icon button, `↕`) — power users will use it constantly.
- **Corridor slider** gets numeric tick marks at 1, 2, 5, 10, 20 km and a quiet helper text: "Wider catches more stations but slows the search." The default moves to **3 km** (see §6).

### 3.5 Header

Match the SP-3 dashboard chrome — replace the bespoke `FUELSNIFFER` wordmark in `TripClient.tsx:135` with the shared `<AppHeader>` shipped by SP-3 / SP-0. Sub-title slot: "Trip Planner". Right-side slot: theme toggle + user menu (whatever SP-3 standardises).

---

## 4. Detailed surface changes

### 4.1 Loading state

- Skeleton for the form on first paint (already passes `<LoadingSkeleton/>` from page.tsx).
- During route fetch: subtle progress bar at the top of the form (not a full overlay) so the form stays interactive and the map keeps showing the previous result.
- During corridor re-fetch: shimmer the station list rows; do not unmount.

### 4.2 Error state

Three error variants:

| Source | Friendly copy | Action button |
|---|---|---|
| Routing API failure | "We couldn't plan that route. Check the pins and try again." | Retry |
| Geocode returned 0 results | "No matches for that address — try a suburb or postcode." | (inline in AddressSearch) |
| Corridor query timed out | "Took too long to search the corridor — try narrowing it." | Reset to 2 km |

All errors `role="alert"` and announced.

### 4.3 Empty state

Replace the current "No stations found" with:

> No fuel stations within **{corridorKm} km** of this route for **{fuelTypeLabel}**.
> [ Widen to 5 km ] [ Try a different fuel ]

Buttons act in-place — no page reload.

### 4.4 "Edit Trip" location decision

Confirmed: **the form itself IS the edit affordance**. No collapsing, no overlay, no second pill. Justification documented in §3.2. On mobile (§10) the form is collapsible into a sticky summary bar — that is a *display* compaction, not a separate "edit" mode.

### 4.5 Map marker overlap

- Below ~80 px screen separation, cluster markers using `leaflet.markercluster` (already in the dep list per CLAUDE.md).
- A cluster shows the **count + the cheapest price in the cluster**.
- Clicking a cluster zooms one level in (or expands a small popover list if zoom is already at max).
- Selected station is always rendered *outside* its cluster, slightly elevated, so the focused station never disappears into a cluster bubble.

### 4.6 Selected-station sync

Clicking a marker → list scrolls + highlights matching row.
Clicking a list row → marker pans into view + popup opens.
Already partly implemented in `TripClient.tsx:204` and `TripMap.tsx:143` — the missing piece is `scrollIntoView` on the list side (item 14 in §2).

### 4.7 Sort / filter UX (new)

A small horizontal control above the station list:

```
Sort:  [Effective price ▾]   Filter:  [All fuels] [All brands] [Verdict: any]
```

- **Sort by effective price** (default) — uses D4 effective if available, falls back to pylon.
- **Sort by detour minutes** — fastest fill.
- **Sort by D1 verdict** — `FILL_NOW` first, then `HOLD`, then `WAIT_FOR_DROP`, then `UNCERTAIN`.
- **Filter by brand** — multi-select; persisted to URL.
- **Filter by verdict** — single select.

State lives in URL search params so the route is shareable (`?sort=detour&brands=Shell,7-Eleven`).

---

## 5. D1 (verdict chip) integration

### 5.1 Source of truth

SP-4 ships `cycle_signals` (suburb-fuel level). The chip we render is **per-station**, derived as:

`station.verdict = cycle_signal(station.suburb, fuelTypeId)`

We do **not** compute per-station verdicts in SP-7; if SP-4 only exposes suburb-level granularity, the chip per-station simply mirrors the suburb's signal. That's good enough.

### 5.2 Chip variants

Four states from §4 of master spec. Visual spec (dark / light):

| State | Label | Dark BG / FG | Light BG / FG | Icon |
|---|---|---|---|---|
| `FILL_NOW` | "Fill now" | `success-900` / `success-200` | `success-50` / `success-700` | ⚡ |
| `HOLD` | "Hold" | `neutral-800` / `neutral-200` | `neutral-100` / `neutral-700` | – |
| `WAIT_FOR_DROP` | "Wait" | `warn-900` / `warn-200` | `warn-50` / `warn-700` | ⌛ |
| `UNCERTAIN` | "Mixed signal" | `neutral-700` / `neutral-300` | `neutral-100` / `neutral-600` | ? |

Tokens reference SP-3's palette — actual hex deferred to that spec.

### 5.3 Where the chip appears

- On **every TripStationCard** (top-right of the name row, before the price).
- On the **map marker** as a small dot indicator (size 6 px) at the bottom-right of the price pill — using the chip's BG colour. Clicking the marker shows the full chip in the popup.
- In the **popup** body: full chip + 1-line explainer ("Chermside U91 is at its 14-day low — historically rises within 3 days").

### 5.4 Behaviour when D1 is unavailable

If `cycle_signals` returns null for that suburb-fuel (insufficient data, or SP-4 not deployed in the user's state yet), the chip does not render. No "?" placeholder — quiet failure.

---

## 6. Corridor query — confirm + tune

### 6.1 Current behaviour

- Default: 2 km (`TripForm.tsx:26`).
- Slider range: 0.5–20 km, step 0.5.
- Server endpoint: `/api/trip/stations` — expects `corridorMeters` (already plumbed).
- Backend implementation lives in `src/lib/trip/corridor-query.ts` (not re-read here; the contract surface from `TripClient.tsx` is enough for this spec).

### 6.2 Recommendation

- **Default → 3 km**, not 2. Rationale: in suburban Brisbane and most AU metro areas, 2 km misses major arterials running parallel to the chosen route by ~250–500 m. 3 km catches the obvious second-best alternative without exploding the result count.
- **Cap result count at 30** (currently 20) — for long inter-city trips users want more candidates.
- **Add a "show only top 10" toggle** when more than 10 results return — clutter control.
- **Detour-aware ranking** — keep current price-asc default sort, but break ties by detour seconds.
- **Suburb deduplication is OUT** — users sometimes specifically want the second-cheapest in the same suburb (different brand, different loyalty programme).

### 6.3 Performance note

The corridor query is run twice on every "change route option" click (`TripClient.tsx:79`). Add a 250 ms debounce on the route-change re-fetch so chip-spamming the route options doesn't hammer the API.

---

## 7. D4 (true-cost) integration

### 7.1 Data shape from SP-6

SP-6 exposes a per-user `EffectivePriceCalculator`:

```
calculator.priceFor(station, fuelTypeId) -> {
  pylonCents: number,         // raw scraped price
  effectiveCents: number,     // after user's enrolled discounts
  appliedProgrammes: string[] // e.g. ["RACQ -4¢", "Woolworths 4¢ docket"]
}
```

The trip page receives the user's enrolled-programmes set from the session (already in `user_settings` per master spec §6.1). The calculator runs server-side inside `/api/trip/stations` and the response gains an `effectivePriceCents` and `appliedProgrammes[]` field per station.

### 7.2 Where effective price replaces pylon

- **Card primary number** = `effectiveCents`. Pylon is shown small + strikethrough only when `effective < pylon`.
- **Map marker pill** = `effectiveCents` (the small price displayed inside the pill).
- **Sort default** = ascending by `effectiveCents`.
- **Best-fill badge** (`#1` rank pill in the card) = whichever station has the lowest **effective** price, with detour as tiebreaker.

### 7.3 "You save $X" callout

Per card:

`save = (worstEffectiveInResults - thisEffective) * tankSize`

Tank size defaults to **50 L** but can be set via the optional input in §8. Only displayed if `save > $0.50`. Shown in the card's meta row, prefixed with the SP-3 brand accent.

A separate **trip total** callout above the list:

> "Best fill saves you **$6.20** on a 50 L tank vs the most expensive station along this route."

### 7.4 Programme transparency

Tooltip on the effective price (and a small `i` icon for touch users):

> "Effective price assumes you use: RACQ membership (–4 ¢/L), Woolworths 4 ¢ docket. Edit your programmes in Settings."

Link goes to `/settings/discounts` (delivered by SP-6).

---

## 8. "Total trip fuel cost" estimate (new)

A small expandable panel above the station list:

```
▾ Trip fuel cost
   Tank size:  [ 50 ] L     Vehicle efficiency:  [ 8.0 ] L/100km
   Trip distance: 142 km   Fuel needed: ~11.4 L
   Cheapest option: $20.45   Most expensive: $26.65   Save: $6.20
```

Inputs:

- **Tank size** — number input, default 50 L, persisted in `localStorage` (per-device, not per-user — keeps SP-7 free of user-pref schema dependencies).
- **Efficiency** — default 8.0 L/100km (Australian small-car average). Same persistence.
- Both have presets: small (6.5), medium (8.0), large (11.0), 4WD (14.0), van (16.0).

Fuel needed = `tripDistanceKm * efficiency / 100`, capped at tank size.
Per-station cost projection = `fuelNeeded * effectiveCents / 100`.

Out of scope for SP-7: per-vehicle profiles tied to a user account (deferred — see §13).

---

## 9. Performance budget

SP-3 sets the page-wide budget at < 2 s map-interactive on 4G. Trip page must respect that.

Specific commitments:

- **Map bundle is dynamic-imported only** — already done (`TripClient.tsx:12`); confirm bundle analyzer shows no Leaflet in the initial JS chunk.
- **Routing API call is parallelised with prefetch of `/api/trip/stations`** — once routes return, fire stations request immediately (current behaviour).
- **First Contentful Paint must include the form** — server-render the form shell when possible (the form is `'use client'` today; we can keep that but add a static SSR fallback rendering of the inputs so the user sees structure during JS hydration).
- **Skeleton heights match real component heights** to avoid layout shift; CLS target 0.0.
- **MAPBOX_TOKEN check** stays server-side (`page.tsx`). Do not move it to a client component.
- **`dynamic = 'force-dynamic'`** stays on the page.
- **Lazy-load `leaflet.markercluster`** only when station count ≥ a threshold (e.g. 10) — saves bundle when the user has tight corridors with few results.

---

## 10. Mobile responsive pass

Breakpoints align with SP-3.

- **`< 640 px` (phone):** Form collapses into a sticky summary bar at top: `From: Roma St · To: Chermside · U91 · 3km [Edit ▾]`. Tap "Edit" expands the form as a sheet (not a modal — anchored to top, slides down). Map fills the screen. Station list slides up from the bottom as a draggable bottom sheet (50 % height default, snap to 100 %, snap to 12 %). This is a common pattern (Google Maps, Apple Maps) and feels native.
- **`640–1024 px` (tablet):** Same as desktop two-column, with a narrower form rail (320 px instead of 380 px).
- **`≥ 1024 px` (desktop):** Current two-column at 380 px / 1fr.

All touch targets ≥ 44 px (currently the 40 px form controls fall just short — bump to 44 px on mobile only).

---

## 11. Accessibility (trip controls specifically)

- Form: each field labelled, errors linked via `aria-describedby` (already present on AddressSearch).
- Submit button: `aria-busy` while loading (already done).
- Verdict chip: `aria-label` includes the full state ("Verdict: fill now") not just the icon.
- Corridor slider: `aria-valuetext` reads "3 kilometres" not "3".
- Station card: `role="listitem"` (already), Enter/Space toggles selection (already), Tab moves between in-card actions (currently the card itself is a `tabindex=0` div containing buttons — verify focus order; consider using `<article>` with focusable controls instead of the whole card being focusable, to avoid double-focus stops).
- Map: keyboard panning works (Leaflet default); add a "skip to station list" link before the map for screen-reader users.
- Theme contrast: the disabled-button pair `#555 on #2a2a2a` (item 9 in §2) fails AA — replace with token-driven `fg-disabled / bg-disabled` that meets AA.
- Reduced motion: respect `prefers-reduced-motion` for the spinner, the marker pan animation, and the bottom-sheet snap.

---

## 12. Test strategy

| Layer | What | Tool | Notes |
|---|---|---|---|
| Unit | Price formatting (`priceCents.toFixed(1)` regression — no ÷10) | Vitest | Snapshot test on `<TripStationCard price={1979} />` rendering "197.9¢". |
| Unit | Detour-minutes calc | Vitest | Boundary cases: 0 m, 100 m, 1500 m. |
| Unit | "You save $X" computation with a tank size and a worst-vs-best pair | Vitest | Includes the "< $0.50 hide" rule. |
| Unit | Sort comparators (effective, detour, verdict) | Vitest | Including ties + nulls. |
| Component | TripStationCard renders all four verdict variants | Vitest + RTL | Plus the "no D1 data" quiet-omit case. |
| Component | AddressSearch debounce + ARIA | Vitest + RTL | Already partly covered — extend for keyboard navigation. |
| Fixture | Corridor query API | Vitest | Frozen JSON fixture per QLD/NSW sample route; assert station count + ordering against it. Avoids hitting the DB in CI. |
| E2E | Happy path: type two addresses → submit → see results → click marker → list scrolls → effective price visible | Playwright | One AU metro route (Roma St → Chermside, U91). |
| E2E | Mapbox token missing → page renders `<TripDisabled />` | Playwright | Run with env var unset. |
| E2E | Sort + filter via URL params | Playwright | Hit `?sort=detour&brands=Shell` directly, assert ordering. |
| Visual | Trip card snapshot, dark + light, four verdict variants | Playwright screenshots | Pinned baselines. |
| A11y | axe-core on trip page in idle, results, error, empty states | Playwright + axe | Zero violations. |
| Perf budget | Lighthouse CI on the trip route | Lighthouse | LCP < 2.5 s, CLS = 0, TBT < 200 ms. |

---

## 13. Explicit DEFER list (restated)

These came up during scoping and are deliberately out of v1:

- **Multi-stop optimisation** — TSP / OR-tools-grade; promote to its own SP if/when chosen.
- **Towing / load profiles** — affects fuel-needed; needs vehicle model.
- **EV mixed-mode** — charge-stop suggestions interleaved with petrol.
- **Live re-routing** — continuous polling against device GPS.
- **Saved trips** — requires user-level persistence + UI for managing.
- **Cross-trip price history per station** — exists on the dashboard, link out to it from the popup, but no inline chart.
- **Per-vehicle saved profiles** — tank + efficiency stay device-local for v1 (§8).
- **Re-introducing the form-as-overlay pattern** — explicitly rejected, see §3.2.
- **Sharing a planned trip** — owned by SP-8 (share-card / viral).

Each of the above is a valid future sub-project. Fillip 1.0 ships without them.

---

## 14. Open questions (with recommended defaults)

| # | Question | Recommended default | Status |
|---|---|---|---|
| Q1 | Default corridor width | **3 km** (was 2) | decision pending |
| Q2 | Cluster threshold (px between markers before clustering) | **80 px** | decision pending |
| Q3 | Tank-size default | **50 L** | decision pending |
| Q4 | Efficiency default | **8.0 L/100 km** (small car) | decision pending |
| Q5 | Persist tank/efficiency where? | **`localStorage` for v1**; user-account in a future SP | decision pending |
| Q6 | When D1 verdict is unavailable, hide chip or show "Mixed signal"? | **Hide entirely** — quiet failure | decision pending |
| Q7 | Result cap | **30** (was 20), with "show top 10" toggle when >10 | decision pending |
| Q8 | Share state via URL params? | **Yes** for sort + filter; **no** for tank/efficiency | decision pending |
| Q9 | Should the trip page deep-link from a station's verdict chip on the dashboard ("plan a trip via here")? | **Defer to SP-8** | decision pending |
| Q10 | Bottom-sheet library on mobile | **Custom CSS + a small hook** (no dep) — Vaul/etc. is overkill for this | decision pending |
| Q11 | Verdict chip shape — pill vs square badge | **Pill**, matches dashboard | decision pending |
| Q12 | Should the route-change re-fetch be debounced or fired on commit only? | **250 ms debounce** | decision pending |
| Q13 | Effective-price tooltip — hover only, or always-visible "i" icon for touch? | **Both** — `i` icon next to price, tooltip on hover/focus/tap | decision pending |

None of these block writing the implementation plan; all should be confirmed before the first commit lands.

---

## 15. Sequencing summary

1. SP-3 ships tokens and `<AppHeader>`.
2. SP-4 publishes `cycle_signals` query + types.
3. SP-6 publishes `EffectivePriceCalculator` + `/settings/discounts` UI.
4. SP-7 starts: bug audit pass (§2), then visual reskin (§3), then D1 + D4 integration (§5, §7), then sort/filter + total-trip cost (§4.7, §8), then mobile pass (§10), then a11y + perf hardening (§9, §11), then test strategy (§12).
5. Beta on `claude/funny-williams-d5c07f`, dogfood internally, then merge to main.

End of spec.
