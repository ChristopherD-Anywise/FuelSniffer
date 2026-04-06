# Suburb / Postcode Search Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing a postcode (e.g. `4504`) predicts suburb names (e.g. "Narangba"), selecting a result centres the map on that suburb and shows stations within the current slider radius from that centre point.

**Architecture:** Selection sets `userLocation` to the suburb's avg lat/lng — the existing radius query machinery handles everything else unchanged. The `activeSuburb`/`activePostcode` bypass in the prices query is removed entirely. The search API is improved to deduplicate properly and return suburb names even when typed input is a postcode.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL (Drizzle raw SQL), React, Leaflet, Vitest

---

## File Map

| File | Change |
|------|--------|
| `fuelsniffer/src/app/api/search/route.ts` | Fix query: join postcode→suburb lookup, deduplicate correctly, postcode prefix match |
| `fuelsniffer/src/app/api/prices/route.ts` | Remove `suburb` and `postcode` params — no longer needed |
| `fuelsniffer/src/lib/db/queries/prices.ts` | Remove suburb/postcode bypass branch — always use radius from centre |
| `fuelsniffer/src/components/LocationSearch.tsx` | Show postcode badge; Enter selects first result (already partially done — clean up) |
| `fuelsniffer/src/app/dashboard/DashboardClient.tsx` | On suburb select: set `userLocation` to centre; remove `activeSuburb`/`activePostcode` state |
| `fuelsniffer/src/__tests__/normaliser.test.ts` | Add tests for `extractSuburb` |
| `fuelsniffer/src/__tests__/prices-api.test.ts` | Update to remove suburb/postcode param tests |

---

## Task 1: Test and fix `extractSuburb` in the normaliser

The Direct API has no suburb field. We extract it from the address string. Tests verify the parsing logic works for real QLD address formats.

**Files:**
- Modify: `fuelsniffer/src/lib/scraper/normaliser.ts`
- Modify: `fuelsniffer/src/__tests__/normaliser.test.ts`

- [ ] **Step 1: Add failing tests for `extractSuburb`**

Open `fuelsniffer/src/__tests__/normaliser.test.ts` and add this block after the existing `normaliseStation` tests:

```typescript
describe('extractSuburb — parse suburb from QLD API address string', () => {
  it('extracts suburb from "123 Main St, NORTH LAKES, QLD 4509"', () => {
    expect(extractSuburb('123 Main St, NORTH LAKES, QLD 4509')).toBe('NORTH LAKES')
  })

  it('extracts suburb from "45 Anzac Ave, REDCLIFFE QLD 4020"', () => {
    expect(extractSuburb('45 Anzac Ave, REDCLIFFE QLD 4020')).toBe('REDCLIFFE')
  })

  it('extracts suburb from "Shop 1, NARANGBA, QLD 4504"', () => {
    expect(extractSuburb('Shop 1, NARANGBA, QLD 4504')).toBe('NARANGBA')
  })

  it('returns null for null input', () => {
    expect(extractSuburb(null)).toBeNull()
  })

  it('returns null for an address with no recognisable suburb pattern', () => {
    expect(extractSuburb('No suburb here')).toBeNull()
  })
})
```

Also add `extractSuburb` to the import line at the top of the file:
```typescript
import { rawToPrice, isWithinRadius, toBrisbaneHour, normalisePrice, normaliseStation, extractSuburb } from '@/lib/scraper/normaliser'
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd fuelsniffer && npx vitest run src/__tests__/normaliser.test.ts 2>&1 | tail -20
```

Expected: FAIL — `extractSuburb is not exported` or similar.

- [ ] **Step 3: Implement `extractSuburb` and export it**

In `fuelsniffer/src/lib/scraper/normaliser.ts`, replace the existing `extractSuburb` function (if present) with this exact implementation, and ensure it is exported:

```typescript
/**
 * Extract suburb from a QLD API address string.
 * The Direct API has no suburb field, but addresses follow:
 *   "123 Main St, SUBURB, QLD POSTCODE"  → matches group 1 after comma before "QLD"
 *   "123 Main St, SUBURB QLD POSTCODE"   → matches group 1 before "QLD"
 * Returns null if no recognisable pattern found.
 */
export function extractSuburb(address: string | null): string | null {
  if (!address) return null
  // Match ", SUBURB, QLD" or ", SUBURB QLD"
  const m = address.match(/,\s*([^,]+?)\s*,?\s*QLD\b/i)
  if (m) return m[1].trim()
  return null
}
```

Also update `normaliseStation` to call it:

```typescript
export function normaliseStation(site: SiteDetails): NewStation {
  return {
    id:         site.SiteId,
    name:       site.Name,
    brand:      site.Brand ?? null,
    address:    site.Address ?? null,
    suburb:     extractSuburb(site.Address ?? null),
    postcode:   site.Postcode ?? null,
    latitude:   site.Lat,
    longitude:  site.Lng,
    isActive:   true,
    lastSeenAt: new Date(),
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd fuelsniffer && npx vitest run src/__tests__/normaliser.test.ts 2>&1 | tail -20
```

Expected: All normaliser tests PASS.

- [ ] **Step 5: Commit**

```bash
cd fuelsniffer && git add src/lib/scraper/normaliser.ts src/__tests__/normaliser.test.ts
git commit -m "fix: export extractSuburb and add unit tests for address parsing"
```

---

## Task 2: Fix the search API to resolve postcodes to suburb names

The current query groups by `(suburb, postcode)` but if suburb is null for all stations in a postcode, shows "Postcode 4504" with no suburb name. We need to return the suburb name when it exists in any station for that postcode.

**Files:**
- Modify: `fuelsniffer/src/app/api/search/route.ts`

- [ ] **Step 1: Replace the SQL query in the search route**

Open `fuelsniffer/src/app/api/search/route.ts`. Replace the entire `db.execute(sql`...`)` block and the `results` mapping below it with:

```typescript
  const rows = await db.execute(sql`
    SELECT
      postcode,
      -- Take the most common non-null suburb for this postcode
      (
        SELECT suburb
        FROM stations s2
        WHERE s2.postcode = s.postcode
          AND s2.suburb IS NOT NULL
          AND s2.is_active = true
        GROUP BY suburb
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS suburb,
      AVG(latitude)::numeric(10,6)  AS lat,
      AVG(longitude)::numeric(10,6) AS lng,
      COUNT(*)::int                 AS station_count
    FROM stations s
    WHERE is_active = true
      AND (
        suburb ILIKE ${'%' + q + '%'}
        OR postcode LIKE ${q + '%'}
      )
    GROUP BY postcode
    ORDER BY station_count DESC
    LIMIT 8
  `)

  const results: SearchResult[] = (rows as unknown as Array<Record<string, unknown>>).map(row => ({
    type: 'area' as const,
    suburb: row.suburb ? String(row.suburb) : undefined,
    postcode: row.postcode ? String(row.postcode) : undefined,
    label: row.suburb
      ? `${row.suburb}${row.postcode ? ` (${row.postcode})` : ''}`
      : `Postcode ${row.postcode}`,
    lat: Number(row.lat),
    lng: Number(row.lng),
    stationCount: Number(row.station_count),
  }))
```

Also remove `name ILIKE` from the WHERE clause — name search is not part of this feature and causes confusing grouping.

- [ ] **Step 2: Verify the route file still type-checks**

```bash
cd fuelsniffer && npx tsc --noEmit 2>&1 | grep "search/route"
```

Expected: no output (no errors for that file).

- [ ] **Step 3: Commit**

```bash
cd fuelsniffer && git add src/app/api/search/route.ts
git commit -m "fix: search resolves postcode to suburb name, groups by postcode"
```

---

## Task 3: Remove the suburb/postcode bypass from the prices query

The previous implementation had a bypass branch that fetched all stations matching a suburb/postcode with no radius limit. This is replaced by the simpler model: selection sets a centre point and the existing radius query handles the rest.

**Files:**
- Modify: `fuelsniffer/src/lib/db/queries/prices.ts`
- Modify: `fuelsniffer/src/app/api/prices/route.ts`

- [ ] **Step 1: Simplify `getLatestPrices` — remove the `suburb`/`postcode` params and bypass branch**

Replace the entire file `fuelsniffer/src/lib/db/queries/prices.ts` with:

```typescript
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

// Default: North Lakes
const DEFAULT_LAT = -27.2353
const DEFAULT_LNG = 153.0189

export interface PriceResult {
  id: number
  name: string
  brand: string | null
  address: string | null
  suburb: string | null
  latitude: number
  longitude: number
  price_cents: string
  recorded_at: Date
  source_ts: Date
  distance_km: number
  price_change: number | null
}

export async function getLatestPrices(
  fuelTypeId: number,
  radiusKm: number,
  userLocation?: { lat: number; lng: number },
  changeHours: number = 168
): Promise<PriceResult[]> {
  const lat = userLocation?.lat ?? DEFAULT_LAT
  const lng = userLocation?.lng ?? DEFAULT_LNG

  const rows = await db.execute(sql`
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
          POWER(SIN((RADIANS(s.latitude) - RADIANS(${lat})) / 2), 2) +
          COS(RADIANS(${lat})) * COS(RADIANS(s.latitude)) *
          POWER(SIN((RADIANS(s.longitude) - RADIANS(${lng})) / 2), 2)
        ))
      ) AS distance_km,
      (l.price_cents::numeric - prev.price_cents::numeric) AS price_change
    FROM latest l
    JOIN stations s ON s.id = l.station_id
    LEFT JOIN LATERAL (
      SELECT price_cents
      FROM price_readings pr
      WHERE pr.station_id = l.station_id
        AND pr.fuel_type_id = ${fuelTypeId}
        AND pr.recorded_at < NOW() - (${changeHours} || ' hours')::interval
      ORDER BY pr.recorded_at DESC
      LIMIT 1
    ) prev ON true
    WHERE s.is_active = true
      AND (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(s.latitude) - RADIANS(${lat})) / 2), 2) +
          COS(RADIANS(${lat})) * COS(RADIANS(s.latitude)) *
          POWER(SIN((RADIANS(s.longitude) - RADIANS(${lng})) / 2), 2)
        ))
      ) <= ${radiusKm}
    ORDER BY l.price_cents ASC
  `)
  return rows as unknown as PriceResult[]
}
```

- [ ] **Step 2: Simplify the prices API route — remove `suburb` and `postcode` params**

Replace `fuelsniffer/src/app/api/prices/route.ts` with:

```typescript
import { NextResponse } from 'next/server'
import { getLatestPrices } from '@/lib/db/queries/prices'
import { z } from 'zod'

const PricesQuerySchema = z.object({
  fuel: z
    .string()
    .regex(/^\d+$/, 'fuel must be a positive integer')
    .transform(Number),
  radius: z
    .string()
    .optional()
    .default('20')
    .pipe(
      z.string()
       .regex(/^\d+$/)
       .transform(Number)
       .pipe(z.number().min(1).max(500))
    ),
  lat: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  lng: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  changeHours: z
    .string()
    .optional()
    .default('24')
    .pipe(
      z.string()
       .regex(/^\d+$/)
       .transform(Number)
       .pipe(z.number().min(1).max(168))
    ),
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  if (!searchParams.has('fuel')) {
    return NextResponse.json({ error: 'fuel is required' }, { status: 400 })
  }

  const parsed = PricesQuerySchema.safeParse({
    fuel: searchParams.get('fuel'),
    radius: searchParams.get('radius') ?? undefined,
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
    changeHours: searchParams.get('changeHours') ?? undefined,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return NextResponse.json({ error: firstIssue.message }, { status: 400 })
  }

  const userLocation = parsed.data.lat && parsed.data.lng
    ? { lat: parsed.data.lat, lng: parsed.data.lng }
    : undefined

  const stations = await getLatestPrices(
    parsed.data.fuel,
    parsed.data.radius,
    userLocation,
    parsed.data.changeHours
  )

  return NextResponse.json(stations, { status: 200 })
}
```

- [ ] **Step 3: Run existing prices API tests**

```bash
cd fuelsniffer && npx vitest run src/__tests__/prices-api.test.ts 2>&1 | tail -20
```

Expected: All PASS. If any test references `suburb` or `postcode` params, delete those test cases.

- [ ] **Step 4: Type-check**

```bash
cd fuelsniffer && npx tsc --noEmit 2>&1 | grep -E "prices"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd fuelsniffer && git add src/lib/db/queries/prices.ts src/app/api/prices/route.ts src/__tests__/prices-api.test.ts
git commit -m "refactor: remove suburb/postcode bypass from prices query — radius from centre always"
```

---

## Task 4: Update DashboardClient — suburb selection sets centre, not bypass

Remove `activeSuburb` / `activePostcode` state. On suburb select, set `userLocation` to the suburb centre coords. The existing radius fetch runs from there automatically.

**Files:**
- Modify: `fuelsniffer/src/app/dashboard/DashboardClient.tsx`

- [ ] **Step 1: Remove the suburb/postcode state and update `fetchPrices`**

In `fuelsniffer/src/app/dashboard/DashboardClient.tsx`:

**Remove** these two state declarations (around line 69–71):
```typescript
const [activeSuburb,   setActiveSuburb]   = useState<string | null>(null)
const [activePostcode, setActivePostcode] = useState<string | null>(null)
```

**Replace** the `fetchPrices` callback with this simplified version:
```typescript
  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      let url = `/api/prices?fuel=${activeFuel}&radius=${radiusParam}`
      if (userLocation) url += `&lat=${userLocation.lat}&lng=${userLocation.lng}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('API error')
      const data: PriceResult[] = await res.json()
      setStations(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeFuel, radiusParam, userLocation])
```

- [ ] **Step 2: Update `handleLocationSelect` — set userLocation to suburb centre**

Replace the existing `handleLocationSelect` function with:

```typescript
  function handleLocationSelect(location: { lat: number; lng: number; label: string; suburb?: string; postcode?: string }) {
    setUserLocation({ lat: location.lat, lng: location.lng })
    setLocationStatus('active')
    setFitBounds(true)
  }
```

- [ ] **Step 3: Update the "locate me" clear handler — remove setActiveSuburb/setActivePostcode**

Note: `fitBounds` and `onFitBoundsDone` state/props are kept as-is — they are wired between DashboardClient and MapView and will continue to work (fitBounds is set to true in handleLocationSelect above, causing the map to fit to returned stations after the fetch).

Find the block that handles clearing location (inside `handleLocateMe`). Remove any `setActiveSuburb(null)` and `setActivePostcode(null)` calls. It should just be:

```typescript
    if (locationStatus === 'active') {
      setUserLocation(null)
      setLocationStatus('idle')
      return
    }
```

And the geolocation success callback:
```typescript
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationStatus('active')
      },
```

- [ ] **Step 4: Type-check the dashboard**

```bash
cd fuelsniffer && npx tsc --noEmit 2>&1 | grep -E "DashboardClient"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd fuelsniffer && git add src/app/dashboard/DashboardClient.tsx
git commit -m "fix: suburb selection sets centre point — radius query handles the rest"
```

---

## Task 5: Update LocationSearch — postcode badge, clean up types

The `LocationSearch` component still passes `suburb` and `postcode` in `onSelect`. We simplify: `onSelect` just passes `lat`, `lng`, `label`, `suburb`, `postcode` (kept for display only — `DashboardClient` ignores them now except for label display). The postcode badge in the dropdown makes it clear to the user what was matched.

**Files:**
- Modify: `fuelsniffer/src/components/LocationSearch.tsx`

- [ ] **Step 1: Ensure the `onSelect` signature is correct**

The interface at the top of `fuelsniffer/src/components/LocationSearch.tsx` should be:

```typescript
interface LocationSearchProps {
  onSelect: (location: { lat: number; lng: number; label: string; suburb?: string; postcode?: string }) => void
}
```

This is already correct — no change needed here unless it differs.

- [ ] **Step 2: Verify the dropdown shows postcode badge for area results**

Locate the area button render in the dropdown. Confirm it shows the postcode badge. It should look like this — update if it doesn't match:

```tsx
{areas.map((area, i) => (
  <button
    key={`area-${i}`}
    onClick={() => handleSelect(area)}
    onMouseEnter={() => setHoveredArea(i)}
    onMouseLeave={() => setHoveredArea(null)}
    style={{
      width: '100%',
      textAlign: 'left',
      paddingLeft: '12px',
      paddingRight: '12px',
      paddingTop: '8px',
      paddingBottom: '8px',
      background: highlightedIndex === i || hoveredArea === i ? '#2a2a2a' : 'transparent',
      cursor: 'pointer',
      border: 'none',
      transition: 'background-color 150ms',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
        {area.suburb ?? area.label}
      </span>
      {area.stationCount != null && (
        <span style={{ fontSize: '11px', color: '#555555' }}>
          {area.stationCount} station{area.stationCount !== 1 ? 's' : ''}
        </span>
      )}
    </span>
    {area.postcode && (
      <span style={{
        fontSize: '11px',
        fontWeight: 700,
        background: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: '4px',
        padding: '2px 6px',
        color: '#888',
        flexShrink: 0,
        marginLeft: '8px',
      }}>
        {area.postcode}
      </span>
    )}
  </button>
))}
```

- [ ] **Step 3: Confirm Enter key selects first result**

The `handleKeyDown` already handles Enter. Verify:

```typescript
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0
      if (allResults[idx]) handleSelect(allResults[idx])
    }
```

If missing or different, add/fix it.

- [ ] **Step 4: Type-check**

```bash
cd fuelsniffer && npx tsc --noEmit 2>&1 | grep -E "LocationSearch"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd fuelsniffer && git add src/components/LocationSearch.tsx
git commit -m "fix: LocationSearch postcode badge, Enter selects first result"
```

---

## Task 6: Full test run and push

- [ ] **Step 1: Run the full test suite**

```bash
cd fuelsniffer && npx vitest run 2>&1 | tail -30
```

Expected: All tests PASS. If any test fails referencing `activeSuburb`, `activePostcode`, `suburb` API param, or `postcode` API param — update those tests to match the new simplified API.

- [ ] **Step 2: Fix any broken tests**

If `prices-api.test.ts` has test cases that pass `suburb` or `postcode` to the prices API, delete those cases — they test behaviour that no longer exists.

If `dashboard.test.ts` references `activeSuburb` or `activePostcode`, remove those references.

Re-run:
```bash
cd fuelsniffer && npx vitest run 2>&1 | tail -20
```

Expected: All PASS.

- [ ] **Step 3: Push**

```bash
cd fuelsniffer && git push
```

---

## Acceptance Criteria

1. Typing `4504` in the search box shows "Narangba (4504)" (or suburb name + postcode badge) in the dropdown
2. Typing "narangba" shows matching results
3. Pressing Enter or clicking a result centres the map on that suburb and loads stations within the current slider radius from that centre
4. The slider still works after selecting a suburb — dragging it refetches from the same centre
5. The "locate me" button still works independently
6. All Vitest tests pass
