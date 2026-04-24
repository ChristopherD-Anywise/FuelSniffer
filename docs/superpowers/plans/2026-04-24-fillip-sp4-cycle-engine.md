# Fillip SP-4 — Cycle Engine Phase A Implementation Plan

**Goal:** Deliver the MVP "fill up now vs. wait" engine (D1). Rule-based, 4-state signal per (suburb, fuel_type), persisted in `cycle_signals`, surfaced as dashboard chip + station card badge. Phase A is intentionally rule-based (algo_version = 'rule-v1'); Phase B (statistical forecast) drops in without re-wiring consumers.

**Spec:** `docs/superpowers/specs/2026-04-22-fillip-sp4-cycle-engine-design.md` (v1.1, §0 amendment: suburb key = `lower(suburb)|lower(state)`)

**Branch:** `sp4-cycle-engine` (worktree `/Users/cdenn/Projects/FuelSniffer/.worktrees/sp4`)

**Base:** `fillip-integration` (SP-0+1+2+3 merged, 397 tests passing)

**Critical gotcha:** QLD normaliser does NOT lowercase suburbs. Queries MUST use `lower(suburb)` and `lower(state)` defensively when building suburb_key from the `stations` table.

---

## File Structure

**Files created** (all under `fuelsniffer/`):

| Path | Responsibility |
|---|---|
| `src/lib/db/migrations/0018_cycle_signals.sql` | `cycle_signals` table + indexes |
| `src/lib/cycle/config.ts` | All tunable constants + algo version priority map |
| `src/lib/cycle/types.ts` | `CycleSignal`, `CycleSignalView`, `SignalState` type exports |
| `src/lib/cycle/detector.ts` | Pure function `computeSignal(series, config)` — no DB dependency |
| `src/lib/cycle/queries.ts` | `getSignal`, `getSignalForStation`, `getRecentSignals` |
| `src/lib/cycle/compute.ts` | DB-aware compute: fetches price_readings → runs detector → upserts cycle_signals |
| `src/lib/cycle/scheduler.ts` | Nightly 03:30 + post-scrape intraday refresh cron |
| `src/lib/cycle/backfill.ts` | One-off historical backfill script |
| `src/__tests__/cycle/detector.test.ts` | Golden tests: all 4 states + 2 UNCERTAIN paths + DST + cross-state |
| `src/__tests__/cycle/compute.test.ts` | Integration: suburb_key lower() defence, idempotence |
| `src/__tests__/cycle/queries.test.ts` | Query layer tests |

**Files modified:**

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | Add `cycleSignals` table definition + type exports |
| `src/lib/scraper/scheduler.ts` | Add nightly cycle compute + post-scrape refresh hook |
| `src/instrumentation.ts` | Import and start cycle scheduler alongside scraper scheduler |
| `src/components/slots/SlotVerdict.tsx` | Wire actual verdict chip (replaces SP-3 placeholder) |
| `src/app/api/health/route.ts` | Append last cycle compute timestamp + UNCERTAIN count |

---

## Task 0: Setup

- [ ] **Step 1: Verify baseline**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp4
git branch --show-current
# expect: sp4-cycle-engine
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp4/fuelsniffer
npm install --legacy-peer-deps
```

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp4/fuelsniffer
npm run test:run 2>&1 | tail -20
npm run lint 2>&1 | tail -5
```

---

## Task 1: Database migration — `cycle_signals`

**Files:** `src/lib/db/migrations/0018_cycle_signals.sql`, `src/lib/db/schema.ts`

- [ ] **Step 1: Write migration SQL**

Create `0018_cycle_signals.sql`:

```sql
CREATE TABLE cycle_signals (
  id              bigserial PRIMARY KEY,
  suburb_key      text        NOT NULL,
  suburb_display  text        NOT NULL,
  state_code      text        NOT NULL,
  fuel_type_id    integer     NOT NULL,
  computed_for    date        NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT NOW(),
  signal_state    text        NOT NULL,
  confidence      double precision NOT NULL,
  label           text        NOT NULL,
  supporting      jsonb       NOT NULL,
  algo_version    text        NOT NULL DEFAULT 'rule-v1',
  CONSTRAINT cycle_signals_state_check
    CHECK (signal_state IN ('FILL_NOW','HOLD','WAIT_FOR_DROP','UNCERTAIN'))
);

CREATE UNIQUE INDEX cycle_signals_unique
  ON cycle_signals (suburb_key, fuel_type_id, computed_for, algo_version);

CREATE INDEX cycle_signals_lookup
  ON cycle_signals (suburb_key, fuel_type_id, computed_for DESC);
```

- [ ] **Step 2: Add Drizzle schema entry**

Add `cycleSignals` pgTable to `schema.ts` with matching columns. Export `CycleSignal` and `NewCycleSignal` types.

---

## Task 2: Config and type definitions

**Files:** `src/lib/cycle/config.ts`, `src/lib/cycle/types.ts`

- [ ] **Step 1: Write `config.ts`**

All threshold constants as a typed `CycleConfig` object with defaults from spec §3.5:

```ts
export interface CycleConfig {
  LOOKBACK_DAYS: number       // 14
  SMOOTH_WINDOW: number       // 3
  TROUGH_BAND: number         // 0.15
  PEAK_BAND: number           // 0.85
  GAP_PCT_FOR_FILL: number    // 0.03
  SLOPE_FLAT_CENTS: number    // 0.5
  SLOPE_RISING_CENTS: number  // 2.0
  MIN_RANGE_CENTS: number     // 4.0
  MIN_STATIONS: number        // 3
  MIN_DAYS_WITH_DATA: number  // 10
}

export const DEFAULT_CONFIG: CycleConfig = { ... }

// Phase B algo priority — higher index wins
export const ALGO_PRIORITY = ['rule-v1', 'forecast-v1']
```

- [ ] **Step 2: Write `types.ts`**

```ts
export type SignalState = 'FILL_NOW' | 'HOLD' | 'WAIT_FOR_DROP' | 'UNCERTAIN'

export interface CycleSignalView {
  state: SignalState
  label: string
  confidence: number
  suburb: string
  fuelTypeId: number
  computedFor: string           // ISO date
  supporting: {
    todayMedianCents: number
    cheapestNowCents: number
    windowMinCents: number
    windowMaxCents: number
    slope3dCents: number
    stationCountAvg: number
    daysWithData: number
    trigger?: string
  }
}
```

---

## Task 3: Pure detector algorithm

**File:** `src/lib/cycle/detector.ts`

- [ ] **Step 1: Define input types**

```ts
export interface DailyEntry {
  date: string           // YYYY-MM-DD
  stationMins: number[]  // price_cents per station for that day
  cheapestLatest?: number // latest price per station (for today only)
  cheapestStationId?: number
}
```

- [ ] **Step 2: Implement `computeSignal(entries, config, today?)`**

Following §3.2–3.4 exactly:
1. Compute `station_day_min` for each entry (MIN of stationMins)
2. Compute `suburb_day_median` (median of station_day_mins per day)
3. Apply trailing `SMOOTH_WINDOW` median to get `smoothed[]`
4. Compute `window_min`, `window_max`, `window_range`
5. Compute `position_in_range`, `slope_3d`, `cheapest_gap_pct`
6. Apply classification rules in order (first match wins)
7. Compute confidence proxy per §6
8. Return `{ signal_state, confidence, label, supporting }`

- [ ] **Step 3: Edge case guards**

- `days_with_data < MIN_DAYS_WITH_DATA` → UNCERTAIN
- `station_count_avg < MIN_STATIONS` → UNCERTAIN
- `window_range < MIN_RANGE_CENTS` → HOLD (flat market)

---

## Task 4: Unit tests — golden series

**File:** `src/__tests__/cycle/detector.test.ts`

All tests are pure function tests — no DB required.

- [ ] **Step 1: Implement fixture builder helper**

```ts
function makeSeries(medians: number[], stationsPerDay = 4): DailyEntry[]
// generates LOOKBACK_DAYS worth of entries, today = last entry
```

- [ ] **Step 2: Golden tests — all 7 fixtures from spec §9.1**

| Fixture | Expected state |
|---|---|
| Descending → bottomed | FILL_NOW |
| Flat (range=1) | HOLD |
| Rising mid-range | HOLD |
| Climbing into peak (flat at top) | WAIT_FOR_DROP |
| High and still rising | WAIT_FOR_DROP |
| Only 4 days of data | UNCERTAIN |
| 14 days but 1 station avg | UNCERTAIN |

- [ ] **Step 3: DST / timezone resilience test**

Verify date boundary handling doesn't shift a day due to TZ. Pass explicit AEST dates.

- [ ] **Step 4: Cross-state suburb collision test**

Fixture: "Springfield" QLD (mixed-case `SPRINGFIELD`) and "springfield" NSW. Assert keys are `springfield|qld` and `springfield|nsw` respectively, and signals are computed independently.

- [ ] **Step 5: Property / edge case tests**

- Adding one noisy station does not flip HOLD → FILL_NOW when suburb is otherwise flat
- Missing 3 days (holes) → days_with_data correctly excludes them
- All-same-price series → HOLD (flat)
- Single station count → UNCERTAIN

---

## Task 5: DB-aware compute layer

**File:** `src/lib/cycle/compute.ts`

- [ ] **Step 1: `fetchSuburbSeries(suburbKey, fuelTypeId, lookbackDays, db)`**

```sql
-- CRITICAL: use lower(suburb) || '|' || lower(state) for suburb_key
-- Pull 14 days of price_readings per suburb
SELECT
  s.id AS station_id,
  lower(s.suburb) || '|' || lower(s.state) AS suburb_key,
  s.suburb AS suburb_display,
  s.state  AS state_code,
  date_trunc('day', pr.recorded_at AT TIME ZONE 'Australia/Brisbane')::date AS day,
  MIN(pr.price_cents::float) AS day_min,
  pr.price_cents::float AS price_cents
FROM price_readings pr
JOIN stations s ON s.id = pr.station_id
WHERE lower(s.suburb) || '|' || lower(s.state) = $1
  AND pr.fuel_type_id = $2
  AND pr.recorded_at >= NOW() - ($3 || ' days')::interval
GROUP BY s.id, suburb_key, suburb_display, state_code, day, pr.price_cents
```

- [ ] **Step 2: `computeAndUpsertSignal(suburbKey, fuelTypeId, forDate?)`**

1. Fetch series
2. Call `computeSignal(series, DEFAULT_CONFIG)`
3. Upsert into `cycle_signals` with `ON CONFLICT ... DO UPDATE SET ...`

- [ ] **Step 3: `runNightlyCompute()` — all suburbs**

```ts
// Get all distinct suburb keys with data in last LOOKBACK_DAYS
const suburbFuelPairs = await fetchActiveSuburbFuelPairs(db)
for (const { suburbKey, fuelTypeId } of suburbFuelPairs) {
  await computeAndUpsertSignal(suburbKey, fuelTypeId, today)
}
// Write to cycle_health (or scrape_health extension)
```

- [ ] **Step 4: `runIntradayRefresh(touchedSuburbKeys)`**

Recompute only today's signal for suburbs whose stations had a price change this scrape.

---

## Task 6: Query API

**File:** `src/lib/cycle/queries.ts`

- [ ] **Step 1: `getSignal(suburbKey, fuelTypeId)`**

```ts
// Returns most recent signal for today (AEST)
// Uses ALGO_PRIORITY preference: forecast-v1 > rule-v1
SELECT * FROM cycle_signals
WHERE suburb_key = $1
  AND fuel_type_id = $2
  AND computed_for = CURRENT_DATE AT TIME ZONE 'Australia/Brisbane'
ORDER BY algo_version DESC  -- handled by ALGO_PRIORITY map in app layer
LIMIT 1
```

Returns `CycleSignalView | null`.

- [ ] **Step 2: `getSignalForStation(stationId, fuelTypeId)`**

1. `SELECT lower(suburb) || '|' || lower(state) AS suburb_key FROM stations WHERE id = $1`
2. Call `getSignal(suburbKey, fuelTypeId)`
3. If result is UNCERTAIN or null, attempt postcode-level fallback (same query with `lower(postcode) || '|' || lower(state)`)

- [ ] **Step 3: `getRecentSignals(suburbKey, fuelTypeId, days = 30)`**

For charts/debugging. Returns last N days sorted ascending.

---

## Task 7: Scheduler wiring

**Files:** `src/lib/cycle/scheduler.ts`, `src/lib/scraper/scheduler.ts`, `src/instrumentation.ts`

- [ ] **Step 1: Create `src/lib/cycle/scheduler.ts`**

```ts
export function startCycleScheduler(): void {
  // Nightly 03:30 AEST — full recompute
  cron.schedule('30 3 * * *', runNightlyCompute, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })
  console.log('[cycle-scheduler] Nightly compute at 03:30 Brisbane')
}
```

- [ ] **Step 2: Wire post-scrape hook in `src/lib/scraper/scheduler.ts`**

After `runProviderScrape` succeeds, extract suburb keys for stations that had prices updated, then call `runIntradayRefresh(touchedSuburbKeys)`.

- [ ] **Step 3: Register in `src/instrumentation.ts`**

```ts
const { startCycleScheduler } = await import('./lib/cycle/scheduler')
startCycleScheduler()
```

---

## Task 8: SlotVerdict integration

**File:** `src/components/slots/SlotVerdict.tsx`

The component currently renders an empty 56×22 pill. SP-4 replaces the content with a real verdict chip. The chip is rendered server-data-free at the component level — data is passed as a prop from the parent.

- [ ] **Step 1: Extend props interface**

```ts
interface SlotVerdictProps {
  station: PriceResult
  verdict?: CycleSignalView | null   // SP-4: injected by parent
}
```

- [ ] **Step 2: Render verdict pill**

State-to-display mapping:

| State | Pill text | Color |
|---|---|---|
| FILL_NOW | "FILL NOW" | green accent |
| WAIT_FOR_DROP | "WAIT" | amber/orange |
| HOLD | (nothing) | — |
| UNCERTAIN | (nothing) | — |
| null/undefined | (nothing, SP-3 footprint) | — |

Pill: `56×22` pill shape, `font-size: 10px`, `font-weight: 700`, `letter-spacing: 0.05em`. Accessible: `role="status"`, `aria-label` with full state text.

- [ ] **Step 3: Update existing SlotComponents tests**

The test currently asserts `aria-hidden="true"`. With verdict data, the chip becomes visible. Update test to cover both states (no verdict = hidden, with verdict = visible with role).

---

## Task 9: Dashboard "today's verdict" chip

**Note:** The spec (§10.1–10.3) states SP-4 provides data and default label; SP-3 owns visual treatment. The dashboard chip is a minimal implementation that can be polished in SP-3 follow-up. We add it to the dashboard page using `getSignal()` called server-side.

- [ ] **Step 1: Determine home suburb**

For Phase A, derive from session's preferred suburb (if stored) or fall back to the map center suburb. For MVP, hard-code to a query of "most common suburb in current result set" or expose a static config default.

- [ ] **Step 2: Add server component `TodaysVerdict`**

```tsx
// src/components/TodaysVerdict.tsx
// Server component — calls getSignal() and renders the chip
// Rendered in dashboard page layout near the filter bar
```

---

## Task 10: Health endpoint extension

**File:** `src/app/api/health/route.ts`

- [ ] **Step 1: Add cycle compute health**

```ts
const cycleHealth = await db.execute(sql`
  SELECT
    MAX(computed_at) AS last_computed_at,
    COUNT(*) FILTER (WHERE signal_state = 'UNCERTAIN') AS uncertain_count,
    COUNT(*) AS total_signals
  FROM cycle_signals
  WHERE computed_for = CURRENT_DATE
`)
```

Return in health JSON:

```json
{
  "cycle": {
    "lastComputedAt": "...",
    "todaySignals": 42,
    "uncertainCount": 3
  }
}
```

---

## Task 11: Backfill script

**File:** `src/lib/cycle/backfill.ts`

- [ ] **Step 1: CLI script**

```ts
// npx tsx src/lib/cycle/backfill.ts [--from=YYYY-MM-DD] [--dry-run]
// Iterates from earliest recorded_at date to today
// For each day D: compute signal with today := D
// ON CONFLICT DO NOTHING (idempotent)
```

---

## Task 12: Integration tests

**Files:** `src/__tests__/cycle/compute.test.ts`, `src/__tests__/cycle/queries.test.ts`

- [ ] **Step 1: suburb_key lower() defence test (CRITICAL)**

Fixture: mixed-case QLD data (`suburb = 'SPRINGFIELD'`, `state = 'QLD'`) + lowercased NSW data (`suburb = 'springfield'`, `state = 'nsw'`). Assert `suburb_key` output is `springfield|qld` and `springfield|nsw` — not the same key, not two different variations of QLD's key.

- [ ] **Step 2: Idempotence test**

Run `computeAndUpsertSignal()` twice for the same (suburb_key, fuelTypeId, date). Assert single row in `cycle_signals`, `computed_at` updated on second run.

- [ ] **Step 3: Postcode fallback test**

Insert a suburb with only 1 station (UNCERTAIN). Assert `getSignalForStation` falls back to postcode-level signal.

---

## Task 13: Spec compliance review + lint/test

- [ ] **Step 1: Spec walk-through (§1–§14)**
- [ ] **Step 2: `npm run test:run`** — all new SP-4 tests green; 4 pre-existing DB failures stay; total ≥ 397 + new
- [ ] **Step 3: `npm run build`** — zero new errors
- [ ] **Step 4: `npm run lint`** — no new errors above pre-existing 42

---

## Task 14: Commit + push + PR

- [ ] **Step 1: Commit plan** `docs(plan): SP-4 implementation plan (cycle engine Phase A)`
- [ ] **Step 2: Commit implementation** in logical chunks
- [ ] **Step 3: Push and open PR** targeting `fillip-integration`

---

## Key decisions / open questions

| # | Decision |
|---|---|
| Suburb key format | `lower(suburb)\|lower(state)` — confirmed §0 amendment |
| QLD mixed-case defence | Always apply `lower()` in query layer; never assume ingest has normalised |
| Phase B contract | `algo_version` field + ALGO_PRIORITY map in config.ts; no query layer changes needed |
| Postcode fallback | Same algo, lazily computed on UNCERTAIN (Q2 resolved for Phase A) |
| Holiday calendar | Deferred to rule-v2 per spec §4 |
| Runtime-tunable thresholds | Compile-time for v1 per spec §13 Q8 |
| Dashboard chip scope | Derives from current fuel filter, not saved preference (§13 Q9) |
