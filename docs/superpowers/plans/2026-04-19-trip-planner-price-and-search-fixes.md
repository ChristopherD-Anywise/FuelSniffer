# Trip Planner + Price Indicator + Suburb Search Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three related fixes in one branch — (1) Mapbox-geocoded address search in the trip planner with server-side token gating, (2) correct "¢ / 7d" station-card indicator matching the popup's semantics, (3) populated `stations.suburb` so suburb search actually works.

**Architecture:** Three commits, built in order: suburb fix (lowest risk, unblocks search), price indicator fix (one SQL change), trip planner (new endpoint + component + gating). All work on the existing Next.js 16 / Postgres / Vitest stack. No migrations — only a backfill script and a query rewrite.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Postgres 17 (with `hourly_prices` continuous aggregate), Drizzle ORM, Zod, Vitest, msw (already wired for Mapbox tests).

**Spec:** [`docs/superpowers/specs/2026-04-19-trip-planner-price-and-search-fixes-design.md`](../specs/2026-04-19-trip-planner-price-and-search-fixes-design.md)

---

## Conventions for every task

- Every code file lives under `fuelsniffer/` — paths in this plan are absolute from repo root.
- Run tests from `fuelsniffer/`: `cd fuelsniffer && npx vitest run <path>`
- DB access in queries uses `db.execute(sql\`...\`)` and casts raw results via `unknown` first (see [CLAUDE.md](fuelsniffer/CLAUDE.md)).
- Commit after each green test step. Use Conventional Commits.
- TDD order: write failing test → verify fail → implement → verify pass → commit.

---

# Part 1 — Suburb Search Fix

The `stations.suburb` column is NULL for 1,780 of 1,807 active stations because `extractSuburb()` in [normaliser.ts:62](fuelsniffer/src/lib/scraper/normaliser.ts) expects `"..., SUBURB, QLD POSTCODE"` but the QLD API returns bare street addresses. We fix this by adding a postcode→suburb lookup table, using it as a fallback in `extractSuburb`, and backfilling existing rows.

## Task 1: Add static QLD postcode→suburb lookup

**Files:**
- Create: `fuelsniffer/src/lib/data/qld-postcodes.json`
- Create: `fuelsniffer/src/lib/data/qld-postcodes.ts`
- Test: `fuelsniffer/src/__tests__/qld-postcodes.test.ts`

Australia Post publishes free postcode data. For this one-off, generate a minimal QLD subset from a public-domain CSV such as `https://www.matthewproctor.com/Content/postcodes/australian_postcodes.csv` (single author, CC0-like). One row per postcode, picking the primary `locality`. The JSON is committed to the repo.

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/qld-postcodes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { postcodeToSuburb } from '@/lib/data/qld-postcodes'

describe('postcodeToSuburb', () => {
  it('returns a suburb name for a known QLD postcode', () => {
    expect(postcodeToSuburb('4000')).toBe('Brisbane City')
  })

  it('returns null for an unknown postcode', () => {
    expect(postcodeToSuburb('9999')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(postcodeToSuburb(null)).toBeNull()
  })

  it('covers at least 500 QLD postcodes', () => {
    // sanity check — QLD has ~1100 postcodes; coverage of the most active ones
    // is sufficient for station resolution
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('@/lib/data/qld-postcodes.json') as Record<string, string>
    expect(Object.keys(data).length).toBeGreaterThanOrEqual(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/qld-postcodes.test.ts
```
Expected: FAIL — cannot find module `@/lib/data/qld-postcodes`.

- [ ] **Step 3: Generate the JSON lookup**

Run this one-off generator to produce the committed JSON. The generator lives as a comment block here — do not keep it in the repo after use:

```bash
cd fuelsniffer
# Download the public postcode CSV (CC0 / public domain attribution: matthewproctor.com)
curl -sL 'https://www.matthewproctor.com/Content/postcodes/australian_postcodes.csv' -o /tmp/aupost.csv

# Extract QLD rows, keep one suburb per postcode (the first, which is typically the primary)
node -e "
const fs = require('fs');
const lines = fs.readFileSync('/tmp/aupost.csv', 'utf8').split(/\r?\n/).slice(1);
const map = {};
for (const line of lines) {
  if (!line.trim()) continue;
  const parts = line.split(',');
  // CSV columns: id,postcode,locality,state,long,lat,...
  const postcode = parts[1]?.replace(/\"/g, '').trim();
  const locality = parts[2]?.replace(/\"/g, '').trim();
  const state = parts[3]?.replace(/\"/g, '').trim();
  if (state !== 'QLD') continue;
  if (!postcode || !locality) continue;
  if (map[postcode]) continue; // first suburb wins
  // Title case the locality
  const titled = locality.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  map[postcode] = titled;
}
fs.writeFileSync('src/lib/data/qld-postcodes.json', JSON.stringify(map, null, 2) + '\n');
console.log('Wrote', Object.keys(map).length, 'postcodes');
"
```

Expected output: `Wrote 1100+ postcodes` (approx).

- [ ] **Step 4: Write the TypeScript wrapper**

Create `fuelsniffer/src/lib/data/qld-postcodes.ts`:

```typescript
import data from './qld-postcodes.json'

const lookup = data as Record<string, string>

/**
 * Return the primary suburb name for a QLD postcode, or null if unknown.
 * Data sourced from Australia Post's public postcode dataset (QLD subset).
 */
export function postcodeToSuburb(postcode: string | null): string | null {
  if (!postcode) return null
  return lookup[postcode] ?? null
}
```

- [ ] **Step 5: Enable JSON module imports in tsconfig**

Check `fuelsniffer/tsconfig.json` has `"resolveJsonModule": true` under `compilerOptions`. It is a Next.js default — add only if missing.

- [ ] **Step 6: Run test to verify it passes**

```bash
cd fuelsniffer && npx vitest run src/__tests__/qld-postcodes.test.ts
```
Expected: PASS — 4/4 tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/lib/data/qld-postcodes.json fuelsniffer/src/lib/data/qld-postcodes.ts fuelsniffer/src/__tests__/qld-postcodes.test.ts
git commit -m "feat(data): static QLD postcode to suburb lookup"
```

## Task 2: Use the lookup in `extractSuburb`

**Files:**
- Modify: `fuelsniffer/src/lib/scraper/normaliser.ts:62-71` (`extractSuburb`)
- Modify: `fuelsniffer/src/lib/scraper/normaliser.ts:77-92` (`normaliseStation`)
- Test: `fuelsniffer/src/__tests__/normaliser.test.ts` (existing file — add cases)

- [ ] **Step 1: Write the failing tests**

Find the existing `normaliser.test.ts`. If it doesn't exist, create it. Add these test cases:

```typescript
// In fuelsniffer/src/__tests__/normaliser.test.ts
import { describe, it, expect } from 'vitest'
import { extractSuburb, normaliseStation } from '@/lib/scraper/normaliser'

describe('extractSuburb', () => {
  it('extracts suburb from enriched address (regex path)', () => {
    expect(extractSuburb('123 Main St, NORTH LAKES QLD 4509', '4509'))
      .toBe('NORTH LAKES')
  })

  it('falls back to postcode lookup when address is bare street', () => {
    expect(extractSuburb('1256 Anzac Avenue', '4503')).toBe('Rothwell')
  })

  it('returns null when address is bare and postcode is unknown', () => {
    expect(extractSuburb('bare street', '9999')).toBeNull()
  })

  it('returns null when both address and postcode are null', () => {
    expect(extractSuburb(null, null)).toBeNull()
  })

  it('falls back to postcode lookup when address is null but postcode is known', () => {
    expect(extractSuburb(null, '4000')).toBe('Brisbane City')
  })
})

describe('normaliseStation.suburb', () => {
  it('populates suburb from postcode when address lacks suburb info', () => {
    const site = {
      SiteId: 1,
      Name: 'Test',
      Brand: null,
      Address: '1256 Anzac Avenue',
      Postcode: '4503',
      Lat: -27.2,
      Lng: 153.0,
    }
    const result = normaliseStation(site)
    expect(result.suburb).toBe('Rothwell')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd fuelsniffer && npx vitest run src/__tests__/normaliser.test.ts
```
Expected: FAIL — bare-street cases return `null` because current `extractSuburb` takes one arg.

- [ ] **Step 3: Update `extractSuburb` signature and fallback**

Replace [normaliser.ts:62-71](fuelsniffer/src/lib/scraper/normaliser.ts) with:

```typescript
import { postcodeToSuburb } from '@/lib/data/qld-postcodes'

/**
 * Extract suburb from a QLD API address string, falling back to a
 * static postcode→suburb lookup when the address has no suburb info.
 *
 * The Direct API typically returns bare street addresses (e.g. "1256 Anzac Avenue"),
 * so the postcode fallback populates suburb for ~99% of stations.
 */
export function extractSuburb(
  address: string | null,
  postcode: string | null
): string | null {
  if (address) {
    // Match "... SUBURB QLD POSTCODE" or "... SUBURB, QLD POSTCODE"
    const m = address.match(/,\s*([^,]+?)\s*,?\s*QLD\b/i)
    if (m) return m[1].trim()
    // Secondary: second-to-last comma segment of enriched address
    const parts = address.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 2]
      if (candidate) return candidate
    }
  }
  return postcodeToSuburb(postcode)
}
```

- [ ] **Step 4: Update `normaliseStation` to pass postcode**

Replace [normaliser.ts:83](fuelsniffer/src/lib/scraper/normaliser.ts) (the `suburb:` line inside `normaliseStation`) from:

```typescript
    suburb:         extractSuburb(site.Address ?? null),
```

to:

```typescript
    suburb:         extractSuburb(site.Address ?? null, site.Postcode ?? null),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd fuelsniffer && npx vitest run src/__tests__/normaliser.test.ts
```
Expected: PASS — all new cases green; existing cases still pass.

- [ ] **Step 6: Run the wider test suite to catch fallout**

```bash
cd fuelsniffer && npx vitest run
```
Expected: PASS — no other suite should break; if one does, it's almost certainly a call site of `extractSuburb` that needs the new second arg. Update any such call site and commit the fix with this task.

- [ ] **Step 7: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/lib/scraper/normaliser.ts fuelsniffer/src/__tests__/normaliser.test.ts
git commit -m "feat(scraper): fallback to postcode lookup for suburb extraction"
```

## Task 3: Backfill existing stations

**Files:**
- Create: `fuelsniffer/src/lib/db/scripts/backfill-suburbs.ts`
- Test: `fuelsniffer/src/__tests__/backfill-suburbs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// fuelsniffer/src/__tests__/backfill-suburbs.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { backfillSuburbs } from '@/lib/db/scripts/backfill-suburbs'

describe('backfillSuburbs', () => {
  beforeEach(async () => {
    // Create isolated test rows. Use a high station id range to avoid
    // colliding with real/seed data.
    await db.execute(sql`DELETE FROM stations WHERE id >= 9000000`)
    await db.execute(sql`
      INSERT INTO stations (id, name, address, suburb, postcode, latitude, longitude, is_active, last_seen_at, external_id, source_provider)
      VALUES
        (9000001, 'A', '1 Test St', NULL, '4000', -27.0, 153.0, true, NOW(), '9000001', 'qld'),
        (9000002, 'B', '2 Test St', NULL, '9999', -27.0, 153.0, true, NOW(), '9000002', 'qld'),
        (9000003, 'C', '3 Test St', 'Already Set', '4000', -27.0, 153.0, true, NOW(), '9000003', 'qld')
    `)
  })

  it('fills NULL suburb where postcode resolves, skips unknown and existing', async () => {
    const result = await backfillSuburbs()

    expect(result.updated).toBeGreaterThanOrEqual(1)

    const rows = await db.execute(sql`
      SELECT id, suburb FROM stations WHERE id BETWEEN 9000001 AND 9000003 ORDER BY id
    `) as unknown as Array<{ id: number; suburb: string | null }>

    expect(rows[0].suburb).toBe('Brisbane City')   // 4000 resolved
    expect(rows[1].suburb).toBeNull()               // 9999 unknown
    expect(rows[2].suburb).toBe('Already Set')      // not overwritten
  })

  it('is idempotent', async () => {
    await backfillSuburbs()
    const second = await backfillSuburbs()
    expect(second.updated).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/backfill-suburbs.test.ts
```
Expected: FAIL — module `@/lib/db/scripts/backfill-suburbs` not found.

- [ ] **Step 3: Implement the script**

Create `fuelsniffer/src/lib/db/scripts/backfill-suburbs.ts`:

```typescript
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import postcodeData from '@/lib/data/qld-postcodes.json'

const lookup = postcodeData as Record<string, string>

export interface BackfillResult {
  updated: number
  unresolvedPostcodes: string[]
}

/**
 * One-off backfill: for every station with NULL suburb but a known postcode,
 * set suburb from the static postcode→suburb lookup.
 *
 * Idempotent — safe to re-run.
 */
export async function backfillSuburbs(): Promise<BackfillResult> {
  const rows = await db.execute(sql`
    SELECT id, postcode FROM stations
    WHERE suburb IS NULL AND postcode IS NOT NULL
  `) as unknown as Array<{ id: number; postcode: string }>

  let updated = 0
  const unresolved = new Set<string>()

  for (const row of rows) {
    const suburb = lookup[row.postcode]
    if (!suburb) {
      unresolved.add(row.postcode)
      continue
    }
    await db.execute(sql`
      UPDATE stations SET suburb = ${suburb} WHERE id = ${row.id}
    `)
    updated++
  }

  return { updated, unresolvedPostcodes: [...unresolved].sort() }
}

// Run from CLI: `npx tsx src/lib/db/scripts/backfill-suburbs.ts`
if (require.main === module) {
  backfillSuburbs()
    .then(result => {
      console.log(`Updated ${result.updated} stations`)
      if (result.unresolvedPostcodes.length > 0) {
        console.warn(
          `Unresolved postcodes (${result.unresolvedPostcodes.length}): ${result.unresolvedPostcodes.join(', ')}`
        )
      }
      process.exit(0)
    })
    .catch(err => {
      console.error('Backfill failed:', err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd fuelsniffer && npx vitest run src/__tests__/backfill-suburbs.test.ts
```
Expected: PASS — 2/2.

- [ ] **Step 5: Run the backfill against the local dev DB**

```bash
cd fuelsniffer
docker compose exec -T app npx tsx src/lib/db/scripts/backfill-suburbs.ts
```

Expected output: `Updated 1780 stations` (approx). May also log a handful of unresolved postcodes — those are usually invalid/typo entries and can be logged as a follow-up.

- [ ] **Step 6: Verify suburb search now works**

```bash
curl -s "http://localhost:3000/api/search?q=brisbane" | head -5
curl -s "http://localhost:3000/api/search?q=north%20lakes" | head -5
```
Expected: non-empty results with `"label": "Brisbane City (4000)"` style output.

- [ ] **Step 7: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/lib/db/scripts/backfill-suburbs.ts fuelsniffer/src/__tests__/backfill-suburbs.test.ts
git commit -m "feat(db): backfill suburb from postcode lookup"
```

---

# Part 2 — Price Indicator Fix

[StationCard.tsx:116](fuelsniffer/src/components/StationCard.tsx) renders `X.X¢ / 7d` using `station.price_change` from [prices.ts:61-72](fuelsniffer/src/lib/db/queries/prices.ts), which picks "last reading before 7 days ago" (could be any age). The popup at [StationPopup.tsx:101](fuelsniffer/src/components/StationPopup.tsx) computes the honest version: `price - data[0].avg` where `data[0]` is the **first bucket** returned by `/api/prices/history?hours=168`.

History endpoint at [history/route.ts:52-81](fuelsniffer/src/app/api/prices/history/route.ts) uses the `hourly_prices` continuous aggregate (falling back to `DATE_TRUNC('hour', recorded_at)` over raw `price_readings` if the cagg is empty). We match that exactly.

## Task 4: Rewrite `price_change` to match popup semantic

**Files:**
- Modify: `fuelsniffer/src/lib/db/queries/prices.ts:61-72` (the LATERAL subquery)
- Modify: `fuelsniffer/src/lib/db/queries/prices.ts:23-28` (drop `changeHours` param)
- Test: `fuelsniffer/src/__tests__/prices-query.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```typescript
// fuelsniffer/src/__tests__/prices-query.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getLatestPrices } from '@/lib/db/queries/prices'

const STATION_ID = 9100001
const FUEL_ID = 2 // ULP91 in seed — any real fuel_type_id works

async function seedReadings(offsets: Array<{ hoursAgo: number; priceCents: number }>) {
  for (const o of offsets) {
    await db.execute(sql`
      INSERT INTO price_readings (station_id, fuel_type_id, price_cents, recorded_at, source_ts)
      VALUES (
        ${STATION_ID}, ${FUEL_ID}, ${o.priceCents},
        NOW() - ${o.hoursAgo + ' hours'}::interval,
        NOW() - ${o.hoursAgo + ' hours'}::interval
      )
    `)
  }
}

describe('getLatestPrices.price_change', () => {
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM stations WHERE id = ${STATION_ID}`)
    await db.execute(sql`
      INSERT INTO stations (id, name, address, suburb, postcode, latitude, longitude, is_active, last_seen_at, external_id, source_provider)
      VALUES (${STATION_ID}, 'PriceTest', '1 Test', 'Test', '4000', -27.0, 153.0, true, NOW(), '${STATION_ID}', 'qld')
    `)
    await db.execute(sql`DELETE FROM price_readings WHERE station_id = ${STATION_ID}`)
  })

  it('computes price_change as current minus oldest bucket within 168h window', async () => {
    // 160h ago: 200.0c (within window — the oldest bucket)
    // 12h ago:  190.0c
    // now:      180.0c (current)
    await seedReadings([
      { hoursAgo: 160, priceCents: 200 },
      { hoursAgo: 12,  priceCents: 190 },
      { hoursAgo: 0,   priceCents: 180 },
    ])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === STATION_ID)

    expect(station).toBeDefined()
    expect(Number(station!.price_cents)).toBe(180)
    // current (180) - oldest-in-window (200) = -20
    expect(Number(station!.price_change)).toBe(-20)
  })

  it('returns null price_change when station has no readings in the 168h window', async () => {
    // Only one reading, 300h ago — outside window
    await seedReadings([{ hoursAgo: 300, priceCents: 200 }])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === STATION_ID)

    // Station may not be returned at all if its one reading is still the "latest"
    // — in that case price_change is meaningless, but if the row is present it must be null.
    if (station) {
      expect(station.price_change).toBeNull()
    }
  })

  it('returns 0 price_change when only a single reading exists in the window', async () => {
    await seedReadings([{ hoursAgo: 1, priceCents: 175 }])

    const results = await getLatestPrices(FUEL_ID, 1000, { lat: -27.0, lng: 153.0 })
    const station = results.find(r => r.id === STATION_ID)

    expect(station).toBeDefined()
    // Oldest bucket == latest reading == 175; diff is 0
    expect(Number(station!.price_change)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/prices-query.test.ts
```
Expected: FAIL — first test gets -20 only by coincidence with the current logic; more reliably the second test fails because current logic returns a non-null `price_change` (from the ancient 300h reading).

- [ ] **Step 3: Rewrite the query**

Replace [prices.ts:23-83](fuelsniffer/src/lib/db/queries/prices.ts) `getLatestPrices` function entirely with:

```typescript
export async function getLatestPrices(
  fuelTypeId: number,
  radiusKm: number,
  userLocation?: { lat: number; lng: number }
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
    ),
    window_start AS (
      -- Oldest bucket in the 168h window per station.
      -- Mirrors /api/prices/history?hours=168: prefer hourly_prices cagg,
      -- fall back to raw readings grouped by hour.
      SELECT station_id, avg_price_cents AS prev_price
      FROM (
        SELECT DISTINCT ON (station_id)
          station_id, avg_price_cents, bucket
        FROM hourly_prices
        WHERE fuel_type_id = ${fuelTypeId}
          AND bucket >= NOW() - INTERVAL '168 hours'
        ORDER BY station_id, bucket ASC
      ) h
    ),
    window_start_raw AS (
      -- Fallback for stations whose cagg has not materialized yet.
      SELECT DISTINCT ON (station_id)
        station_id,
        AVG(price_cents) OVER (PARTITION BY station_id, DATE_TRUNC('hour', recorded_at)) AS prev_price,
        DATE_TRUNC('hour', recorded_at) AS bucket
      FROM price_readings
      WHERE fuel_type_id = ${fuelTypeId}
        AND recorded_at >= NOW() - INTERVAL '168 hours'
      ORDER BY station_id, DATE_TRUNC('hour', recorded_at) ASC
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
      (
        l.price_cents::numeric -
        COALESCE(ws.prev_price, wsr.prev_price)::numeric
      ) AS price_change
    FROM latest l
    JOIN stations s ON s.id = l.station_id
    LEFT JOIN window_start ws ON ws.station_id = l.station_id
    LEFT JOIN window_start_raw wsr ON wsr.station_id = l.station_id
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

Also remove the `changeHours` param from the `PriceResult` interface's JSDoc if referenced. The exported `PriceResult` shape is unchanged.

- [ ] **Step 4: Find and update callers that passed `changeHours`**

```bash
cd fuelsniffer && grep -RIn "getLatestPrices(" src --include="*.ts" --include="*.tsx"
```

Any call site passing a 4th argument (`changeHours`) must be updated to drop it. Expected: 1–3 call sites in `src/app/api/prices/route.ts` and possibly `src/lib/dashboard-utils.ts`.

For each call site, remove the final `changeHours` arg if present. If a file passes it explicitly, delete just that argument.

- [ ] **Step 5: Run the prices-query test and the broader suite**

```bash
cd fuelsniffer && npx vitest run src/__tests__/prices-query.test.ts
cd fuelsniffer && npx vitest run
```
Expected: PASS on both. If the wider suite breaks it's almost always a caller still using `changeHours` — fix and re-run.

- [ ] **Step 6: Verify on the running dashboard**

```bash
# Pick a station that definitely has 7-day history
curl -s "http://localhost:3000/api/prices?fuel=2&radius=20" | head -200 | grep -E '"(id|price_change)"' | head -20
```

Expected: `price_change` non-null for most stations. Then open `http://localhost:3000/dashboard`, click a station, and confirm the side-list chip matches the popup's `X.X¢ / 7d` value for the same station+fuel. (They don't need to match byte-for-byte — popup averages over the first bucket, card uses the cagg's first bucket — but they should be directionally identical and within ~0.5¢.)

- [ ] **Step 7: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/lib/db/queries/prices.ts fuelsniffer/src/__tests__/prices-query.test.ts fuelsniffer/src/app/api/prices/route.ts
# Include any other caller files updated in step 4.
git commit -m "fix(prices): 7d price_change matches popup (first bucket in 168h window)"
```

---

# Part 3 — Trip Planner: Geocoding + Token Gating

Adds a server-side Mapbox geocoding proxy at `/api/geocode`, a new `AddressSearch` component, replaces the raw lat/lng fields in `TripForm`, and gates `/dashboard/trip` on `MAPBOX_TOKEN`.

## Task 5: Add `/api/geocode` — tests first

**Files:**
- Create: `fuelsniffer/src/app/api/geocode/route.ts`
- Create: `fuelsniffer/src/app/api/geocode/__tests__/setup.ts` (msw fixtures)
- Create: `fuelsniffer/src/app/api/geocode/__tests__/fixtures/brisbane.json`
- Create: `fuelsniffer/src/app/api/geocode/__tests__/fixtures/empty.json`
- Create: `fuelsniffer/src/__tests__/geocode-api.test.ts`
- Modify: `fuelsniffer/src/lib/security/rate-limit.ts:92-100` (add `/api/geocode` entry)

- [ ] **Step 1: Create Mapbox geocoding fixtures**

Create `fuelsniffer/src/app/api/geocode/__tests__/fixtures/brisbane.json` — a trimmed real response shape. A Mapbox Geocoding v6 response looks like:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "dXJuOm1ieHBsYzpCcmlzYmFuZQ",
      "geometry": { "type": "Point", "coordinates": [153.0251, -27.4698] },
      "properties": {
        "full_address": "Brisbane, Queensland, Australia",
        "name": "Brisbane",
        "place_formatted": "Queensland, Australia"
      }
    },
    {
      "type": "Feature",
      "id": "dXJuOm1ieHBsYzpCcmlzYmFuZV9DaXR5",
      "geometry": { "type": "Point", "coordinates": [153.0280, -27.4705] },
      "properties": {
        "full_address": "Brisbane City, Queensland 4000, Australia",
        "name": "Brisbane City",
        "place_formatted": "Queensland 4000, Australia"
      }
    }
  ]
}
```

Create `fuelsniffer/src/app/api/geocode/__tests__/fixtures/empty.json`:

```json
{ "type": "FeatureCollection", "features": [] }
```

- [ ] **Step 2: Create msw setup for geocoding**

Create `fuelsniffer/src/app/api/geocode/__tests__/setup.ts`:

```typescript
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { readFileSync } from 'fs'
import { join } from 'path'

const fixturesDir = join(__dirname, 'fixtures')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadFixture(name: string): any {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))
}

export const mapboxGeocodeHandler = http.get(
  'https://api.mapbox.com/search/geocode/v6/forward',
  ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase() ?? ''

    if (q.includes('__rate_limit__')) {
      return HttpResponse.json({ message: 'Too many requests' }, { status: 429 })
    }
    if (q.includes('__upstream_error__')) {
      return HttpResponse.json({ message: 'Boom' }, { status: 500 })
    }
    if (q.includes('brisbane')) {
      return HttpResponse.json(loadFixture('brisbane.json'))
    }
    return HttpResponse.json(loadFixture('empty.json'))
  }
)

export const mswServer = setupServer(mapboxGeocodeHandler)
```

- [ ] **Step 3: Write the failing API tests**

Create `fuelsniffer/src/__tests__/geocode-api.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { GET } from '@/app/api/geocode/route'
import { mswServer } from '@/app/api/geocode/__tests__/setup'
import { resetGeocodeCache } from '@/app/api/geocode/route'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

function makeReq(q: string | null): Request {
  const url = q === null
    ? 'http://localhost:3000/api/geocode'
    : `http://localhost:3000/api/geocode?q=${encodeURIComponent(q)}`
  return new Request(url)
}

describe('/api/geocode', () => {
  beforeEach(() => {
    process.env.MAPBOX_TOKEN = 'test-token'
    resetGeocodeCache()
  })

  it('400 when q is missing', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(400)
  })

  it('400 when q is shorter than 2 chars', async () => {
    const res = await GET(makeReq('a'))
    expect(res.status).toBe(400)
  })

  it('400 when q is longer than 100 chars', async () => {
    const res = await GET(makeReq('x'.repeat(101)))
    expect(res.status).toBe(400)
  })

  it('503 when MAPBOX_TOKEN is not set', async () => {
    delete process.env.MAPBOX_TOKEN
    const res = await GET(makeReq('brisbane'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('geocoding_unavailable')
  })

  it('200 with mapped results on success', async () => {
    const res = await GET(makeReq('brisbane'))
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ label: string; lat: number; lng: number }>
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('label')
    expect(body[0]).toHaveProperty('lat')
    expect(body[0]).toHaveProperty('lng')
    expect(typeof body[0].lat).toBe('number')
    expect(typeof body[0].lng).toBe('number')
  })

  it('502 when Mapbox returns 5xx', async () => {
    const res = await GET(makeReq('__upstream_error__'))
    expect(res.status).toBe(502)
  })

  it('503 when Mapbox returns 429', async () => {
    const res = await GET(makeReq('__rate_limit__'))
    expect(res.status).toBe(503)
  })

  it('caches identical queries within TTL', async () => {
    let upstreamCalls = 0
    mswServer.use(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      http.get('https://api.mapbox.com/search/geocode/v6/forward', ({ request: _r }) => {
        upstreamCalls++
        return HttpResponse.json({ type: 'FeatureCollection', features: [] })
      })
    )

    await GET(makeReq('same-query-xyz'))
    await GET(makeReq('same-query-xyz'))
    await GET(makeReq('same-query-xyz'))

    expect(upstreamCalls).toBe(1)
  })

  it('passes country=au and proximity params to Mapbox', async () => {
    let capturedUrl: string | null = null
    mswServer.use(
      http.get('https://api.mapbox.com/search/geocode/v6/forward', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ type: 'FeatureCollection', features: [] })
      })
    )

    await GET(makeReq('param-check'))
    expect(capturedUrl).toContain('country=au')
    expect(capturedUrl).toContain('proximity=')
    expect(capturedUrl).toContain('limit=5')
  })
})

// Pull msw http at the top of the import list for the capturing tests
import { http, HttpResponse } from 'msw'
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/geocode-api.test.ts
```
Expected: FAIL — module `@/app/api/geocode/route` not found.

- [ ] **Step 5: Add rate-limit entry**

Edit [rate-limit.ts:92-100](fuelsniffer/src/lib/security/rate-limit.ts) `RATE_LIMITS` object. Add inside the object:

```typescript
  '/api/geocode': { maxRequests: 60, windowMs: 60_000 },
```

- [ ] **Step 6: Implement the route handler**

Create `fuelsniffer/src/app/api/geocode/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'

const GeocodeQuerySchema = z.object({
  q: z
    .string({ required_error: 'q parameter is required' })
    .min(2, 'q must be at least 2 characters')
    .max(100, 'q must be at most 100 characters'),
})

export interface GeocodeResult {
  label: string
  lat: number
  lng: number
}

interface MapboxFeature {
  geometry: { coordinates: [number, number] }
  properties: { full_address?: string; name?: string; place_formatted?: string }
}
interface MapboxResponse {
  features: MapboxFeature[]
}

// Brisbane proximity bias
const PROXIMITY_LNG = 153.02
const PROXIMITY_LAT = -27.47

// In-memory LRU cache
interface CacheEntry { value: GeocodeResult[]; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX = 500

function cacheGet(key: string): GeocodeResult[] | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

function cacheSet(key: string, value: GeocodeResult[]): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

/** Test helper — resets cache state between runs. */
export function resetGeocodeCache(): void {
  cache.clear()
}

function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

function toResults(data: MapboxResponse): GeocodeResult[] {
  return data.features.map(f => ({
    label:
      f.properties.full_address
      ?? (f.properties.name
        ? `${f.properties.name}${f.properties.place_formatted ? ', ' + f.properties.place_formatted : ''}`
        : 'Unknown'),
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const parsed = GeocodeQuerySchema.safeParse({ q: searchParams.get('q') ?? undefined })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const token = process.env.MAPBOX_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'geocoding_unavailable' }, { status: 503 })
  }

  const key = normaliseQuery(parsed.data.q)
  const cached = cacheGet(key)
  if (cached) return NextResponse.json(cached)

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
  url.searchParams.set('q', parsed.data.q)
  url.searchParams.set('country', 'au')
  url.searchParams.set('proximity', `${PROXIMITY_LNG},${PROXIMITY_LAT}`)
  url.searchParams.set('limit', '5')
  url.searchParams.set('types', 'address,postcode,place,locality')
  url.searchParams.set('access_token', token)

  let upstream: Response
  try {
    upstream = await fetch(url)
  } catch {
    return NextResponse.json({ error: 'geocoding_failed' }, { status: 502 })
  }

  if (upstream.status === 429) {
    return NextResponse.json({ error: 'geocoding_rate_limited' }, { status: 503 })
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: 'geocoding_failed' }, { status: 502 })
  }

  const data = await upstream.json() as MapboxResponse
  const results = toResults(data)
  cacheSet(key, results)

  return NextResponse.json(results)
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd fuelsniffer && npx vitest run src/__tests__/geocode-api.test.ts
```
Expected: PASS — 8/8.

- [ ] **Step 8: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/app/api/geocode fuelsniffer/src/__tests__/geocode-api.test.ts fuelsniffer/src/lib/security/rate-limit.ts
git commit -m "feat(api): mapbox geocoding proxy at /api/geocode"
```

## Task 6: `AddressSearch` component

**Files:**
- Create: `fuelsniffer/src/components/AddressSearch.tsx`
- Create: `fuelsniffer/src/__tests__/address-search.test.tsx`
- Modify: `fuelsniffer/package.json` (add `jsdom` + `@testing-library/react` if missing — check first)

- [ ] **Step 1: Check test deps**

```bash
cd fuelsniffer && jq '.devDependencies | keys[]' package.json | grep -E "(jsdom|testing-library|happy-dom)"
```

Expected: some combination of `@testing-library/react`, `@testing-library/jest-dom`, and an env (`jsdom` or `happy-dom`). If absent, install them:

```bash
cd fuelsniffer && npm install -D @testing-library/react @testing-library/jest-dom happy-dom
```

And add `environmentMatchGlobs` to `vitest.config.ts`:

```typescript
test: {
  environment: 'node',
  environmentMatchGlobs: [['src/**/*.test.tsx', 'happy-dom']],
  // ...
}
```

- [ ] **Step 2: Write the failing test**

Create `fuelsniffer/src/__tests__/address-search.test.tsx`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import AddressSearch from '@/components/AddressSearch'

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockFetch(results: Array<{ label: string; lat: number; lng: number }>) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(results), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch
}

describe('AddressSearch', () => {
  it('calls /api/geocode with debounce after typing', async () => {
    const spy = vi.fn(async () => new Response('[]'))
    globalThis.fetch = spy as unknown as typeof fetch

    render(<AddressSearch onSelect={() => {}} placeholder="Search" />)
    const input = screen.getByPlaceholderText('Search')
    fireEvent.change(input, { target: { value: 'bri' } })

    // Before debounce fires
    expect(spy).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('/api/geocode?q=bri'))
    }, { timeout: 800 })
  })

  it('fires onSelect with chosen result', async () => {
    mockFetch([
      { label: 'Brisbane, QLD', lat: -27.47, lng: 153.02 },
      { label: 'Brisbane City, QLD 4000', lat: -27.46, lng: 153.03 },
    ])

    const onSelect = vi.fn()
    render(<AddressSearch onSelect={onSelect} placeholder="Search" />)
    const input = screen.getByPlaceholderText('Search')
    fireEvent.change(input, { target: { value: 'brisbane' } })

    const first = await screen.findByText('Brisbane, QLD', {}, { timeout: 1000 })
    fireEvent.click(first)

    expect(onSelect).toHaveBeenCalledWith({
      label: 'Brisbane, QLD', lat: -27.47, lng: 153.02,
    })
  })

  it('ignores input shorter than 2 chars', async () => {
    const spy = vi.fn(async () => new Response('[]'))
    globalThis.fetch = spy as unknown as typeof fetch

    render(<AddressSearch onSelect={() => {}} placeholder="Search" />)
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'a' } })

    await new Promise(r => setTimeout(r, 600))
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/address-search.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the component**

Create `fuelsniffer/src/components/AddressSearch.tsx`:

```typescript
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export interface AddressResult {
  label: string
  lat: number
  lng: number
}

interface AddressSearchProps {
  onSelect: (result: AddressResult) => void
  placeholder?: string
  initialValue?: string
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export default function AddressSearch({
  onSelect,
  placeholder = 'Search address, suburb, or postcode…',
  initialValue = '',
  disabled,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: AddressSearchProps) {
  const [query, setQuery] = useState(initialValue)
  const [results, setResults] = useState<AddressResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(initialValue) }, [initialValue])

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setIsOpen(false); return }
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      if (!res.ok) { setResults([]); setIsOpen(false); return }
      const data: AddressResult[] = await res.json()
      setResults(data)
      setIsOpen(data.length > 0)
      setHighlightedIndex(-1)
    } catch {
      setResults([]); setIsOpen(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchResults(value), 300)
  }

  const handleSelect = (r: AddressResult) => {
    setQuery(r.label)
    setResults([])
    setIsOpen(false)
    onSelect(r)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setIsOpen(false); setHighlightedIndex(-1) }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(i + 1, results.length - 1))
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, 0))
    }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0
      if (results[idx]) handleSelect(results[idx])
    }
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        id={id}
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        style={{
          width: '100%',
          height: '40px',
          borderRadius: '8px',
          border: '1px solid #2a2a2a',
          background: '#1a1a1a',
          paddingLeft: '12px',
          paddingRight: '12px',
          fontSize: '14px',
          color: '#ffffff',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {isOpen && results.length > 0 && (
        <div style={{
          position: 'absolute',
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          marginTop: '4px',
          maxHeight: '256px',
          overflowY: 'auto',
          zIndex: 50,
          width: '100%',
        }}>
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(r)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: highlightedIndex === i ? '#2a2a2a' : 'transparent',
                color: '#ffffff',
                border: 'none',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd fuelsniffer && npx vitest run src/__tests__/address-search.test.tsx
```
Expected: PASS — 3/3.

- [ ] **Step 6: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/components/AddressSearch.tsx fuelsniffer/src/__tests__/address-search.test.tsx fuelsniffer/package.json fuelsniffer/vitest.config.ts
git commit -m "feat(ui): AddressSearch — geocoded typeahead component"
```

## Task 7: Refactor `TripForm` to use `AddressSearch`

**Files:**
- Modify: `fuelsniffer/src/components/TripForm.tsx` (full rewrite)
- Test: `fuelsniffer/src/__tests__/trip-form.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/trip-form.test.tsx`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import TripForm from '@/components/TripForm'

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockRoute() {
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/geocode')) {
      return new Response(JSON.stringify([
        { label: 'Brisbane, QLD', lat: -27.47, lng: 153.02 },
      ]))
    }
    if (url.includes('/api/trip/route')) {
      return new Response(JSON.stringify({ primary: { polyline: 'abc', distance: 1, duration: 1 }, alternatives: [] }))
    }
    throw new Error('unexpected: ' + url)
  }) as typeof fetch
}

describe('TripForm', () => {
  it('disables submit until both start and end are chosen', async () => {
    mockRoute()
    const onResult = vi.fn()
    render(<TripForm onResult={onResult} onError={() => {}} loading={false} setLoading={() => {}} />)

    const submit = screen.getByRole('button', { name: /find fuel on route/i })
    expect(submit).toBeDisabled()
  })

  it('submits with selected coords', async () => {
    mockRoute()
    const onResult = vi.fn()
    render(<TripForm onResult={onResult} onError={() => {}} loading={false} setLoading={() => {}} />)

    // Type in start
    const inputs = screen.getAllByPlaceholderText(/search/i)
    fireEvent.change(inputs[0], { target: { value: 'brisbane' } })
    const startOption = await screen.findByText('Brisbane, QLD', {}, { timeout: 1000 })
    fireEvent.click(startOption)

    // Type in end
    fireEvent.change(inputs[1], { target: { value: 'brisbane' } })
    const endOption = await screen.findByText('Brisbane, QLD', {}, { timeout: 1000 })
    fireEvent.click(endOption)

    const submit = screen.getByRole('button', { name: /find fuel on route/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    await act(async () => { fireEvent.click(submit) })

    await waitFor(() => expect(onResult).toHaveBeenCalled())
    const [, values] = onResult.mock.calls[0]
    expect(values.start).toEqual({ lat: -27.47, lng: 153.02 })
    expect(values.end).toEqual({ lat: -27.47, lng: 153.02 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/trip-form.test.tsx
```
Expected: FAIL — current TripForm uses text inputs with coord-paste placeholder, not "Search…".

- [ ] **Step 3: Rewrite TripForm**

Replace the entire contents of `fuelsniffer/src/components/TripForm.tsx` with:

```typescript
'use client'

import { useState } from 'react'
import { FUEL_TYPES } from '@/components/FuelSelect'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import type { RouteResult } from '@/lib/providers/routing'

export interface TripFormValues {
  start: { lat: number; lng: number }
  end: { lat: number; lng: number }
  fuelTypeId: string
  corridorKm: number
}

interface TripFormProps {
  onResult: (result: RouteResult, values: TripFormValues) => void
  onError: (msg: string) => void
  loading: boolean
  setLoading: (v: boolean) => void
}

export default function TripForm({ onResult, onError, loading, setLoading }: TripFormProps) {
  const [start, setStart] = useState<AddressResult | null>(null)
  const [end, setEnd] = useState<AddressResult | null>(null)
  const [fuelTypeId, setFuelTypeId] = useState('2')
  const [corridorKm, setCorridorKm] = useState(2)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'denied'>('idle')
  const [geoError, setGeoError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function handleLocateStart() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported')
      return
    }
    setGeoStatus('loading')
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' })
        setGeoStatus('idle')
      },
      () => {
        setGeoStatus('denied')
        setGeoError('Location access denied')
        setTimeout(() => setGeoStatus('idle'), 3000)
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!start || !end) return

    setLoading(true)
    try {
      const res = await fetch('/api/trip/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { lat: start.lat, lng: start.lng },
          end: { lat: end.lat, lng: end.lng },
          alternatives: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const result: RouteResult = await res.json()
      onResult(result, {
        start: { lat: start.lat, lng: start.lng },
        end: { lat: end.lat, lng: end.lng },
        fuelTypeId,
        corridorKm,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch route'
      setSubmitError(message)
      onError(message)
    } finally {
      setLoading(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: '#888888', marginBottom: '6px', display: 'block',
  }
  const errorStyle: React.CSSProperties = { fontSize: '11px', color: '#ef4444', marginTop: '4px' }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Trip planner"
      style={{
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Start */}
      <div>
        <label htmlFor="trip-start" style={labelStyle}>Start location</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <AddressSearch
              id="trip-start"
              placeholder="Search address, suburb, or postcode…"
              initialValue={start?.label ?? ''}
              onSelect={setStart}
              disabled={loading}
            />
          </div>
          <button
            type="button"
            onClick={handleLocateStart}
            disabled={loading || geoStatus === 'loading'}
            aria-label="Use my current location for start"
            title="Use my current location"
            style={{
              height: '40px', width: '40px', borderRadius: '8px',
              border: '1px solid #2a2a2a',
              background: geoStatus === 'denied' ? 'rgba(239,68,68,0.15)' : '#1a1a1a',
              color: geoStatus === 'loading' ? '#f59e0b' : geoStatus === 'denied' ? '#ef4444' : '#8a8a8a',
              cursor: loading || geoStatus === 'loading' ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {geoStatus === 'loading' ? '…' : '⌖'}
          </button>
        </div>
        {geoError && <p style={errorStyle}>{geoError}</p>}
      </div>

      {/* End */}
      <div>
        <label htmlFor="trip-end" style={labelStyle}>End location</label>
        <AddressSearch
          id="trip-end"
          placeholder="Search address, suburb, or postcode…"
          initialValue={end?.label ?? ''}
          onSelect={setEnd}
          disabled={loading}
        />
      </div>

      {/* Fuel */}
      <div>
        <label htmlFor="trip-fuel" style={labelStyle}>Fuel type</label>
        <select
          id="trip-fuel"
          value={fuelTypeId}
          onChange={e => setFuelTypeId(e.target.value)}
          disabled={loading}
          style={{
            width: '100%', height: '40px', borderRadius: '8px',
            border: '1px solid #2a2a2a', background: '#1a1a1a',
            paddingLeft: '12px', paddingRight: '12px',
            fontSize: '14px', color: '#ffffff', outline: 'none', boxSizing: 'border-box',
          }}
        >
          {FUEL_TYPES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      {/* Corridor */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label htmlFor="trip-corridor" style={{ ...labelStyle, marginBottom: 0 }}>Corridor width</label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
            {corridorKm < 1 ? `${corridorKm * 1000}m` : `${corridorKm}km`}
          </span>
        </div>
        <input
          id="trip-corridor"
          type="range"
          min={0.5} max={20} step={0.5}
          value={corridorKm}
          onChange={e => setCorridorKm(Number(e.target.value))}
          disabled={loading}
          style={{ accentColor: '#f59e0b', width: '100%' }}
          aria-label={`Corridor width: ${corridorKm}km`}
        />
      </div>

      {submitError && <p style={errorStyle} role="alert">{submitError}</p>}

      <button
        type="submit"
        disabled={loading || !start || !end}
        aria-busy={loading}
        style={{
          height: '44px', borderRadius: '8px', border: 'none',
          background: loading || !start || !end ? '#2a2a2a' : '#f59e0b',
          color: loading || !start || !end ? '#555555' : '#000000',
          fontSize: '14px', fontWeight: 900, textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: loading || !start || !end ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Finding route…' : 'Find fuel on route →'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd fuelsniffer && npx vitest run src/__tests__/trip-form.test.tsx
```
Expected: PASS — 2/2.

- [ ] **Step 5: Run wider tests**

```bash
cd fuelsniffer && npx vitest run
```
Expected: PASS. If any existing TripForm test fails, the old `parseCoord` test is stale — delete that test file/block.

- [ ] **Step 6: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/components/TripForm.tsx fuelsniffer/src/__tests__/trip-form.test.tsx
git commit -m "feat(trip): TripForm uses geocoded address search instead of raw coords"
```

## Task 8: Gate `/dashboard/trip` on `MAPBOX_TOKEN`

**Files:**
- Modify: `fuelsniffer/src/app/dashboard/trip/page.tsx`
- Create: `fuelsniffer/src/components/TripDisabled.tsx`
- Test: `fuelsniffer/src/__tests__/trip-page-gate.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/trip-page-gate.test.tsx`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('/dashboard/trip — MAPBOX_TOKEN gate', () => {
  it('renders a disabled state when MAPBOX_TOKEN is missing', async () => {
    delete process.env.MAPBOX_TOKEN
    vi.resetModules()
    const { default: TripPage } = await import('@/app/dashboard/trip/page')
    render(await TripPage())
    expect(screen.getByText(/mapbox.*configuration/i)).toBeTruthy()
  })

  it('renders the client page when MAPBOX_TOKEN is set', async () => {
    process.env.MAPBOX_TOKEN = 'test-token'
    vi.resetModules()
    vi.doMock('@/app/dashboard/trip/TripClient', () => ({
      default: () => <div data-testid="trip-client" />,
    }))
    const { default: TripPage } = await import('@/app/dashboard/trip/page')
    render(await TripPage())
    expect(screen.getByTestId('trip-client')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd fuelsniffer && npx vitest run src/__tests__/trip-page-gate.test.tsx
```
Expected: FAIL — current page always renders TripClient.

- [ ] **Step 3: Create the disabled panel**

Create `fuelsniffer/src/components/TripDisabled.tsx`:

```typescript
import Link from 'next/link'

export default function TripDisabled() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ minHeight: '100dvh', background: '#111111', color: '#ffffff' }}
    >
      <div style={{ background: '#111111', borderBottom: '3px solid #f59e0b' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: '52px' }}>
          <Link href="/dashboard" style={{ color: '#8a8a8a', textDecoration: 'none', fontSize: '13px' }}>
            ← Back
          </Link>
          <span style={{ color: '#2a2a2a', margin: '0 12px' }}>|</span>
          <span style={{ fontSize: '16px', fontWeight: 900 }}>
            FUEL<span style={{ color: '#f59e0b' }}>SNIFFER</span>
            <span style={{ color: '#8a8a8a', fontWeight: 600, fontSize: '14px' }}> · Trip Planner</span>
          </span>
        </div>
      </div>
      <div style={{ maxWidth: 680, margin: '48px auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>
          Trip planner requires Mapbox configuration
        </h1>
        <p style={{ color: '#8a8a8a', lineHeight: 1.5, marginBottom: 16 }}>
          This feature needs a <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>MAPBOX_TOKEN</code> environment variable to
          look up addresses and calculate routes. Once configured, the trip planner will be available.
        </p>
        <p style={{ color: '#8a8a8a', lineHeight: 1.5 }}>
          See <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>docs/setup/mapbox-token.md</code> for setup instructions.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Gate the page**

Replace `fuelsniffer/src/app/dashboard/trip/page.tsx` with:

```typescript
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import TripDisabled from '@/components/TripDisabled'

const TripClient = dynamic(() => import('./TripClient'))

export const metadata = {
  title: 'Trip Planner — FuelSniffer',
  description: 'Find the cheapest fuel along your route',
}

export default function TripPage() {
  if (!process.env.MAPBOX_TOKEN) {
    return <TripDisabled />
  }
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TripClient />
    </Suspense>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd fuelsniffer && npx vitest run src/__tests__/trip-page-gate.test.tsx
```
Expected: PASS — 2/2.

- [ ] **Step 6: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add fuelsniffer/src/app/dashboard/trip/page.tsx fuelsniffer/src/components/TripDisabled.tsx fuelsniffer/src/__tests__/trip-page-gate.test.tsx
git commit -m "feat(trip): gate /dashboard/trip on MAPBOX_TOKEN; show disabled panel if unset"
```

## Task 9: Mapbox setup docs

**Files:**
- Create: `docs/setup/mapbox-token.md`

- [ ] **Step 1: Write the docs**

Create `docs/setup/mapbox-token.md`:

```markdown
# Mapbox Token Setup

The trip planner uses Mapbox for two things:

1. **Directions** — calculate routes between two points
2. **Geocoding** — turn a typed address into lat/lng

Both share one server-side secret token (`MAPBOX_TOKEN`). Without it, `/dashboard/trip` shows a "requires configuration" panel and `/api/geocode` returns 503.

## 1. Get a token

1. Sign up at [mapbox.com](https://account.mapbox.com/auth/signup/) (free tier covers ~100k requests/month — far beyond our self-hosted usage).
2. Go to [Access tokens](https://account.mapbox.com/access-tokens/).
3. Click **Create a token**.
4. Give it a name (e.g. `fuelsniffer-prod`).
5. Under **Secret scopes**, enable:
   - `directions:read`
   - `geocoding:read`
6. Click **Create token** and copy the `sk.eyJ...` value. You won't be able to view it again.

> The token is **secret** and stays server-side. It is never shipped to browsers.

## 2. Add it to your environment

### Local development

Edit `.env` in the repo root:

```env
MAPBOX_TOKEN=sk.eyJ1Ijoi...
```

### Docker deployment

`docker-compose.yml` already wires `MAPBOX_TOKEN` into the app service. Just ensure `.env` has the variable, then rebuild:

```bash
docker compose up -d --build app
```

## 3. Verify

```bash
curl -s "http://localhost:3000/api/geocode?q=brisbane" | head -100
```

Expected: a JSON array of `{ label, lat, lng }` entries.

Visit `http://localhost:3000/dashboard/trip` — the form should render with address inputs.

## Troubleshooting

- `503 geocoding_unavailable` → token not set in the app container's environment. Run `docker compose exec app printenv MAPBOX_TOKEN` to check.
- `502 geocoding_failed` → Mapbox returned 5xx or unreachable. Check network and Mapbox status.
- Tokens can be rotated at any time by creating a new one and updating `.env`; delete the old one from the Mapbox dashboard.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
git add docs/setup/mapbox-token.md
git commit -m "docs(setup): MAPBOX_TOKEN setup guide"
```

## Task 10: End-to-end manual smoke

**Files:** none

- [ ] **Step 1: Set the token**

Follow `docs/setup/mapbox-token.md` with a real Mapbox token, then:

```bash
cd /Users/cdenn/Projects/FuelSniffer/.claude/worktrees/funny-williams-d5c07f
docker compose up -d --build app
```

- [ ] **Step 2: Smoke the whole flow**

- Visit `http://localhost:3000/dashboard` — confirm suburb search finds "Brisbane City", station cards show `X.X¢ / 7d` chips on most stations.
- Open a station popup, confirm popup "¢ / 7d" value is directionally consistent with the card's chip.
- Visit `http://localhost:3000/dashboard/trip` — form renders.
- Type "north lakes" in Start — expect geocoded results.
- Click the locate button — start fills with "Current location".
- Type an End address, pick one, click "Find fuel on route →" — route draws, stations populate along corridor.

- [ ] **Step 3: Temporarily clear the token and re-verify gate**

```bash
docker compose exec app sh -c 'unset MAPBOX_TOKEN'  # won't actually unset — instead:
# Edit .env, remove MAPBOX_TOKEN, then:
docker compose up -d app
```

Visit `/dashboard/trip` — expect the disabled panel. Restore the token.

- [ ] **Step 4: Full test sweep**

```bash
cd fuelsniffer && npx vitest run
```
Expected: all green.

---

## Self-Review (done while writing)

- **Spec coverage**: Every scope item mapped — suburb lookup (T1), scraper fallback (T2), backfill (T3), price indicator query (T4), geocoding proxy (T5), AddressSearch (T6), TripForm refactor (T7), token gate (T8), setup docs (T9), smoke (T10).
- **Placeholders**: None — every code block is complete. The generator script in T1 is inline, the fixtures in T5 are full JSON, the backfill script is complete.
- **Type consistency**: `AddressResult` defined in T6 is used identically in T7. `GeocodeResult` in T5 returns `{label, lat, lng}` matching what the client expects. `PriceResult.price_change` shape unchanged in T4.
- **Ambiguity resolved**: History endpoint confirmed uses `hourly_prices` cagg → matching source in T4 query. Writer confirmed unchanged. Trip page uses `TripClient` delegate → gate added in `page.tsx`.
