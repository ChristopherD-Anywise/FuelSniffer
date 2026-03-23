# Phase 2: Core Dashboard - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Responsive web dashboard showing current fuel prices near North Lakes. Users see a split view (list + map), filter by fuel type and distance, and access via invite codes. This is the MVP shared with friends. No trends, no alerts, no history charts — just current prices.

</domain>

<decisions>
## Implementation Decisions

### Price List Layout
- **D-01:** Card-based layout — one card per station with price, fuel type, distance, address, and freshness
- **D-02:** Default sort: cheapest first. User can toggle between price and distance sort.
- **D-03:** Stale prices shown as dimmed/faded cards — visually muted but still visible
- **D-04:** Each card shows: large price text for selected fuel, distance in km, street address, "X min ago" freshness indicator

### Map View
- **D-05:** Leaflet + OpenStreetMap tiles — free, no API key, self-hosted friendly
- **D-06:** Split view as default: list on one side, map on the other (desktop). Toggle between list/map on mobile.
- **D-07:** Map pins show price value directly on the pin (e.g. "145.9"), colour-coded from cheap (green) to expensive (red)
- **D-08:** Click syncs both views — clicking a card highlights the pin, clicking a pin scrolls to the card

### Filtering & Controls
- **D-09:** Fuel type filter: pill/chip selector row (ULP91 | ULP95 | ULP98 | Diesel | E10 | E85). One active at a time.
- **D-10:** Distance filter: slider from 1km to 50km (default 20km per PROJECT.md)
- **D-11:** Controls live in a sticky top bar — always visible, fuel pills + distance slider
- **D-12:** Filter state preserved in URL search params — shareable links, browser back works, bookmarkable

### Access Control
- **D-13:** Invite code system — generate unique codes for each friend. Can revoke individually.
- **D-14:** Login sessions last 7 days before requiring re-authentication

### Claude's Discretion
- Component library choice (shadcn/ui, Radix, headless, or vanilla Tailwind)
- Leaflet marker/popup implementation details
- Responsive breakpoint strategy for split view → toggle
- Colour scale algorithm for map pins
- Session token storage mechanism (cookie vs localStorage)
- Empty state design (no stations in radius, no data yet)
- Loading states and skeleton screens
- Error handling for failed API calls from frontend

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Data Layer (from Phase 1)
- `fuelsniffer/src/lib/db/schema.ts` — Drizzle schema: stations, priceReadings, scrapeHealth tables and TypeScript types
- `fuelsniffer/src/lib/db/client.ts` — Drizzle db singleton (reuse for API route queries)
- `fuelsniffer/src/lib/scraper/normaliser.ts` — `isWithinRadius()` haversine function (reuse for distance calculations)

### Research
- `.planning/research/STACK.md` — Recommended frontend stack
- `.planning/research/FEATURES.md` — Feature landscape and competitor analysis
- `.planning/research/ARCHITECTURE.md` — Component boundaries and data flow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fuelsniffer/src/lib/db/schema.ts` — Station and PriceReading types can be reused for API response types
- `fuelsniffer/src/lib/db/client.ts` — Drizzle db singleton for server-side queries in API routes
- `fuelsniffer/src/lib/scraper/normaliser.ts` — `isWithinRadius(lat, lng, radiusKm)` for distance filtering
- `fuelsniffer/src/app/api/health/route.ts` — Existing API route pattern to follow

### Established Patterns
- Next.js 16 App Router with TypeScript
- Tailwind CSS for styling (already configured)
- Drizzle ORM for database queries
- Zod for validation (already a dependency)

### Integration Points
- New API routes under `fuelsniffer/src/app/api/` for price queries
- New page routes under `fuelsniffer/src/app/` for dashboard
- `fuelsniffer/docker-compose.yml` — may need to add Cloudflare Tunnel service

</code_context>

<specifics>
## Specific Ideas

- Split view should feel like Google Maps search results — list on the left, map on the right
- Price pins on map should be immediately scannable — you should be able to glance at the map and spot the cheapest station without tapping anything
- "Usable on a mobile browser in a parked car" — large tap targets, clear typography, works in bright sunlight (high contrast)
- Invite codes should be simple to share — just a short alphanumeric code friends can type in

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-core-dashboard*
*Context gathered: 2026-03-23*
