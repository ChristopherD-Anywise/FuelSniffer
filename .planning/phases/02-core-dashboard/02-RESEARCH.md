# Phase 2: Core Dashboard - Research

**Researched:** 2026-03-23
**Domain:** Next.js 16 App Router dashboard, Leaflet maps, invite-code auth, Drizzle queries
**Confidence:** HIGH (core patterns verified against bundled Next.js 16 docs), MEDIUM (react-leaflet SSR workaround)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Card-based layout — one card per station with price, fuel type, distance, address, and freshness
- **D-02:** Default sort: cheapest first. User can toggle between price and distance sort.
- **D-03:** Stale prices shown as dimmed/faded cards — visually muted but still visible
- **D-04:** Each card shows: large price text for selected fuel, distance in km, street address, "X min ago" freshness indicator
- **D-05:** Leaflet + OpenStreetMap tiles — free, no API key, self-hosted friendly
- **D-06:** Split view as default: list on one side, map on the other (desktop). Toggle between list/map on mobile.
- **D-07:** Map pins show price value directly on the pin (e.g. "145.9"), colour-coded from cheap (green) to expensive (red)
- **D-08:** Click syncs both views — clicking a card highlights the pin, clicking a pin scrolls to the card
- **D-09:** Fuel type filter: pill/chip selector row (ULP91 | ULP95 | ULP98 | Diesel | E10 | E85). One active at a time.
- **D-10:** Distance filter: slider from 1km to 50km (default 20km per PROJECT.md)
- **D-11:** Controls live in a sticky top bar — always visible, fuel pills + distance slider
- **D-12:** Filter state preserved in URL search params — shareable links, browser back works, bookmarkable
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | User can view current fuel prices in a sortable list | Drizzle query pattern: join stations + latest price_reading per fuel type, sorted by priceCents; `haversineDistanceKm` from normaliser.ts reused in JS for distance column |
| DASH-02 | User can filter stations by distance from their location (default 20km, configurable) | Distance slider → URL param `radius=20`; API route filters by haversine; NORTH_LAKES_LAT/LNG constants already in normaliser.ts |
| DASH-03 | User can filter by fuel type (ULP91, ULP95, ULP98, Diesel, E10, E85) | Pill selector → URL param `fuel=2` (QLD fuelTypeId); API WHERE clause on `fuel_type_id` |
| DASH-04 | User can view stations on a map with price pins | react-leaflet 5.0 + leaflet 1.9.4 + custom DivIcon; SSR disabled via `dynamic()` with `{ ssr: false }` |
| DASH-05 | Dashboard is responsive and works on mobile browsers | Tailwind breakpoints; `md:grid-cols-2` split → single-column toggle on mobile; 44px min touch targets |
| ACCS-01 | Basic shared access for a small group of friends (no heavy auth) | Invite code table in DB; `jose` 6.2.2 for JWT session cookie; Next.js 16 `proxy.ts` for route protection |
</phase_requirements>

---

## Summary

Phase 2 builds the MVP dashboard on top of the Phase 1 data pipeline. The stack is already decided: Next.js 16 App Router, Tailwind CSS, Drizzle ORM over TimescaleDB. Three new concerns appear in this phase that need careful handling.

First, Leaflet cannot run during server-side rendering — it accesses `window` on import. The fix is `dynamic(() => import('./MapView'), { ssr: false })`. This is the single most common Leaflet + Next.js failure mode. react-leaflet 5.0.0 is the current stable release and supports React 19 (confirmed via npm registry).

Second, URL search params as the source of truth for filter state requires `useSearchParams()` on the client side. In Next.js 16 App Router, reading and writing URL params from a Client Component uses the `useSearchParams()` hook and `router.push()` / `router.replace()`. Wrapping the page in a `<Suspense>` boundary is required when using `useSearchParams()` with static rendering.

Third, session auth for the invite code system is implemented using `jose` (JWT encrypt/decrypt) + HttpOnly cookies + Next.js 16's `proxy.ts` for route protection. The `middleware.ts` file convention has been **renamed to `proxy.ts`** in Next.js 16 — this is a breaking change from Next.js 15 and all training data.

**Primary recommendation:** Build in this order — DB schema additions (sessions + invite_codes tables) → API route (`/api/prices`) → auth layer (proxy.ts + login page) → dashboard page with card list → map panel.

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Next.js | 16.2.1 | App Router, API routes, proxy.ts auth guard | Installed |
| React | 19.2.4 | Dashboard UI | Installed |
| Tailwind CSS | ^4 | Responsive layout, utility styling | Installed |
| Drizzle ORM | ^0.45.1 | DB queries for price API route | Installed |
| Zod | ^4.3.6 | API query param validation | Installed |
| date-fns | ^4.1.0 | "X min ago" freshness formatting | Installed |

### New Dependencies (install required)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| leaflet | 1.9.4 | Map tiles and marker engine | Locked decision D-05. Latest stable. |
| react-leaflet | 5.0.0 | React bindings for Leaflet | Supports React 19. Latest stable. |
| @types/leaflet | 1.9.21 | TypeScript types for Leaflet | Dev dependency |
| jose | 6.2.2 | JWT encrypt/decrypt for session cookies | Official Next.js 16 auth docs use jose directly. Latest stable. |

**Installation:**
```bash
npm install leaflet react-leaflet jose
npm install -D @types/leaflet
```

### Alternatives Considered (Claude's Discretion items)

| Problem | Options | Recommendation |
|---------|---------|----------------|
| Component library | shadcn/ui, Radix, vanilla Tailwind | Use **vanilla Tailwind** — no extra install, matches project's existing zero-dependency preference; shadcn adds value for a larger app |
| Session storage | Cookie vs localStorage | **HttpOnly cookie** — cannot be read by JS (XSS safe), survives tab close, sent automatically on every request; localStorage requires manual header injection |
| Map pin colour scale | HSL lerp, fixed steps | **HSL lerp**: `green (hsl 120) → yellow (60) → red (0)` mapped to min/max price in current result set. Simple, scannable. |

---

## Architecture Patterns

### Recommended File Structure (additions to existing src/)

```
fuelsniffer/src/
├── app/
│   ├── page.tsx                    # Redirect → /dashboard (or login)
│   ├── login/
│   │   └── page.tsx                # Invite code entry form
│   ├── dashboard/
│   │   ├── page.tsx                # Server component shell + Suspense boundary
│   │   └── DashboardClient.tsx     # 'use client' — filter state, card list, map toggle
│   └── api/
│       ├── health/route.ts         # Existing
│       ├── prices/route.ts         # NEW: GET /api/prices?fuel=X&radius=Y
│       ├── auth/
│       │   ├── login/route.ts      # POST — validate invite code, create session cookie
│       │   └── logout/route.ts     # POST — delete session cookie
│       └── admin/
│           └── invite-codes/route.ts  # GET/POST/DELETE — manage invite codes (no UI in Phase 2)
├── components/
│   ├── StationCard.tsx             # Single station card (price, distance, freshness, stale dim)
│   ├── StationList.tsx             # Sorted/filtered list of StationCards
│   ├── MapView.tsx                 # Leaflet map (must be dynamic import, ssr:false)
│   ├── FuelTypePills.tsx           # Pill selector row
│   ├── DistanceSlider.tsx          # Range slider 1–50km
│   └── FilterBar.tsx               # Sticky container for pills + slider
└── lib/
    ├── db/
    │   ├── schema.ts               # Existing + new: invite_codes, sessions tables
    │   ├── client.ts               # Existing (reuse)
    │   └── queries/
    │       └── prices.ts           # getLatestPrices(fuelTypeId, radiusKm) query
    ├── session.ts                  # encrypt/decrypt JWT, createSession, deleteSession
    └── scraper/
        └── normaliser.ts           # Existing — haversineDistanceKm reused in prices.ts
```

### Pattern 1: Route Handler for Price Query

**What:** `GET /api/prices?fuel={fuelTypeId}&radius={km}` returns stations with their latest price for the requested fuel type, filtered to within `radius` km of North Lakes, sorted cheapest first.

**Key constraint:** The query must get the *latest* price_reading per station per fuel type — not just any row. Use a `DISTINCT ON (station_id)` subquery ordered by `recorded_at DESC`.

**Example:**
```typescript
// Source: fuelsniffer/src/lib/db/queries/prices.ts
import { db } from '@/lib/db/client'
import { stations, priceReadings } from '@/lib/db/schema'
import { sql, eq, and } from 'drizzle-orm'

// North Lakes coordinates (from normaliser.ts)
const NORTH_LAKES_LAT = -27.2353
const NORTH_LAKES_LNG = 153.0189

export async function getLatestPrices(fuelTypeId: number, radiusKm: number) {
  // Subquery: latest price per station for this fuel type
  // Then join to stations and filter by haversine distance in SQL
  return db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (station_id)
        station_id,
        price_cents,
        recorded_at,
        source_ts
      FROM price_readings
      WHERE fuel_type_id = ${fuelTypeId}
      ORDER BY station_id, recorded_at DESC
    )
    SELECT
      s.id,
      s.name,
      s.brand,
      s.address,
      s.suburb,
      s.latitude,
      s.longitude,
      l.price_cents,
      l.recorded_at,
      l.source_ts,
      (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(s.latitude) - RADIANS(${NORTH_LAKES_LAT})) / 2), 2) +
          COS(RADIANS(${NORTH_LAKES_LAT})) * COS(RADIANS(s.latitude)) *
          POWER(SIN((RADIANS(s.longitude) - RADIANS(${NORTH_LAKES_LNG})) / 2), 2)
        ))
      ) AS distance_km
    FROM latest l
    JOIN stations s ON s.id = l.station_id
    WHERE s.is_active = true
    HAVING (
      6371 * 2 * ASIN(SQRT(
        POWER(SIN((RADIANS(s.latitude) - RADIANS(${NORTH_LAKES_LAT})) / 2), 2) +
        COS(RADIANS(${NORTH_LAKES_LAT})) * COS(RADIANS(s.latitude)) *
        POWER(SIN((RADIANS(s.longitude) - RADIANS(${NORTH_LAKES_LNG})) / 2), 2)
      ))
    ) <= ${radiusKm}
    ORDER BY l.price_cents ASC
  `)
}
```

### Pattern 2: Next.js 16 Route Protection via proxy.ts

**BREAKING CHANGE from Next.js 15:** The `middleware.ts` file convention is **deprecated and renamed to `proxy.ts`** in Next.js 16. Use `proxy.ts` in `src/` (same level as `app/`).

**What:** `proxy.ts` intercepts every request, reads the session JWT from the cookie, and redirects unauthenticated users to `/login`.

**Example:**
```typescript
// Source: fuelsniffer/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
// File: fuelsniffer/src/proxy.ts
import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'
import { cookies } from 'next/headers'

const protectedRoutes = ['/dashboard']
const publicRoutes = ['/login', '/']

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isProtectedRoute = protectedRoutes.some(r => path.startsWith(r))
  const isPublicRoute = publicRoutes.includes(path)

  const cookie = req.cookies.get('session')?.value
  const session = await decrypt(cookie)

  if (isProtectedRoute && !session?.userId) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  if (isPublicRoute && session?.userId && !path.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
```

### Pattern 3: Session Management with jose + HttpOnly Cookie

**What:** Use `jose` to sign a JWT payload (`{ userId, expiresAt }`) and store it as an HttpOnly cookie. On login, validate the invite code, create session. `cookies()` in Next.js 16 is async.

**Example:**
```typescript
// Source: fuelsniffer/node_modules/next/dist/docs/01-app/02-guides/authentication.md
// File: fuelsniffer/src/lib/session.ts
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET)

export async function encrypt(payload: { userId: string; expiresAt: Date }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, { algorithms: ['HS256'] })
    return payload
  } catch {
    return null
  }
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await encrypt({ userId, expiresAt })
  const cookieStore = await cookies()  // cookies() is ASYNC in Next.js 16
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: true,
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
```

### Pattern 4: Leaflet Map with SSR Disabled

**What:** Leaflet accesses `window` on import and will crash Next.js SSR. Use `next/dynamic` with `{ ssr: false }` for the map component. Also requires `import 'leaflet/dist/leaflet.css'` and a workaround for the broken default marker icon paths in Webpack/Next.js builds.

**Example:**
```typescript
// File: fuelsniffer/src/app/dashboard/DashboardClient.tsx
'use client'
import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })
// Use <MapView /> normally — renders only on client, no SSR crash
```

```typescript
// File: fuelsniffer/src/components/MapView.tsx
'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix broken default icon paths in Next.js Webpack builds
// Source: react-leaflet community — known issue with all bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})
```

Copy Leaflet's marker images to `fuelsniffer/public/leaflet/` from `node_modules/leaflet/dist/images/`.

### Pattern 5: URL Search Params as Filter State

**What:** Fuel type and radius live in the URL (`?fuel=2&radius=20`). Client components read with `useSearchParams()`, write with `router.replace()`. Wrapping in `<Suspense>` is required for static rendering compatibility.

**Example:**
```typescript
// Source: Next.js 16 App Router docs
'use client'
import { useSearchParams, useRouter } from 'next/navigation'

export function FuelTypePills() {
  const params = useSearchParams()
  const router = useRouter()
  const activeFuel = params.get('fuel') ?? '2'  // default ULP91 = fuelTypeId 2

  function selectFuel(fuelTypeId: string) {
    const next = new URLSearchParams(params.toString())
    next.set('fuel', fuelTypeId)
    router.replace(`/dashboard?${next.toString()}`)
  }

  // render pills...
}
```

```typescript
// File: fuelsniffer/src/app/dashboard/page.tsx
import { Suspense } from 'react'
import DashboardClient from './DashboardClient'

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardClient />
    </Suspense>
  )
}
```

### Pattern 6: Stale Data Detection

**What:** A price reading is considered stale when `recorded_at` is more than 60 minutes old (the QLD API reports on price change; if no change is reported after 60 min the data is suspect). Stale cards receive `opacity-40` and a visual badge.

**Example:**
```typescript
// Source: project design decision, data is always inserted (D-09 from Phase 1)
const STALE_THRESHOLD_MS = 60 * 60 * 1000  // 60 minutes

export function isStale(recordedAt: Date): boolean {
  return Date.now() - new Date(recordedAt).getTime() > STALE_THRESHOLD_MS
}

// In StationCard.tsx:
// <div className={`card ${isStale(reading.recordedAt) ? 'opacity-40' : ''}`}>
```

### Anti-Patterns to Avoid

- **Importing Leaflet at the top of a Server Component or a file without `ssr: false`:** Crashes the build with `window is not defined`. Always use `dynamic()` with `{ ssr: false }`.
- **Using `middleware.ts` instead of `proxy.ts`:** In Next.js 16, the file is named `proxy.ts`. Using `middleware.ts` will silently have no effect — route protection will not work.
- **Calling `cookies()` synchronously:** In Next.js 16, `cookies()` returns a Promise. You must `await cookies()`. The sync API was removed.
- **Putting haversine filtering only in JavaScript after fetching all rows:** Always filter in SQL. For 50km radius there may be 200+ stations; filtering in JS wastes a round-trip.
- **Defaulting to `useEffect` + `fetch` for price data:** Prefer a Server Component that passes data to a Client Component as props — reduces client bundle size and avoids loading flash for initial render.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT session management | Custom HMAC implementation | `jose` (v6.2.2) | Constant-time comparison, algorithm agility, tested edge cases |
| Haversine distance in SQL | PostGIS extension | Raw SQL haversine formula (see Pattern 1) | PostGIS adds Docker complexity; the formula is 4 lines of SQL and is already proven in the scraper's JS equivalent |
| Map tile hosting | Self-hosted tile server | OpenStreetMap tiles via react-leaflet `TileLayer` | Free, maintained CDN; no server storage or bandwidth cost |
| Custom slider component | Hand-rolled range input | Native `<input type="range">` styled with Tailwind | Browser-native, keyboard accessible, mobile-friendly by default |
| Invite code generation | UUID | `crypto.randomBytes(4).toString('hex')` = 8-char hex | Short enough to type manually; unpredictable enough for a friend group |

---

## New DB Tables Required

Two tables must be added to `schema.ts` and migrated before Phase 2 implementation begins.

### invite_codes table

```typescript
// Addition to fuelsniffer/src/lib/db/schema.ts
export const inviteCodes = pgTable('invite_codes', {
  id:         serial('id').primaryKey(),
  code:       text('code').notNull().unique(),   // 8-char hex, e.g. "a3f82b9c"
  label:      text('label'),                      // "Alice's phone" — human memo
  isActive:   boolean('is_active').notNull().default(true),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})
```

### sessions table (for invite code → session linkage)

```typescript
export const sessions = pgTable('sessions', {
  id:         text('id').primaryKey(),   // random UUID, stored in JWT payload
  codeId:     integer('code_id').references(() => inviteCodes.id),
  expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Note: For Phase 2, a stateless JWT cookie (without a sessions table) is also viable and simpler. The sessions table enables server-side revocation (revoke a code → all sessions for that code are invalid on next request). Include it if revocation checking in `proxy.ts` is required. If revocation only takes effect at cookie expiry, the sessions table can be omitted and the invite_codes table alone is sufficient (check `is_active` on login only).

---

## Common Pitfalls

### Pitfall 1: Leaflet SSR Crash

**What goes wrong:** `ReferenceError: window is not defined` during `next build` or page render.
**Why it happens:** Leaflet's top-level imports access `window` immediately. Next.js pre-renders pages on the server where `window` does not exist.
**How to avoid:** Import `MapView` using `dynamic(() => import('@/components/MapView'), { ssr: false })`. Never import Leaflet directly in any Server Component.
**Warning signs:** Build succeeds but page crashes at runtime; or `window is not defined` in build output.

### Pitfall 2: proxy.ts Named Export vs Default Export

**What goes wrong:** Route protection silently doesn't work.
**Why it happens:** `proxy.ts` requires a default export (not a named export `proxy`). If you export `export function proxy()` without `export default`, Next.js ignores it.
**How to avoid:** Use `export default async function proxy(req: NextRequest)`.
**Warning signs:** Dashboard loads without logging in; no redirect to `/login`.

### Pitfall 3: cookies() is Async in Next.js 16

**What goes wrong:** TypeScript error or `undefined` returned from `cookies().get()`.
**Why it happens:** Next.js 16 made `cookies()` async — it now returns `Promise<ReadonlyRequestCookies>`. Code from tutorials or training data using the sync API will fail.
**How to avoid:** Always `const cookieStore = await cookies()` before calling `.get()` or `.set()`.
**Warning signs:** `Property 'get' does not exist on type 'Promise<...>'` TypeScript error.

### Pitfall 4: Leaflet Default Icon 404s

**What goes wrong:** Map renders but all markers show a broken image icon.
**Why it happens:** Leaflet's default icon URLs resolve to paths that Webpack/Next.js does not copy to the output. `leaflet/dist/images/` is not automatically included.
**How to avoid:** Copy `marker-icon.png`, `marker-icon-2x.png`, `marker-shadow.png` from `node_modules/leaflet/dist/images/` to `public/leaflet/`. Then call `L.Icon.Default.mergeOptions()` in `MapView.tsx` (see Pattern 4).
**Warning signs:** Network tab shows 404 for `/marker-icon.png`.

### Pitfall 5: DISTINCT ON with Drizzle ORM

**What goes wrong:** Drizzle's query builder does not natively support `DISTINCT ON (column)` (a PostgreSQL extension). Attempting to use `.distinct()` gives wrong results.
**Why it happens:** Drizzle's `.distinct()` maps to `SELECT DISTINCT`, not `SELECT DISTINCT ON (...)`.
**How to avoid:** Use `db.execute(sql\`...\`)` for the latest-price-per-station query (see Pattern 1). This is a known Drizzle limitation for PostgreSQL-specific syntax.
**Warning signs:** Query returns all historical rows, not just the latest per station.

### Pitfall 6: useSearchParams() Without Suspense Boundary

**What goes wrong:** `Error: useSearchParams() should be wrapped in a suspense boundary`.
**Why it happens:** Next.js App Router requires `useSearchParams()` in Client Components to be under a `<Suspense>` boundary when the page uses static generation.
**How to avoid:** Wrap `DashboardClient` in `<Suspense>` in the Server Component page (see Pattern 5).
**Warning signs:** Runtime error in production build; works fine in dev.

### Pitfall 7: Fuel Type ID Mapping

**What goes wrong:** The QLD API uses integer `FuelId` values (not the strings "ULP91", "ULP95" etc.). The mapping is:
```
ULP91 (Regular Unleaded) = fuelTypeId 2
ULP95 = fuelTypeId 5
ULP98 = fuelTypeId 6
Diesel = fuelTypeId 4
E10 = fuelTypeId 3
E85 = fuelTypeId 10 (may vary — confirm against live API)
```
**How to avoid:** Define a `FUEL_TYPES` constant mapping labels to IDs. Use the ID in the URL param and API query; display the label in the UI.
**Warning signs:** Filtering by "ULP91" returns no results because the API stored `fuelTypeId: 2` not `fuelTypeId: "ULP91"`.

---

## Code Examples

### GET /api/prices Route Handler

```typescript
// Source: existing health/route.ts pattern + Next.js 16 route.md
// File: fuelsniffer/src/app/api/prices/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getLatestPrices } from '@/lib/db/queries/prices'

const QuerySchema = z.object({
  fuel: z.coerce.number().int().min(1).max(20),
  radius: z.coerce.number().min(1).max(50).default(20),
})

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = QuerySchema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { fuel, radius } = parsed.data
  const prices = await getLatestPrices(fuel, radius)

  return NextResponse.json(prices)
}
```

### Colour Scale for Map Pins

```typescript
// Source: HSL colour space — standard approach, no library needed
// File: fuelsniffer/src/lib/priceColour.ts

/**
 * Returns an HSL colour string for a price within a min–max range.
 * min price → green (hsl 120), max price → red (hsl 0).
 */
export function priceToHsl(price: number, min: number, max: number): string {
  if (max === min) return 'hsl(60, 70%, 45%)' // single station: amber
  const ratio = (price - min) / (max - min)    // 0 = cheapest, 1 = dearest
  const hue = Math.round(120 * (1 - ratio))    // 120 = green, 0 = red
  return `hsl(${hue}, 80%, 40%)`
}
```

### Freshness Formatting

```typescript
// Source: date-fns formatDistanceToNow — already in project dependencies
import { formatDistanceToNow } from 'date-fns'

export function formatFreshness(recordedAt: Date | string): string {
  return formatDistanceToNow(new Date(recordedAt), { addSuffix: true })
  // → "3 minutes ago", "1 hour ago"
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` for route protection | `proxy.ts` | Next.js 16 (Oct 2025) | BREAKING: old filename silently ignored |
| `cookies()` sync API | `await cookies()` (async) | Next.js 15+ | Must `await` before `.get()` / `.set()` |
| react-leaflet 4.x (React 18) | react-leaflet 5.0 (React 19) | 2025 | No API change; peer dep update only |
| Custom Leaflet popup HTML | `react-leaflet` `<Popup>` component | Stable | JSX inside Popup is standard |

**Deprecated/outdated:**
- `middleware.ts`: Renamed to `proxy.ts` in Next.js 16. The old name is deprecated and produces a warning.
- `useFormStatus` from `react-dom`: Replaced by `useActionState` from `react` in React 19.

---

## Open Questions

1. **Fuel type ID values from the QLD API**
   - What we know: QLD API uses integer `FuelId` values; common ones are documented in community sources (ULP91 = 2, Diesel = 4)
   - What's unclear: The exact ID for E85 (may be 10 or different); whether IDs are stable or regional
   - Recommendation: Define the `FUEL_TYPES` map with known IDs; confirm E85 ID when Phase 1 live data is available; make the map easy to update

2. **Stateless vs DB sessions for invite code revocation**
   - What we know: Stateless JWT cookies are simpler (no sessions table); D-13 says codes can be revoked individually
   - What's unclear: Does revocation need to take effect immediately (kick out active sessions) or only at next login?
   - Recommendation: Use DB sessions table (Pattern 6 in schema section) — the extra table cost is small and enables immediate revocation in proxy.ts by checking `is_active` on the invite_codes row

3. **North Lakes coordinates as the distance reference point**
   - What we know: `NORTH_LAKES_LAT = -27.2353, NORTH_LAKES_LNG = 153.0189` is defined in normaliser.ts
   - What's unclear: Whether the user's actual GPS location should be an option (D-02 says "distance from their location")
   - Recommendation: Phase 2 uses North Lakes as the fixed reference (consistent with storage filter). The distance column in the price card is "distance from North Lakes". Browser geolocation can be added in a later phase. Document this assumption clearly in the UI ("distances from North Lakes").

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `fuelsniffer/vitest.config.ts` (exists) |
| Quick run command | `cd fuelsniffer && npx vitest run --reporter=verbose` |
| Full suite command | `cd fuelsniffer && npx vitest run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | `getLatestPrices()` returns stations sorted by `price_cents` ASC | unit | `npx vitest run src/__tests__/prices.test.ts -x` | ❌ Wave 0 |
| DASH-02 | `getLatestPrices()` excludes stations beyond `radiusKm` | unit | `npx vitest run src/__tests__/prices.test.ts -x` | ❌ Wave 0 |
| DASH-03 | `getLatestPrices()` filters by `fuelTypeId` | unit | `npx vitest run src/__tests__/prices.test.ts -x` | ❌ Wave 0 |
| DASH-04 | MapView renders without `window is not defined` error | manual | Verify in browser dev tools (no SSR) | — |
| DASH-05 | Dashboard layout passes mobile viewport check | manual | Chrome DevTools responsive mode | — |
| ACCS-01 | `encrypt/decrypt` session roundtrip returns original payload | unit | `npx vitest run src/__tests__/session.test.ts -x` | ❌ Wave 0 |
| ACCS-01 | `/api/prices` returns 401 when no session cookie present | unit | `npx vitest run src/__tests__/prices-api.test.ts -x` | ❌ Wave 0 |
| ACCS-01 | `isStale()` returns true for timestamps >60 min old | unit | `npx vitest run src/__tests__/stale.test.ts -x` | ❌ Wave 0 |

Note: Vitest environment is `node` (from vitest.config.ts). Tests that use React components require `environment: 'jsdom'` or a separate config. For Phase 2, keep unit tests on pure logic functions (queries, session, colour scale, freshness). Component testing is manual.

### Sampling Rate

- **Per task commit:** `cd fuelsniffer && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd fuelsniffer && npx vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `fuelsniffer/src/__tests__/prices.test.ts` — covers DASH-01, DASH-02, DASH-03 (mock `db.execute`, test query parameter pass-through and sorting)
- [ ] `fuelsniffer/src/__tests__/session.test.ts` — covers ACCS-01 session encrypt/decrypt roundtrip
- [ ] `fuelsniffer/src/__tests__/priceColour.test.ts` — covers `priceToHsl()` edge cases (min=max, extremes)
- [ ] `fuelsniffer/src/__tests__/stale.test.ts` — covers `isStale()` boundary conditions

---

## Sources

### Primary (HIGH confidence)

- `fuelsniffer/node_modules/next/dist/docs/01-app/02-guides/authentication.md` — session management, jose usage, cookies() async API, proxy pattern
- `fuelsniffer/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — proxy.ts file convention, BREAKING CHANGE from middleware.ts
- `fuelsniffer/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Route Handler HTTP methods, NextRequest usage
- `fuelsniffer/src/lib/db/schema.ts` — Existing Drizzle schema (stations, priceReadings types)
- `fuelsniffer/src/app/api/health/route.ts` — Established Route Handler pattern to follow
- `npm view jose version` → 6.2.2 (verified live)
- `npm view leaflet version` → 1.9.4 (verified live)
- `npm view react-leaflet version` → 5.0.0 (verified live)
- `npm view @types/leaflet version` → 1.9.21 (verified live)

### Secondary (MEDIUM confidence)

- react-leaflet community: `dynamic(() => import('./MapView'), { ssr: false })` pattern for Next.js — widely documented, consistent across multiple sources
- Leaflet default icon 404 fix (`L.Icon.Default.mergeOptions`) — documented in react-leaflet GitHub issues and multiple Next.js + Leaflet guides
- `DISTINCT ON` workaround with `db.execute(sql\`...\`)` in Drizzle — documented in Drizzle GitHub issues (no native DISTINCT ON support confirmed)

### Tertiary (LOW confidence)

- QLD API fuel type IDs (ULP91=2, Diesel=4, etc.) — sourced from Home Assistant community integration; need confirmation against live API in Phase 1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against live npm registry
- Architecture: HIGH — patterns drawn from bundled Next.js 16 docs (not training data)
- Leaflet SSR pattern: MEDIUM — consistent community consensus but not in official docs
- Pitfalls: HIGH — Next.js 16 breaking changes (proxy.ts, async cookies) verified in bundled docs
- Fuel type IDs: LOW — community-sourced, needs Phase 1 live API confirmation

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (Next.js patch releases unlikely to change auth patterns; verify if upgrading beyond 16.2.x)
