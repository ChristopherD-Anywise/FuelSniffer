# Phase 2: Core Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 02-core-dashboard
**Areas discussed:** Price list layout, Map view design, Filtering & controls, Access control

---

## Price List Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Compact table rows | Dense spreadsheet-like rows | |
| Card per station | Each station gets a card with details | ✓ |
| You decide | Claude picks | |

**User's choice:** Card per station

| Option | Description | Selected |
|--------|-------------|----------|
| Cheapest first | Lowest price at top | ✓ |
| Nearest first | Closest station at top | |
| Switchable | Toggle between sorts | |

**User's choice:** Cheapest first

**Card info selected (multi):** Price + fuel type, Distance, Address, Freshness

**Stale data:** Dimmed/faded cards

---

## Map View Design

| Option | Description | Selected |
|--------|-------------|----------|
| Leaflet + OpenStreetMap | Free, open source, no API key | ✓ |
| Google Maps | Best UX but needs API key | |
| Mapbox | Slick styling but needs API key | |
| You decide | Claude picks | |

**User's choice:** Leaflet + OpenStreetMap

| Option | Description | Selected |
|--------|-------------|----------|
| List default | Price list is landing page | |
| Map default | Map is landing page | |
| Split view | List + map side by side | ✓ |

**User's choice:** Split view (desktop side-by-side, mobile toggle)

**Pin style:** Price on pin, colour-coded cheap to expensive
**List-map interaction:** Click syncs both views

---

## Filtering & Controls

**Fuel type filter:** Pill/chip selector (one active at a time)
**Distance filter:** Slider (1-50km, default 20km)
**Control placement:** Sticky top bar
**URL state:** Yes — filter params in URL

---

## Access Control

| Option | Description | Selected |
|--------|-------------|----------|
| Shared password | One password for everyone | |
| Invite codes | Unique codes per friend, revocable | ✓ |
| HTTP Basic Auth | Browser-native login | |
| You decide | Claude picks simplest | |

**User's choice:** Invite codes
**Session duration:** 7 days
