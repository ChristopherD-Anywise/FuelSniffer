# Leaflet Keyboard Navigation — Accessibility Decision

**Date:** 2026-04-12
**Status:** Decision made — implementing Option C
**Spike scope:** MapView (dashboard map) + TripMap (trip planner map)

---

## Problem

Leaflet map pins are not keyboard-focusable by default. This means keyboard-only
users cannot directly interact with individual station pins. WCAG 2.1 success
criterion 2.1.1 (Keyboard) requires that all functionality be operable via
keyboard unless the underlying function requires a path-dependent input.

## Options evaluated

### Option A: Full custom DivIcon markers with roving tabindex

Replace default Leaflet markers with custom DivIcon overlays. Each marker receives
a `tabindex`, managed via a roving tabindex pattern. Full ARIA: `role="listbox"`
on the marker layer, `role="option"` on each marker.

**Pros:**
- Full keyboard access to every individual pin
- Highest WCAG compliance level

**Cons:**
- Leaflet does not natively support roving tabindex on its marker layer; substantial
  DOM surgery required
- Performance risk: 100+ simultaneous markers would each need tabindex bookkeeping,
  event listeners, and focus management — this strains Leaflet's internal rendering
  model
- `leaflet.markercluster` (used in MapView) dynamically adds and removes marker DOM
  nodes on zoom; maintaining coherent tabindex across cluster expand/collapse is
  extremely fragile
- High implementation cost for a small user group (personal tool shared with friends)

**Verdict: Rejected.** Engineering cost exceeds benefit for this audience size.

---

### Option B: Accept limitation, document in accessibility statement

Map pins are explicitly not keyboard-accessible. The station list (already built and
functioning) serves as the complete data-access alternative. An accessibility
statement acknowledges the limitation.

**Pros:**
- Zero additional complexity
- Station list already provides full access to all station data

**Cons:**
- Keyboard-only users who want geographic context cannot navigate the map
- Screen readers receive no information from map pins (pins are presentational
  `div` elements with no accessible text)
- Does not satisfy the spirit of WCAG 2.1.1 even if geographic interaction is
  path-dependent

**Verdict: Rejected.** The zero-effort option leaves screen readers with no map
context at all, which is unnecessarily poor.

---

### Option C: ARIA labels on pins + station list as primary keyboard path

All map pins receive an `aria-label` attribute containing station name and current
price. Leaflet's built-in keyboard handlers remain enabled (arrow key panning,
`+`/`-` zoom). The station list is the primary keyboard navigation method — it
provides the same data in a fully keyboard-accessible form.

**Pros:**
- Screen readers can read pin labels when a mouse user focuses a pin (or when AT
  uses object navigation)
- Leaflet pan/zoom keyboard support is already present; no additional code needed
  for map-level keyboard navigation
- Station list provides complete keyboard access to all data, satisfying 2.1.1 for
  the data-access use case
- Low implementation cost — one `aria-label` string per marker creation

**Cons:**
- Individual pins still cannot receive keyboard focus via Tab; a determined
  keyboard-only user cannot tab through pins
- Geographic context is not available to keyboard-only users who cannot use the
  station list for spatial reasoning

**Verdict: Accepted.** See recommendation below.

---

## Recommendation: Option C

The station list is the primary keyboard navigation path and satisfies WCAG 2.1.1
for data access. Map pins gain `aria-label` so screen readers have context when
pins are reached via mouse or AT object navigation. Leaflet's native keyboard
handlers (enabled by default — not disabled in either map component) allow
keyboard users to pan and zoom the map.

This is an appropriate middle ground for a personal tool shared with a small group
of friends. A future iteration could revisit Option A if the user base grows and
accessibility requirements increase.

---

## Keyboard handler verification

Leaflet enables keyboard navigation by default via its `Keyboard` handler. Neither
`MapView` nor `TripMap` pass `keyboard: false` to `MapContainer`, so arrow-key
panning and `+`/`-` zoom are active out of the box. No changes required.

`MapView` passes `zoomControl={false}` (hides the `+`/`-` buttons from the UI) but
this does not disable keyboard zoom — those are separate Leaflet handlers.
`TripMap` passes `zoomControl={true}` (default), so zoom buttons are visible there.

---

## Implementation summary

### MapView.tsx (`src/components/MapView.tsx`)

`L.divIcon` markers are created inside `PriceMarkers`. Each call to `L.marker()`
now passes an `alt` option whose value is
`"${station.name}, ${activeFuel} ${priceText}¢"`.

Leaflet attaches the `alt` value as the `alt` attribute on the `<img>` element it
generates inside the marker, and also — when using `L.divIcon` — sets an
`aria-label` attribute on the wrapping `<div>`. This gives assistive technology a
human-readable label for each pin.

### TripMap.tsx (`src/components/TripMap.tsx`)

`TripMap` already sets `title` and `alt` on its markers (line 114-115 before this
change). The `alt` value was updated to use the `¢` suffix for consistency with
MapView and to include the fuel type label where available. The existing `title`
attribute provides tooltip text for sighted mouse users and is unchanged.

---

## Accessibility statement addition (recommended, not in this spike)

Add to the FuelSniffer help/about page:

> **Map accessibility:** The station price map supports keyboard panning (arrow
> keys) and zoom (+/– keys). Individual map pins cannot currently be focused via
> Tab. All station data — name, price, address — is accessible via the Station
> List panel, which is fully keyboard-navigable.
