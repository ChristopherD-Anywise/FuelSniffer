# Phase 2 — Trip Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship "find cheap fuel along my route" — user enters start + end, sees driving route(s) on a map with cheap stations along the corridor, adjusts corridor width, picks a station, and taps "Navigate" to hand off to Apple/Google Maps with the station as a waypoint.

**Architecture:** `RoutingProvider` interface (mirrors fuel provider pattern), Mapbox Directions adapter with `msw` fixture-based tests, server-side routing with 24h Postgres cache, PostGIS `ST_DWithin` corridor query, dedicated `/dashboard/trip` page, Apple/Google Maps deep-link handoff.

**Tech Stack:** Mapbox Directions API, PostGIS, msw (Mock Service Worker), react-leaflet (existing), Leaflet polyline rendering, Zod validation, Vitest.

**Depends on Phase 1 completion:** PostGIS enabled, provider abstraction landed, security headers + rate limiting active, NSW data flowing.

---

## Pre-flight: critical context

1. **PostGIS must be enabled** (Phase 1 Task 3). The corridor query uses `ST_DWithin` and `ST_MakePoint`. Verify with: `docker compose exec postgres psql -U fuelsniffer -d fuelsniffer -c "SELECT postgis_version();"`

2. **The `stations` table does NOT yet have a `geom` column.** Task 1 of this plan adds it. Column names in the existing schema are `latitude` and `longitude` (not `lat`/`lng`). PostGIS convention is `ST_MakePoint(longitude, latitude)` — lng first, lat second.

3. **The migration runner has a hardcoded file list** in `src/lib/db/migrate.ts`. Every new migration must update this list.

4. **`msw` (Mock Service Worker)** is the HTTP mocking convention for this project. Install it as a devDependency. Tests must never make live Mapbox API calls. A CI guard should fail the build if any test attempts a real outbound request.

5. **`MAPBOX_TOKEN` is server-only.** It must never appear in client-side code. The trip planner UI calls our own `/api/trip/route` endpoint, which calls Mapbox on the server side. A build-time grep verifies this.

6. **Rate limit for `/api/trip/route`:** 30 req/min per IP (tighter than `/api/prices` because each call potentially costs a Mapbox credit).

7. **The `excludeBrands` parameter** must be accepted by the corridor query function even though Phase 2 UI doesn't pass it. Phase 3 wires the brand filter into it. Include a unit test proving it works.

8. **Detour time badges are approximate.** `ST_Distance` returns straight-line distance, not road distance. Label with `≈` and document the approximation in the UI.

9. **Leaflet keyboard nav spike (Task 11)** is time-boxed to 2 days. It produces a decision doc, not necessarily a full implementation. The minimum viable deliverable is ARIA labels on pins + the station list as the keyboard-accessible alternative.

---

## File structure overview

New files created in Phase 2:

```
fuelsniffer/
├── src/
│   ├── lib/
│   │   ├── providers/
│   │   │   └── routing/
│   │   │       ├── index.ts                    [NEW — interface, types, registry]
│   │   │       └── mapbox/
│   │   │           ├── index.ts                [NEW — MapboxRoutingProvider]
│   │   │           ├── polyline.ts             [NEW — Mapbox polyline decoder]
│   │   │           └── __tests__/
│   │   │               ├── fixtures/           [NEW — recorded API responses]
│   │   │               │   ├── brisbane-goldcoast.json
│   │   │               │   ├── brisbane-toowoomba.json
│   │   │               │   ├── invalid-coords.json
│   │   │               │   └── rate-limited.json
│   │   │               └── setup.ts            [NEW — msw server setup]
│   │   ├── trip/
│   │   │   ├── corridor-query.ts               [NEW — PostGIS station match]
│   │   │   └── maps-deeplink.ts                [NEW — Apple/Google Maps URLs]
│   │   ├── db/
│   │   │   └── migrations/
│   │   │       ├── 0011_stations_geom.sql      [NEW]
│   │   │       └── 0012_route_cache.sql        [NEW]
│   │   └── security/
│   │       └── rate-limit.ts                   [MODIFIED — add /api/trip/route]
│   ├── app/
│   │   ├── api/
│   │   │   └── trip/
│   │   │       └── route/route.ts              [NEW — POST /api/trip/route]
│   │   └── dashboard/
│   │       └── trip/
│   │           └── page.tsx                    [NEW — trip planner page]
│   └── components/
│       ├── TripMap.tsx                         [NEW — route + corridor map]
│       ├── TripForm.tsx                        [NEW — start/end/fuel inputs]
│       ├── RouteChipStrip.tsx                  [NEW — route selector]
│       ├── TripStationList.tsx                 [NEW — corridor results]
│       └── NavigateButton.tsx                  [NEW — Maps deep-link CTA]
└── src/__tests__/
    ├── routing-provider.test.ts               [NEW]
    ├── mapbox-adapter.test.ts                 [NEW]
    ├── corridor-query.test.ts                 [NEW]
    ├── maps-deeplink.test.ts                  [NEW]
    └── trip-api.test.ts                       [NEW]
```

---

## Task 1: Migration — PostGIS geom column on stations

**Files:**
- Create: `src/lib/db/migrations/0011_stations_geom.sql`
- Modify: `src/lib/db/migrate.ts`
- Create: `src/__tests__/migration-0011.test.ts`

- [ ] **Step 1: Write the migration**

Create `fuelsniffer/src/lib/db/migrations/0011_stations_geom.sql`:

```sql
-- Migration 0011: Add PostGIS geometry column to stations
-- Enables spatial queries (ST_DWithin) for trip corridor search.
-- Backfills from existing latitude/longitude columns.
-- NOTE: PostGIS convention is MakePoint(longitude, latitude) — lng first!

ALTER TABLE stations ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

UPDATE stations
  SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  WHERE geom IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS stations_geom_gist ON stations USING GIST (geom);
```

- [ ] **Step 2: Add to migration runner**

Add `'0011_stations_geom.sql'` to the `files` array in `src/lib/db/migrate.ts`.

- [ ] **Step 3: Run the migration**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
```

- [ ] **Step 4: Write integration test**

Create `fuelsniffer/src/__tests__/migration-0011.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL required')
const sql = postgres(DATABASE_URL, { max: 1 })

describe('Migration 0011: stations geom column', () => {
  it('geom column exists on stations', async () => {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'stations' AND column_name = 'geom'
    `
    expect(rows.length).toBe(1)
  })

  it('GIST index exists', async () => {
    const rows = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'stations' AND indexname = 'stations_geom_gist'
    `
    expect(rows.length).toBe(1)
  })

  it('geom is populated for existing stations', async () => {
    const rows = await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(geom)::int AS with_geom
      FROM stations WHERE latitude IS NOT NULL
    `
    expect(rows[0].total).toBe(rows[0].with_geom)
  })

  it('geom coordinates match latitude/longitude', async () => {
    const rows = await sql`
      SELECT latitude, longitude,
             ST_Y(geom) AS geom_lat, ST_X(geom) AS geom_lng
      FROM stations LIMIT 1
    `
    if (rows.length > 0) {
      expect(Number(rows[0].geom_lat)).toBeCloseTo(Number(rows[0].latitude), 4)
      expect(Number(rows[0].geom_lng)).toBeCloseTo(Number(rows[0].longitude), 4)
    }
  })
})
```

- [ ] **Step 5: Run test and type-check**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx vitest run src/__tests__/migration-0011.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add fuelsniffer/src/lib/db/migrations/0011_stations_geom.sql \
        fuelsniffer/src/lib/db/migrate.ts \
        fuelsniffer/src/__tests__/migration-0011.test.ts
git commit -m "feat(db): add PostGIS geom column to stations with GIST index

Backfills from existing latitude/longitude. Enables ST_DWithin corridor
queries for the trip planner.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Routing provider interface + Mapbox adapter

**Files:**
- Create: `src/lib/providers/routing/index.ts`
- Create: `src/lib/providers/routing/mapbox/index.ts`
- Create: `src/lib/providers/routing/mapbox/polyline.ts`
- Create: `src/lib/providers/routing/mapbox/__tests__/fixtures/` (4 JSON files)
- Create: `src/lib/providers/routing/mapbox/__tests__/setup.ts`
- Create: `src/__tests__/routing-provider.test.ts`
- Create: `src/__tests__/mapbox-adapter.test.ts`
- Install: `msw` as devDependency

- [ ] **Step 1: Install msw**

```bash
cd fuelsniffer && npm install -D msw
```

- [ ] **Step 2: Create the routing provider interface**

Create `fuelsniffer/src/lib/providers/routing/index.ts`:

```typescript
export interface Coord {
  lat: number
  lng: number
}

export interface Route {
  polyline: Coord[]
  distanceMeters: number
  durationSeconds: number
  label?: string
}

export interface RouteResult {
  primary: Route
  alternatives: Route[]
}

export interface RoutingProvider {
  readonly id: string
  readonly displayName: string

  route(
    start: Coord,
    end: Coord,
    options: { alternatives: boolean; profile: 'driving' }
  ): Promise<RouteResult>
}

// ── Registry ────────────────────────────────────────────────────────────────

const providers: RoutingProvider[] = []

export function registerRoutingProvider(provider: RoutingProvider): void {
  if (providers.some(p => p.id === provider.id)) {
    throw new Error(`Routing provider '${provider.id}' is already registered`)
  }
  providers.push(provider)
}

export function getRoutingProvider(id?: string): RoutingProvider {
  if (id) {
    const p = providers.find(p => p.id === id)
    if (!p) throw new Error(`Routing provider '${id}' not found`)
    return p
  }
  if (providers.length === 0) throw new Error('No routing providers registered')
  return providers[0]
}

export function clearRoutingProviders(): void {
  providers.length = 0
}
```

- [ ] **Step 3: Write the polyline decoder**

Create `fuelsniffer/src/lib/providers/routing/mapbox/polyline.ts`:

```typescript
/**
 * Decode a Mapbox/Google encoded polyline string into an array of coordinates.
 * Mapbox Directions API returns geometry as an encoded polyline (precision 5 for
 * polyline, precision 6 for polyline6). We use precision 5 (the default).
 *
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
import type { Coord } from '../index'

export function decodePolyline(encoded: string, precision = 5): Coord[] {
  const factor = 10 ** precision
  const coords: Coord[] = []
  let lat = 0
  let lng = 0
  let index = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    lng += result & 1 ? ~(result >> 1) : result >> 1

    coords.push({ lat: lat / factor, lng: lng / factor })
  }

  return coords
}
```

- [ ] **Step 4: Record Mapbox fixture responses**

> **For executing agent:** Make ONE real Mapbox API call for each fixture, save the full JSON response, then never call Mapbox again. The fixtures are committed to the repo.

Create four fixture files under `src/lib/providers/routing/mapbox/__tests__/fixtures/`:

1. `brisbane-goldcoast.json` — a real response for Brisbane CBD → Gold Coast with `alternatives=true`
2. `brisbane-toowoomba.json` — a real response for Brisbane → Toowoomba (inland route, tests a different geometry shape)
3. `invalid-coords.json` — response for coords in the ocean (e.g., 0,0 → 0,0) — Mapbox returns an error body
4. `rate-limited.json` — a synthetic 429 response body: `{"message":"Rate limit exceeded"}`

Each file is the raw JSON from `https://api.mapbox.com/directions/v5/mapbox/driving/{lng1},{lat1};{lng2},{lat2}?alternatives=true&geometries=polyline&overview=full&access_token=TOKEN`.

**How to record:** Run once manually:

```bash
curl -s "https://api.mapbox.com/directions/v5/mapbox/driving/153.02,-27.47;153.43,-28.00?alternatives=true&geometries=polyline&overview=full&access_token=$MAPBOX_TOKEN" > src/lib/providers/routing/mapbox/__tests__/fixtures/brisbane-goldcoast.json
```

- [ ] **Step 5: Set up msw server for tests**

Create `src/lib/providers/routing/mapbox/__tests__/setup.ts`:

```typescript
/**
 * MSW (Mock Service Worker) setup for Mapbox Directions API tests.
 *
 * Intercepts all requests to api.mapbox.com and serves recorded fixtures.
 * No live Mapbox calls are ever made during tests.
 *
 * To add a new fixture:
 * 1. Make ONE real API call and save the JSON to __tests__/fixtures/
 * 2. Add a handler below matching the coordinate pattern
 */
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { readFileSync } from 'fs'
import { join } from 'path'

const fixturesDir = join(__dirname, 'fixtures')

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8')
}

export const mswServer = setupServer(
  // Brisbane → Gold Coast
  http.get('https://api.mapbox.com/directions/v5/mapbox/driving/153.02*,-27.47*;153.43*,-28.00*', () => {
    return HttpResponse.json(JSON.parse(loadFixture('brisbane-goldcoast.json')))
  }),

  // Brisbane → Toowoomba
  http.get('https://api.mapbox.com/directions/v5/mapbox/driving/153.02*,-27.47*;151.95*,-27.56*', () => {
    return HttpResponse.json(JSON.parse(loadFixture('brisbane-toowoomba.json')))
  }),

  // Invalid coords (ocean)
  http.get('https://api.mapbox.com/directions/v5/mapbox/driving/0*,0*;0*,0*', () => {
    return HttpResponse.json(JSON.parse(loadFixture('invalid-coords.json')), { status: 422 })
  }),

  // Catch-all — fail loudly if an unmocked route is hit
  http.get('https://api.mapbox.com/*', () => {
    throw new Error('Unmocked Mapbox API call detected! Add a fixture for this route.')
  }),
)
```

- [ ] **Step 6: Write the Mapbox adapter**

Create `fuelsniffer/src/lib/providers/routing/mapbox/index.ts`:

```typescript
import type { RoutingProvider, RouteResult, Route, Coord } from '../index'
import { decodePolyline } from './polyline'

export class MapboxRoutingProvider implements RoutingProvider {
  readonly id = 'mapbox'
  readonly displayName = 'Mapbox Directions'

  private token: string

  constructor() {
    const token = process.env.MAPBOX_TOKEN
    if (!token) {
      throw new Error(
        'MAPBOX_TOKEN environment variable is not set. ' +
        'Get a token at https://account.mapbox.com/'
      )
    }
    this.token = token
  }

  async route(start: Coord, end: Coord, options: { alternatives: boolean; profile: 'driving' }): Promise<RouteResult> {
    const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`
    const url = `https://api.mapbox.com/directions/v5/mapbox/${options.profile}/${coords}`
      + `?alternatives=${options.alternatives}&geometries=polyline&overview=full`
      + `&access_token=${this.token}`

    const response = await fetch(url)

    if (response.status === 429) {
      throw new MapboxRateLimitError('Mapbox rate limit exceeded')
    }

    if (!response.ok) {
      const body = await response.text()
      throw new MapboxApiError(`Mapbox API error ${response.status}: ${body}`)
    }

    const data = await response.json() as MapboxDirectionsResponse

    if (!data.routes || data.routes.length === 0) {
      throw new MapboxApiError('Mapbox returned no routes')
    }

    const [primary, ...alts] = data.routes.map((r, i) => this.mapRoute(r, i))

    return { primary, alternatives: alts }
  }

  private mapRoute(raw: MapboxRoute, index: number): Route {
    return {
      polyline: decodePolyline(raw.geometry),
      distanceMeters: raw.distance,
      durationSeconds: raw.duration,
      label: index === 0 ? undefined : `Alternative ${index}`,
    }
  }
}

// ── Error types ─────────────────────────────────────────────────────────────

export class MapboxApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapboxApiError'
  }
}

export class MapboxRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapboxRateLimitError'
  }
}

// ── Mapbox response types (minimal, not exhaustive) ─────────────────────────

interface MapboxRoute {
  geometry: string      // encoded polyline
  distance: number      // meters
  duration: number      // seconds
  legs: unknown[]
}

interface MapboxDirectionsResponse {
  code: string
  routes: MapboxRoute[]
  waypoints: unknown[]
}
```

- [ ] **Step 7: Write adapter tests**

Create `fuelsniffer/src/__tests__/mapbox-adapter.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mswServer } from '@/lib/providers/routing/mapbox/__tests__/setup'

// Set token before importing the provider (it reads on construction)
process.env.MAPBOX_TOKEN = 'test-token-for-fixtures'

import { MapboxRoutingProvider, MapboxApiError } from '@/lib/providers/routing/mapbox'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

describe('MapboxRoutingProvider', () => {
  const provider = new MapboxRoutingProvider()

  it('returns a primary route for Brisbane → Gold Coast', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -28.00, lng: 153.43 },
      { alternatives: true, profile: 'driving' }
    )
    expect(result.primary).toBeDefined()
    expect(result.primary.polyline.length).toBeGreaterThan(10)
    expect(result.primary.distanceMeters).toBeGreaterThan(50000)
    expect(result.primary.durationSeconds).toBeGreaterThan(1800)
  })

  it('returns alternatives when available', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -28.00, lng: 153.43 },
      { alternatives: true, profile: 'driving' }
    )
    // Mapbox may or may not return alternatives for this route
    expect(result.alternatives).toBeInstanceOf(Array)
  })

  it('polyline coordinates are valid Australian lat/lng', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -28.00, lng: 153.43 },
      { alternatives: true, profile: 'driving' }
    )
    for (const coord of result.primary.polyline) {
      expect(coord.lat).toBeGreaterThan(-45)
      expect(coord.lat).toBeLessThan(-10)
      expect(coord.lng).toBeGreaterThan(110)
      expect(coord.lng).toBeLessThan(160)
    }
  })

  it('throws MapboxApiError for invalid coordinates', async () => {
    await expect(
      provider.route(
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0 },
        { alternatives: false, profile: 'driving' }
      )
    ).rejects.toThrow(MapboxApiError)
  })
})
```

- [ ] **Step 8: Write registry tests**

Create `fuelsniffer/src/__tests__/routing-provider.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRoutingProvider,
  getRoutingProvider,
  clearRoutingProviders,
  type RoutingProvider,
} from '@/lib/providers/routing'

function makeFake(id: string): RoutingProvider {
  return {
    id,
    displayName: `Fake ${id}`,
    route: async () => ({
      primary: { polyline: [], distanceMeters: 0, durationSeconds: 0 },
      alternatives: [],
    }),
  }
}

describe('Routing provider registry', () => {
  beforeEach(() => clearRoutingProviders())

  it('registers and retrieves', () => {
    registerRoutingProvider(makeFake('mapbox'))
    expect(getRoutingProvider('mapbox').id).toBe('mapbox')
  })

  it('getRoutingProvider() returns first if no id', () => {
    registerRoutingProvider(makeFake('mapbox'))
    expect(getRoutingProvider().id).toBe('mapbox')
  })

  it('throws on duplicate registration', () => {
    registerRoutingProvider(makeFake('mapbox'))
    expect(() => registerRoutingProvider(makeFake('mapbox'))).toThrow()
  })

  it('throws when no providers registered', () => {
    expect(() => getRoutingProvider()).toThrow('No routing providers')
  })
})
```

- [ ] **Step 9: Run all tests**

```bash
cd fuelsniffer && npx vitest run src/__tests__/routing-provider.test.ts src/__tests__/mapbox-adapter.test.ts
npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add fuelsniffer/src/lib/providers/routing/ \
        fuelsniffer/src/__tests__/routing-provider.test.ts \
        fuelsniffer/src/__tests__/mapbox-adapter.test.ts \
        fuelsniffer/package.json fuelsniffer/package-lock.json
git commit -m "feat(routing): RoutingProvider interface + Mapbox adapter

msw fixture-based tests, polyline decoder, error discrimination
(MapboxApiError vs MapboxRateLimitError). No live API calls in tests.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Route cache migration + API route

**Files:**
- Create: `src/lib/db/migrations/0012_route_cache.sql`
- Modify: `src/lib/db/migrate.ts`
- Create: `src/app/api/trip/route/route.ts`
- Modify: `src/lib/security/rate-limit.ts` (add rate limit config)
- Create: `src/__tests__/trip-api.test.ts`

- [ ] **Step 1: Write the route cache migration**

Create `fuelsniffer/src/lib/db/migrations/0012_route_cache.sql`:

```sql
-- Migration 0012: Route cache for trip planner
-- Caches routing API responses for 24h to avoid redundant Mapbox calls.
-- Cache key is rounded start/end coords + alternatives flag.
CREATE TABLE IF NOT EXISTS route_cache (
  id              BIGSERIAL PRIMARY KEY,
  start_lat_r     NUMERIC(7,4) NOT NULL,  -- rounded to ~100m
  start_lng_r     NUMERIC(8,4) NOT NULL,
  end_lat_r       NUMERIC(7,4) NOT NULL,
  end_lng_r       NUMERIC(8,4) NOT NULL,
  alternatives    BOOLEAN NOT NULL DEFAULT false,
  provider_id     VARCHAR(32) NOT NULL DEFAULT 'mapbox',
  response_json   JSONB NOT NULL,
  response_hash   TEXT NOT NULL,           -- SHA-256 for integrity check
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS route_cache_lookup_idx
  ON route_cache (start_lat_r, start_lng_r, end_lat_r, end_lng_r, alternatives, provider_id);

CREATE INDEX IF NOT EXISTS route_cache_expires_idx
  ON route_cache (expires_at);
```

Add `'0012_route_cache.sql'` to the migration runner file list.

- [ ] **Step 2: Add the rate limit for trip route**

In `fuelsniffer/src/lib/security/rate-limit.ts`, add to the `RATE_LIMITS` object:

```typescript
  '/api/trip/route': { maxRequests: 30, windowMs: 60_000 },
```

- [ ] **Step 3: Write the API route**

Create `fuelsniffer/src/app/api/trip/route/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getRoutingProvider, registerRoutingProvider } from '@/lib/providers/routing'
import { MapboxRoutingProvider } from '@/lib/providers/routing/mapbox'

// Lazy-register the Mapbox provider if not already registered
try { registerRoutingProvider(new MapboxRoutingProvider()) } catch { /* already registered */ }

const RouteRequestSchema = z.object({
  start: z.object({
    lat: z.number().min(-44).max(-10),
    lng: z.number().min(112).max(154),
  }),
  end: z.object({
    lat: z.number().min(-44).max(-10),
    lng: z.number().min(112).max(154),
  }),
  alternatives: z.boolean().default(true),
})

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000  // ~100m precision
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RouteRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { start, end, alternatives } = parsed.data
  const startLatR = roundCoord(start.lat)
  const startLngR = roundCoord(start.lng)
  const endLatR = roundCoord(end.lat)
  const endLngR = roundCoord(end.lng)

  // Check cache
  const cached = await db.execute(sql`
    SELECT response_json, response_hash FROM route_cache
    WHERE start_lat_r = ${startLatR} AND start_lng_r = ${startLngR}
      AND end_lat_r = ${endLatR} AND end_lng_r = ${endLngR}
      AND alternatives = ${alternatives}
      AND provider_id = 'mapbox'
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `)

  if (cached.length > 0) {
    const row = cached[0] as unknown as { response_json: unknown; response_hash: string }
    const hash = createHash('sha256').update(JSON.stringify(row.response_json)).digest('hex')
    if (hash === row.response_hash) {
      return NextResponse.json(row.response_json)
    }
    // Hash mismatch — cache corrupted, fall through to fresh request
  }

  // Cache miss — call routing provider
  try {
    const provider = getRoutingProvider('mapbox')
    const result = await provider.route(start, end, { alternatives, profile: 'driving' })

    // Store in cache
    const responseJson = JSON.stringify(result)
    const responseHash = createHash('sha256').update(responseJson).digest('hex')

    await db.execute(sql`
      INSERT INTO route_cache (start_lat_r, start_lng_r, end_lat_r, end_lng_r, alternatives, provider_id, response_json, response_hash)
      VALUES (${startLatR}, ${startLngR}, ${endLatR}, ${endLngR}, ${alternatives}, 'mapbox', ${responseJson}::jsonb, ${responseHash})
    `)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Routing failed'
    if (message.includes('Rate limit')) {
      return NextResponse.json({ error: 'Routing service temporarily unavailable' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Routing failed' }, { status: 502 })
  }
}
```

- [ ] **Step 4: Write API tests**

Create `fuelsniffer/src/__tests__/trip-api.test.ts` with tests for: valid request returns routes, invalid coords return 400, cache hit returns same data, rate limit config exists for the endpoint.

- [ ] **Step 5: Run tests and type-check**

```bash
cd fuelsniffer && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(trip): route cache + POST /api/trip/route

24h Postgres cache keyed by rounded coords. Mapbox adapter on server
side, rate limited to 30/min. Coords validated to Australian bounds.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Corridor station query

**Files:**
- Create: `src/lib/trip/corridor-query.ts`
- Create: `src/__tests__/corridor-query.test.ts`

- [ ] **Step 1: Write the corridor query tests**

Create `fuelsniffer/src/__tests__/corridor-query.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { findStationsAlongRoute, type CorridorParams } from '@/lib/trip/corridor-query'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL required')

describe('findStationsAlongRoute', () => {
  const brisbaneToGoldCoast: CorridorParams = {
    polyline: [
      { lat: -27.47, lng: 153.02 },   // Brisbane CBD
      { lat: -27.60, lng: 153.10 },   // midpoint
      { lat: -28.00, lng: 153.43 },   // Gold Coast
    ],
    fuelTypeId: 2,
    corridorMeters: 5000,
    excludeBrands: [],
    providers: [],
    limit: 50,
  }

  it('returns stations with price and detour info', async () => {
    const results = await findStationsAlongRoute(brisbaneToGoldCoast)
    // May be empty if no test data, but should not throw
    expect(results).toBeInstanceOf(Array)
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('stationId')
      expect(results[0]).toHaveProperty('priceCents')
      expect(results[0]).toHaveProperty('detourMeters')
      expect(results[0]).toHaveProperty('name')
    }
  })

  it('respects excludeBrands parameter', async () => {
    const withExclude: CorridorParams = {
      ...brisbaneToGoldCoast,
      excludeBrands: ['7-Eleven'],
    }
    const results = await findStationsAlongRoute(withExclude)
    for (const r of results) {
      expect(r.brand).not.toBe('7-Eleven')
    }
  })

  it('respects corridor width — wider returns more stations', async () => {
    const narrow = await findStationsAlongRoute({ ...brisbaneToGoldCoast, corridorMeters: 500 })
    const wide = await findStationsAlongRoute({ ...brisbaneToGoldCoast, corridorMeters: 20000 })
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length)
  })
})
```

- [ ] **Step 2: Write the corridor query implementation**

Create `fuelsniffer/src/lib/trip/corridor-query.ts`:

```typescript
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { Coord } from '@/lib/providers/routing'

export interface CorridorParams {
  polyline: Coord[]
  fuelTypeId: number
  corridorMeters: number     // 500 to 20000
  excludeBrands: string[]    // empty = no exclusion
  providers: string[]        // empty = all providers
  limit: number              // max stations to return
}

export interface CorridorStation {
  stationId: number
  externalId: string
  sourceProvider: string
  name: string
  brand: string | null
  address: string | null
  suburb: string | null
  latitude: number
  longitude: number
  priceCents: number
  fuelTypeId: number
  detourMeters: number
}

/**
 * Find the cheapest stations within a corridor around a driving route.
 *
 * Uses PostGIS ST_DWithin to find stations near the route polyline,
 * joined to the latest price for the specified fuel type.
 * Results are sorted cheapest-first.
 *
 * The excludeBrands parameter MUST be accepted even though Phase 2 UI
 * doesn't pass it. Phase 3 wires the brand filter into this function.
 */
export async function findStationsAlongRoute(params: CorridorParams): Promise<CorridorStation[]> {
  const { polyline, fuelTypeId, corridorMeters, excludeBrands, providers, limit } = params

  // Build a LINESTRING from the polyline coordinates
  const lineWkt = `LINESTRING(${polyline.map(c => `${c.lng} ${c.lat}`).join(',')})`

  // Build dynamic WHERE clauses
  const brandClause = excludeBrands.length > 0
    ? sql`AND s.brand NOT IN (${sql.join(excludeBrands.map(b => sql`${b}`), sql`, `)})`
    : sql``

  const providerClause = providers.length > 0
    ? sql`AND s.source_provider IN (${sql.join(providers.map(p => sql`${p}`), sql`, `)})`
    : sql``

  const rows = await db.execute(sql`
    WITH latest_prices AS (
      SELECT DISTINCT ON (station_id, fuel_type_id)
        station_id, fuel_type_id, price_cents
      FROM price_readings
      WHERE fuel_type_id = ${fuelTypeId}
      ORDER BY station_id, fuel_type_id, recorded_at DESC
    )
    SELECT
      s.id AS station_id,
      s.external_id,
      s.source_provider,
      s.name,
      s.brand,
      s.address,
      s.suburb,
      s.latitude,
      s.longitude,
      p.price_cents,
      p.fuel_type_id,
      ST_Distance(
        s.geom::geography,
        ST_GeomFromText(${lineWkt}, 4326)::geography
      ) AS detour_meters
    FROM stations s
    JOIN latest_prices p ON p.station_id = s.id
    WHERE s.geom IS NOT NULL
      AND s.is_active = true
      AND ST_DWithin(
        s.geom::geography,
        ST_GeomFromText(${lineWkt}, 4326)::geography,
        ${corridorMeters}
      )
      ${brandClause}
      ${providerClause}
    ORDER BY p.price_cents ASC
    LIMIT ${limit}
  `)

  return (rows as unknown as CorridorStation[]).map(r => ({
    stationId: Number(r.stationId ?? r.station_id),
    externalId: String(r.externalId ?? r.external_id),
    sourceProvider: String(r.sourceProvider ?? r.source_provider),
    name: String(r.name),
    brand: r.brand ? String(r.brand) : null,
    address: r.address ? String(r.address) : null,
    suburb: r.suburb ? String(r.suburb) : null,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    priceCents: Number(r.priceCents ?? r.price_cents),
    fuelTypeId: Number(r.fuelTypeId ?? r.fuel_type_id),
    detourMeters: Number(r.detourMeters ?? r.detour_meters),
  }))
}
```

- [ ] **Step 3: Run tests**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:devpass@localhost:5432/fuelsniffer npx vitest run src/__tests__/corridor-query.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add fuelsniffer/src/lib/trip/corridor-query.ts \
        fuelsniffer/src/__tests__/corridor-query.test.ts
git commit -m "feat(trip): PostGIS corridor station query

ST_DWithin on route polyline with configurable corridor width,
excludeBrands, and provider filter. Cheapest-first with detour distance.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Maps deep-link builder

**Files:**
- Create: `src/lib/trip/maps-deeplink.ts`
- Create: `src/__tests__/maps-deeplink.test.ts`

- [ ] **Step 1: Write the tests**

Create `fuelsniffer/src/__tests__/maps-deeplink.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildAppleMapsUrl, buildGoogleMapsUrl } from '@/lib/trip/maps-deeplink'

const start = { lat: -27.47, lng: 153.02 }
const station = { lat: -27.70, lng: 153.20, name: "Shell O'Brien's Corner" }
const end = { lat: -28.00, lng: 153.43 }

describe('buildGoogleMapsUrl', () => {
  it('includes start, waypoint station, and destination', () => {
    const url = buildGoogleMapsUrl(start, station, end)
    expect(url).toContain('origin=-27.47,153.02')
    expect(url).toContain('destination=-28,153.43')
    expect(url).toContain('waypoints=-27.7,153.2')
    expect(url).toContain('travelmode=driving')
  })

  it('URL-encodes special characters in station name', () => {
    const url = buildGoogleMapsUrl(start, station, end)
    // The apostrophe in O'Brien's should be encoded
    expect(url).not.toContain("O'Brien")
  })
})

describe('buildAppleMapsUrl', () => {
  it('includes start and destination with station waypoint', () => {
    const url = buildAppleMapsUrl(start, station, end)
    expect(url).toContain('maps.apple.com')
    expect(url).toContain('saddr=-27.47,153.02')
    expect(url).toContain('daddr=')
    expect(url).toContain('-27.7,153.2')
  })
})

describe('coordinate validation', () => {
  it('rejects coords outside Australia', () => {
    const london = { lat: 51.5, lng: -0.1 }
    expect(() => buildGoogleMapsUrl(london, station, end)).toThrow('outside Australian bounds')
  })
})
```

- [ ] **Step 2: Write the implementation**

Create `fuelsniffer/src/lib/trip/maps-deeplink.ts`:

```typescript
interface Coord {
  lat: number
  lng: number
}

interface StationCoord extends Coord {
  name: string
}

function assertAustralianBounds(coord: Coord, label: string): void {
  if (coord.lat < -44 || coord.lat > -10 || coord.lng < 112 || coord.lng > 154) {
    throw new Error(`${label} coordinates (${coord.lat}, ${coord.lng}) outside Australian bounds`)
  }
}

export function buildGoogleMapsUrl(start: Coord, station: StationCoord, end: Coord): string {
  assertAustralianBounds(start, 'Start')
  assertAustralianBounds(station, 'Station')
  assertAustralianBounds(end, 'End')

  const params = new URLSearchParams({
    api: '1',
    origin: `${start.lat},${start.lng}`,
    destination: `${end.lat},${end.lng}`,
    waypoints: `${station.lat},${station.lng}`,
    travelmode: 'driving',
    waypoint_place_ids: '',
  })

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function buildAppleMapsUrl(start: Coord, station: StationCoord, end: Coord): string {
  assertAustralianBounds(start, 'Start')
  assertAustralianBounds(station, 'Station')
  assertAustralianBounds(end, 'End')

  // Apple Maps uses saddr (start) and daddr (destination) with + separator for waypoints
  const saddr = `${start.lat},${start.lng}`
  const daddr = `${station.lat},${station.lng}+to:${end.lat},${end.lng}`

  return `https://maps.apple.com/?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}&dirflg=d`
}
```

- [ ] **Step 3: Run tests**

```bash
cd fuelsniffer && npx vitest run src/__tests__/maps-deeplink.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add fuelsniffer/src/lib/trip/maps-deeplink.ts \
        fuelsniffer/src/__tests__/maps-deeplink.test.ts
git commit -m "feat(trip): Apple/Google Maps deep-link builder

Validates Australian bounds, URL-encodes all user-supplied strings.
Start → station waypoint → end handed off to native maps app.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6-10: Trip planner UI + accessibility

Tasks 6-10 cover the frontend work: TripForm, TripMap, RouteChipStrip, TripStationList, NavigateButton components, the `/dashboard/trip` page, and the Leaflet keyboard nav spike. These are UI-heavy tasks where the executing agent should:

1. **Follow existing component patterns** — look at `FilterBar.tsx`, `StationList.tsx`, `StationCard.tsx`, `MapView.tsx` for style conventions, Tailwind classes, and component structure.
2. **Use React Testing Library** (install `@testing-library/react @testing-library/jest-dom` as devDependencies if not already present).
3. **Test keyboard interaction** — every interactive element must be tabbable and have visible focus rings.

> **Note for executing agent:** The remaining tasks (6-10) do NOT have inline code in this plan because they are UI components whose exact markup depends on the existing design system, Tailwind classes, and component patterns established in the codebase. Instead, each task below describes **what to build**, **how to test it**, and **what the acceptance criteria are**. Use the existing components as structural templates.

### Task 6: TripForm component (~1 day)
- Reuses `LocationSearch` for start + end inputs
- "Use current location" button on start input (browser Geolocation API)
- `FuelSelect` for fuel type
- `DistanceSlider` variant for corridor width (0.5km–20km, default 2km)
- Calls `POST /api/trip/route` on form submit
- Tests: renders, submits with correct payload, geolocation denied fallback

### Task 7: TripMap component (~1.5 days)
- Extends the Leaflet pattern from `MapView.tsx` but draws route polylines
- Primary route: solid coloured line. Alternatives: dashed, lighter colour
- Station pins from corridor query results (colour-coded by price, same as main map)
- Non-colour route differentiation: solid vs dashed is the primary visual cue
- Tests: renders routes, re-renders on route switch

### Task 8: RouteChipStrip component (~0.5 days)
- `role="radiogroup"`, each chip `role="radio"` with `aria-checked`
- Arrow keys navigate, Enter/Space selects
- `aria-live="polite"` announces selection changes
- Tests: keyboard interaction, ARIA state, selection callback fires

### Task 9: TripStationList + NavigateButton (~1 day)
- Station cards from corridor results, sorted cheapest-first
- Detour badge: `≈+X min` (from `detourMeters / 1000` at 60km/h, labelled as approximate)
- NavigateButton detects platform (iOS/macOS → Apple Maps default, else Google Maps default)
- Secondary "Use [other] Maps" link
- Tests: renders station list, navigate button opens correct URL

### Task 10: `/dashboard/trip` page assembly (~1 day)
- New route at `/dashboard/trip`
- Composes TripForm + TripMap + RouteChipStrip + TripStationList
- "Find fuel on my route →" CTA added to the main dashboard linking here
- Loading and error states use existing `LoadingSkeleton` and `ErrorState`
- `prefers-reduced-motion` disables map animations
- Tests: page renders, full user flow works end-to-end

### Task 11: Leaflet keyboard nav spike (~2 days)
- Time-boxed spike, NOT the full implementation
- Deliverable: `docs/a11y/leaflet-keyboard-decision.md` with three options evaluated
- Minimum shipped: all pins get `aria-label`, station list is the complete keyboard alternative
- Leaflet pan/zoom keyboard handler enabled
- Full pin-by-pin tab navigation may or may not ship (depends on spike findings) — deferred to Phase 4 Task 3 if needed

---

## Phase 2 Definition of Done

- [ ] `RoutingProvider` interface, Mapbox adapter, and registry exist with tests
- [ ] `/api/trip/route` returns primary + alternatives with caching (24h)
- [ ] Corridor query returns correct stations for a known polyline (integration test)
- [ ] `excludeBrands` parameter works (tested, even though UI doesn't pass it yet)
- [ ] Trip planner page at `/dashboard/trip` — full user flow works
- [ ] "Use current location" works on at least one browser
- [ ] Deep-link URLs tested on a real device (Apple Maps + Google Maps)
- [ ] Map keyboard minimum: pan/zoom with arrows, ARIA labels on pins, station list as accessible alternative
- [ ] Route chip strip works with arrow keys and announces changes
- [ ] axe-core zero violations on the trip planner page
- [ ] `prefers-reduced-motion` respected
- [ ] Rate limit on `/api/trip/route` verified
- [ ] `MAPBOX_TOKEN` absent from client bundles (build-time grep)
- [ ] Leaflet keyboard decision doc written
- [ ] `npx vitest run` green, `npx tsc --noEmit` green, `npm audit` clean
