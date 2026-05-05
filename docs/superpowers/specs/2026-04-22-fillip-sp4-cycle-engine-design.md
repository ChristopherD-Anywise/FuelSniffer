# SP-4 — Cycle Engine Phase A (D1, rule-based predictive)

**Status:** Draft v1.1 (decisions amended 2026-04-23)
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `2026-04-22-fillip-master-design.md` (§4 D1, §10 cross-cutting decisions)
**Owning module:** `src/lib/cycle/`
**Depends on:** SP-1 national data adapters (for non-QLD coverage); none for QLD-only beta
**Blocks:** SP-5 alerts (`cycle_low` alert type)

## 0. Amendments since v1 (2026-04-23)

| Topic | v1 said | **Now (v1.1)** |
|---|---|---|
| Suburb key namespacing (Q1) | Recommendation: `lower(suburb)\|lower(state)` | **Confirmed.** Use this exact composite key. Same shape as SP-1 emits and SP-5 queries. |

§Open Question Q1 is **resolved**. Q2 (postcode-level fallback) and Q3-Q9 stand.

---

---

## 1. Purpose

Deliver the MVP of differentiator **D1 — "fill up now vs. wait" engine**. Phase A is an explainable, rule-based detector that emits a 4-state signal per **(suburb, fuel_type)** every day, surfaced as:

- A "today's verdict" chip on the dashboard, scoped to the user's home suburb.
- A small badge on every station card / popup (resolved via the station's suburb).
- A trigger source for the `cycle_low` alert in SP-5.

Phase A is intentionally **not** a forecast. It does not predict cents-per-litre tomorrow. It classifies *where in the cycle the user's suburb is right now*, with a confidence proxy and human-readable supporting numbers. Phase B (post-MVP) replaces the rule body but keeps the contract.

---

## 2. Signal contract (stable across Phase A → B)

The fundamental output is a single row per `(suburb, fuel_type_id, computed_for_date)`:

```
CycleSignal {
  suburb:           string         // canonical lowercased suburb key
  fuel_type_id:     int
  computed_for:     date           // AEST calendar day this signal is "for"
  computed_at:      timestamptz    // when the row was written
  signal_state:    'FILL_NOW' | 'HOLD' | 'WAIT_FOR_DROP' | 'UNCERTAIN'
  confidence:       float          // 0..1, see §6
  label:            string         // short user-facing string e.g. "Cycle low"
  supporting:       json           // see §5
  algo_version:     string         // 'rule-v1', allows A/B and back-compat
}
```

The state semantics:

| State | Meaning | Recommended user action |
|---|---|---|
| `FILL_NOW` | Suburb median is at/near a 14-day trough; current cheapest stations sit meaningfully below the median. | Fill up today. |
| `HOLD` | Median is flat or drifting modestly; no clear trough or peak. | Fine to fill today, no urgency. |
| `WAIT_FOR_DROP` | Median is high relative to recent window (near peak), and trend is rolling over or flat-high. | Wait 2–7 days if you can. |
| `UNCERTAIN` | Insufficient data, sparse coverage, or contradictory signals. | Show neutral copy; do not fire `cycle_low` alerts. |

`UNCERTAIN` is a first-class state, not an error. The chip and badge MUST render gracefully for it.

---

## 3. Algorithm (Phase A, rule-v1)

### 3.1 Inputs

For each `(suburb, fuel_type_id)`:
- All `price_readings` for stations in that suburb over the last `LOOKBACK_DAYS` (default **14**).
- The most recent reading per station (for the "current cheapest" check).
- Number of distinct stations contributing data.

The QLD ingest already filters to ~50km of North Lakes; for national rollout, suburb is taken from `stations.suburb` (canonicalised lowercase, trimmed). Cross-state suburb collisions are namespaced by adding `state` to the key (see §10 open question 1).

### 3.2 Daily series construction

```
for each day D in [today-LOOKBACK_DAYS .. today]:
    # one price per station per day = its lowest reading that day
    # (defended against intraday spikes from outliers)
    station_day_min[s] = MIN(price_cents WHERE recorded_at::date = D)
    suburb_day_median[D] = MEDIAN(station_day_min[s] for s in suburb)
    station_count[D]      = COUNT(distinct s with a reading on D)
```

Rationale:
- Daily *min per station* dampens noise from a single station bouncing back-and-forth intraday.
- *Median across stations* dampens single-outlier discount/bug pricing.
- A *day-level series* is the right granularity — QLD cycles are 7–14 days long; sub-daily detail adds noise, not signal.

We then compute a smoothed series:

```
smoothed[D] = MEDIAN of suburb_day_median over [D-SMOOTH_WINDOW+1 .. D]
              (centred-trailing; default SMOOTH_WINDOW = 3)
```

A trailing window is used (not centred) so that today's smoothed value is well-defined and doesn't depend on future days we don't have.

### 3.3 Trough / peak detection

Let `today = LOOKBACK_DAYS - 1` (last index in the window).

```
window_min   = MIN(smoothed[D] for D in window)
window_max   = MAX(smoothed[D] for D in window)
window_range = window_max - window_min        # in cents

today_smoothed   = smoothed[today]
today_raw_median = suburb_day_median[today]

# How close to the floor / ceiling are we?
position_in_range = (today_smoothed - window_min) / window_range
                    # 0.0 = at trough, 1.0 = at peak

# Where are the cheapest stations *right now* relative to suburb median?
cheapest_now      = MIN(latest price_cents per station today)
cheapest_gap_pct  = (today_raw_median - cheapest_now) / today_raw_median

# Recent slope: is the smoothed series rising or falling?
slope_3d = smoothed[today] - smoothed[today - 3]    # cents over 3 days
```

### 3.4 Classification rules (in order; first match wins)

```
# Guard: not enough data → UNCERTAIN
if station_count_avg_over_window < MIN_STATIONS              → UNCERTAIN
if days_with_data < MIN_DAYS_WITH_DATA                       → UNCERTAIN
if window_range < MIN_RANGE_CENTS                            → HOLD     (flat market)

# FILL_NOW: at or very near the trough, and there's a real cheap option
if position_in_range <= TROUGH_BAND
   AND cheapest_gap_pct >= GAP_PCT_FOR_FILL                  → FILL_NOW

# WAIT_FOR_DROP: near the peak, slope flat or falling
if position_in_range >= PEAK_BAND
   AND slope_3d <= SLOPE_FLAT_CENTS                          → WAIT_FOR_DROP

# WAIT_FOR_DROP: still climbing, but already in upper half of range
if position_in_range >= 0.6
   AND slope_3d >= SLOPE_RISING_CENTS                        → WAIT_FOR_DROP

# Default: no strong signal
otherwise                                                    → HOLD
```

### 3.5 Recommended default thresholds

| Constant | Default | Notes |
|---|---|---|
| `LOOKBACK_DAYS` | 14 | One full QLD cycle of ~7–14 days, plus headroom. |
| `SMOOTH_WINDOW` | 3 | Trailing median; smooths daily wobble without lag. |
| `TROUGH_BAND` | 0.15 | "Bottom 15% of the range" counts as trough-adjacent. |
| `PEAK_BAND` | 0.85 | "Top 15% of the range." |
| `GAP_PCT_FOR_FILL` | 0.03 | Cheapest must be ≥3% below today's suburb median to fire `FILL_NOW`. |
| `SLOPE_FLAT_CENTS` | 0.5 | Within ±0.5¢/L over 3 days = flat. |
| `SLOPE_RISING_CENTS` | 2.0 | ≥2.0¢/L rise over 3 days = clearly climbing. |
| `MIN_RANGE_CENTS` | 4.0 | <4¢/L range over 14 days → suburb is flat; `HOLD`. |
| `MIN_STATIONS` | 3 | Average distinct stations contributing per day. |
| `MIN_DAYS_WITH_DATA` | 10 | Out of 14 lookback days. |

All defaults live in a single config object (`src/lib/cycle/config.ts`) so they are tunable in one place and overridable per-environment for tests.

---

## 4. Edge cases

| Case | Behaviour |
|---|---|
| **Sparse suburb (1–2 stations)** | `station_count < MIN_STATIONS` → `UNCERTAIN`. Surface a fallback: "Not enough stations in *Suburb* — showing nearest postcode." Postcode-level fallback is computed identically with `(postcode, fuel_type)` and used only when suburb-level is `UNCERTAIN`. |
| **Brand-new station (joined < LOOKBACK_DAYS ago)** | Counts toward `station_count` only on days it has data. No special-casing; the median naturally absorbs it. |
| **Missing data days** (scraper outage) | Days with `station_count[D] = 0` are dropped from the series; `days_with_data` excludes them. `MIN_DAYS_WITH_DATA = 10` ensures we degrade to `UNCERTAIN` rather than emit a confident signal on swiss-cheese data. |
| **Public holiday distortion** (Easter, ANZAC) | Phase A does not special-case calendar effects. We log the date-of-classification on every signal so we can post-hoc evaluate whether holiday days produce wrong calls; if material, we add a holiday-aware adjustment in rule-v2. |
| **Single-station price spike** | Killed by `MIN per station per day`, then by median-across-stations. Spikes only win when ≥half the suburb spikes — which *is* a real signal. |
| **All stations rebadged / closed** | `station_count` collapses → `UNCERTAIN` for that suburb until ≥`MIN_STATIONS` are present again. |
| **Cross-suburb collisions** | Suburb key namespaced as `lower(suburb) + '|' + lower(state)`; see §10 Q1. |
| **DST / timezone** | All "day" boundaries computed in `Australia/Brisbane` (no DST) for QLD; for other states the relevant local timezone via `date-fns-tz`. Stored as `date` (no time component) in `computed_for`. |

---

## 5. Data model

### 5.1 New table — `cycle_signals`

```sql
CREATE TABLE cycle_signals (
  id              bigserial PRIMARY KEY,
  suburb_key      text        NOT NULL,    -- 'chermside|qld'
  suburb_display  text        NOT NULL,    -- 'Chermside'
  state_code      text        NOT NULL,    -- 'QLD'
  fuel_type_id    integer     NOT NULL,
  computed_for    date        NOT NULL,    -- the "day" this signal describes
  computed_at     timestamptz NOT NULL DEFAULT NOW(),
  signal_state    text        NOT NULL,    -- enum check constraint
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

**Why a flat denormalised table** (rather than computing on-read from `price_readings`):
- The chip and badge are rendered on every dashboard page-load and on every popup open. We want O(1) lookup, not a 14-day window scan.
- Backfill (§8) needs an explicit row per historical day for accuracy testing.
- SP-5 (`cycle_low` alerts) wants to detect "state changed `HOLD → FILL_NOW` since yesterday" via a single SQL query.

### 5.2 `supporting` JSON shape

```jsonc
{
  "window_min_cents":      1612,
  "window_max_cents":      1864,
  "today_median_cents":    1701,
  "cheapest_now_cents":    1659,
  "cheapest_station_id":   12345,
  "position_in_range":     0.353,
  "slope_3d_cents":       -1.2,
  "station_count_avg":     7.4,
  "days_with_data":        13,
  "trigger":               "trough_band+gap_pct"   // which rule fired
}
```

Stored as numbers, not strings. Cents stored as integer tenths (`1612 = 161.2¢`) to match the existing `numeric(6,1)` precision in `price_readings`.

### 5.3 Drizzle wiring

Add to `src/lib/db/schema.ts`:

```
export const cycleSignals = pgTable('cycle_signals', { ... })
export type CycleSignal = typeof cycleSignals.$inferSelect
```

Migration: new SQL file `src/lib/db/migrations/0006_cycle_signals.sql`. Plain SQL, applied via `migrate.ts` per project conventions.

---

## 6. Confidence proxy

Phase A doesn't have a probabilistic model. We expose a simple confidence proxy on `[0, 1]`:

```
station_factor = clamp(station_count_avg / 8.0,            0, 1)
coverage_factor = clamp(days_with_data    / LOOKBACK_DAYS,  0, 1)
range_factor    = clamp(window_range      / 10.0,           0, 1)   # cents
confidence = 0.4 * station_factor + 0.4 * coverage_factor + 0.2 * range_factor
```

Surfaced as a 1-decimal number in the tooltip ("confidence 0.7"). Phase B replaces this with the forecast model's CI.

---

## 7. Compute schedule

Two complementary jobs:

### 7.1 Nightly full recompute (authoritative)

- **When:** 03:30 AEST daily.
- **What:** For every `(suburb_key, fuel_type_id)` with any data in the last `LOOKBACK_DAYS`, compute today's signal and upsert into `cycle_signals` keyed on `(suburb_key, fuel_type_id, today, algo_version)`.
- **Why nightly:** the daily series is stable once the previous day closes. 03:30 chosen so the previous calendar day is fully captured (last QLD scrape lands by ~23:55).
- **Driver:** add a job to the existing `node-cron` scheduler in `src/lib/scraper/scheduler.ts` (or a new sibling `src/lib/cycle/scheduler.ts` invoked from the same `instrumentation.ts` bootstrap).

### 7.2 Light intraday refresh (optional but recommended)

- **When:** after each 15-min scrape completes successfully (post-hook on the scraper).
- **What:** recompute today's signal **only** (not historical days), only for suburbs whose stations had a price change this scrape. Bounded scope keeps this <2s.
- **Why:** a `WAIT_FOR_DROP → FILL_NOW` flip during the day is exactly the moment SP-5 wants to alert on. Pure nightly would miss intraday transitions.
- **Idempotent:** upserts the same `(suburb_key, fuel_type_id, today)` row.

### 7.3 Alternative considered: on-demand

Compute-on-read in the API was rejected: every chip + badge render would need a 14-day window query, and backfill testing would be impossible. We keep the computation server-side, scheduled, and persisted.

---

## 8. Backfill

Before launch we run a one-off backfill so historical accuracy is testable:

- Iterate `D` from the earliest available `recorded_at::date` up to today.
- For each `D`, run the same algorithm with `today := D` and a window ending on `D`.
- Insert one row per `(suburb_key, fuel_type_id, D)` with `algo_version = 'rule-v1'`.
- Idempotent (ON CONFLICT DO NOTHING for backfill mode).

Implemented as `src/lib/cycle/backfill.ts`, run via `npx tsx src/lib/cycle/backfill.ts [--from=YYYY-MM-DD]`. Estimated cost (QLD-only, 6 months × ~50 suburbs × 4 fuel types) ≈ 36k rows; trivial.

The backfilled history is the substrate for §9.4 validation.

---

## 9. Testing strategy

### 9.1 Unit tests — pure algorithm

`src/__tests__/cycle/detect.test.ts`. Pass synthetic `(date → median_cents)` series and assert state.

Fixture series, one per state:

```
FILL_NOW       — descending then bottoming: 175,172,169,167,165,164,164,163  (today=163, range=12)
HOLD (flat)    — 168,167,168,167,168,167,168,167                              (range=1)
HOLD (drift)   — 165,166,166,167,167,168,168,169                              (rising mid-range)
WAIT_FOR_DROP  — climbing into peak: 164,166,170,174,178,180,181,181        (today high, slope flat)
WAIT_FOR_DROP  — high & still rising: 168,170,173,176,179,181,183,185        (today=185, slope+)
UNCERTAIN      — only 4 days of data
UNCERTAIN      — 14 days but only 1 station
```

Each fixture is a "golden test": exact expected `signal_state`, `position_in_range`, and `trigger` recorded.

### 9.2 Integration test — DB round-trip

Spin up a test schema, insert synthetic `price_readings` for two suburbs × two fuels × 20 days, run the nightly job, assert `cycle_signals` rows exist with expected state.

### 9.3 Idempotence test

Run nightly twice; assert no duplicate rows, last `computed_at` updated.

### 9.4 Real-data validation (pre-launch + ongoing)

Using the backfilled history (§8):

- Pick 10 historically known QLD trough days (manual labelling from Brisbane fuel cycle reporting).
- Assert ≥70% of them are classified `FILL_NOW` by rule-v1.
- Pick 10 known peak days; assert ≥70% are `WAIT_FOR_DROP`.
- These are *not* hard CI gates (data is noisy), but they live as a `vitest` suite tagged `slow` and run pre-release.

### 9.5 Property tests (nice-to-have)

- Adding a single noisy station to an otherwise-flat series should not flip a `HOLD` to `FILL_NOW`.
- Removing one day in the middle should not change today's classification by more than one state.

---

## 10. Surface contracts

These are contracts SP-3 (UX core) consumes. **No UI is built in this spec.**

### 10.1 Server query API

`src/lib/cycle/queries.ts`:

```
getSignal(suburbKey, fuelTypeId): Promise<CycleSignalView | null>
  — returns the most recent (computed_at) row for today; null if none.
  — 'today' resolved in Australia/Brisbane (or relevant state TZ).

getSignalForStation(stationId, fuelTypeId): Promise<CycleSignalView>
  — convenience: looks up station.suburb, falls back to postcode-level
    if suburb is UNCERTAIN, then to state-wide median if both UNCERTAIN.

getRecentSignals(suburbKey, fuelTypeId, days = 30): Promise<CycleSignalView[]>
  — for charts / debugging.
```

`CycleSignalView` is the wire shape:

```ts
{
  state:        'FILL_NOW' | 'HOLD' | 'WAIT_FOR_DROP' | 'UNCERTAIN',
  label:        string,                  // "Cycle low" | "Hold steady" | "Prices likely to fall" | "Not enough data"
  confidence:   number,                  // 0..1
  suburb:       string,                  // display name
  fuelTypeId:   number,
  computedFor:  string,                  // ISO date
  supporting: {
    todayMedianCents: number,
    cheapestNowCents: number,
    windowMinCents:   number,
    windowMaxCents:   number,
    slope3dCents:     number,
    stationCountAvg:  number,
    daysWithData:     number,
  }
}
```

### 10.2 What the chip renders

For each state, SP-3 renders one of:

| State | Chip text (suggested) | Tooltip |
|---|---|---|
| `FILL_NOW` | **"Fill now — *Suburb* at cycle low"** | "Cheapest is X¢ below median. 14d range: Y¢ → Z¢." |
| `HOLD` | "Steady — no rush in *Suburb*" | "Prices flat over last 14 days." |
| `WAIT_FOR_DROP` | "Wait if you can — *Suburb* near peak" | "Median near 14d high. Confidence X." |
| `UNCERTAIN` | "Not enough data for *Suburb*" | (no tooltip; show postcode fallback if available) |

SP-3 owns visual treatment, accessibility, copy polish. SP-4 only guarantees the data and a sensible default `label`.

### 10.3 What the station card badge renders

A small inline state pill ("FILL NOW", "WAIT", or none if `HOLD`/`UNCERTAIN`). Driven by `getSignalForStation(station.id, currentFuelTypeId)`. The badge is a hint about the *suburb* the station is in — it does not predict that specific station's price.

### 10.4 Alert hook (SP-5)

SP-5 reads `cycle_signals` directly. The alert evaluator looks for rows where:

```
new_today.state = 'FILL_NOW'
AND yesterday.state IN ('HOLD', 'WAIT_FOR_DROP', 'UNCERTAIN', NULL)
```

…then dispatches to users whose `home_suburb_key` matches. Phase A is responsible for *producing* the rows reliably; SP-5 owns the dispatch.

---

## 11. Phase B forward-compatibility (out of scope, noted)

Phase B replaces rule-v1 with a statistical forecast (ARIMA / Prophet) per `(city, fuel_type)`, producing a 7-day forecast with CI. To stay drop-in compatible:

- The `cycle_signals` schema is unchanged. Phase B writes `algo_version = 'forecast-v1'`.
- The query layer (`getSignal`, `getSignalForStation`) **MUST** prefer the highest-priority `algo_version` per `(suburb_key, fuel_type_id, computed_for)`. A small priority map (`forecast-v1 > rule-v1`) lives in `src/lib/cycle/config.ts`.
- During Phase B rollout, both algos run in parallel; the chip serves whichever the priority map dictates, and accuracy is compared offline using the backfilled rule-v1 rows as a baseline.
- The `confidence` field is reused (Phase B fills it from the forecast CI width).
- `supporting` gains optional fields (`forecast_7d_cents`, `forecast_ci_low`, `forecast_ci_high`); existing consumers must tolerate unknown keys — already the JSON-blob convention.

This means SP-3 and SP-5 never need to be re-wired when Phase B ships.

---

## 12. Operational concerns

- **Cost:** nightly job is a single SQL aggregation per suburb-fuel pair; trivial. Intraday post-hook is bounded by suburbs-touched-this-scrape.
- **Observability:** add to `scrape_health` (or a sibling `cycle_health` table) one row per nightly run: rows written, suburbs UNCERTAIN, duration. Surface in the existing `/api/health` endpoint.
- **Failure mode:** if the nightly job fails, the chip falls back to "yesterday's" signal (still served from `cycle_signals`) and shows a small "as of $date" stamp. SP-3 should handle this gracefully.
- **Data deletion:** retention on `cycle_signals` is unbounded for now (rows are tiny and useful for accuracy validation). Revisit at 12-month mark.
- **Env vars:** none new.

---

## 13. Open questions

| # | Question | Recommended default | Status |
|---|---|---|---|
| 1 | Suburb-key namespacing across states (e.g. "Richmond" exists in NSW and QLD) | `lower(suburb) + '|' + lower(state)`. Display name kept separately. | Decision pending — confirm during SP-1 national adapter design. |
| 2 | Postcode-level fallback for sparse suburbs — same algo, or a different one? | Same algo, same thresholds, just with `postcode` as the key. Computed lazily on cache-miss. | Decision pending. |
| 3 | Should `FILL_NOW` consider *cheapest station distance from user*? (i.e. require the cheap station to be within X km of home) | No — that's an SP-3 / SP-7 concern. SP-4 is suburb-scoped only. | Recommended firm. |
| 4 | Holiday calendar adjustment | Defer to rule-v2 once we have post-launch data showing it matters. | Recommended firm. |
| 5 | Should `UNCERTAIN` ever fire `cycle_low` alerts? | Never. SP-5 contract: only `FILL_NOW` triggers. | Recommended firm. |
| 6 | Algo versioning surfaced to user? | No — internal only. Tooltip just says "based on 14-day suburb data". | Recommended firm. |
| 7 | Backfill horizon — how far back? | All available `price_readings`. For QLD beta that's ~6 months; cheap. | Recommended firm. |
| 8 | Tunable thresholds editable at runtime, or compile-time? | Compile-time constants in `config.ts` for v1; consider env-overrides post-launch if we need to tune without redeploys. | Decision pending. |
| 9 | Should the chip respect the user's *current* fuel type filter, or their saved preferred fuel? | Current filter (matches what the rest of the dashboard shows). Saved preferred fuel is for *alerts*, not the chip. | Recommended firm. |

None of the "decision pending" items block implementation start; they can be resolved during SP-4 build with low cost to revisit.

---

## 14. Definition of done

- [ ] `cycle_signals` table + migration shipped.
- [ ] `src/lib/cycle/{detect,config,queries,backfill,scheduler}.ts` implemented.
- [ ] Nightly + post-scrape jobs wired into `instrumentation.ts`.
- [ ] Backfill run for all historical QLD data.
- [ ] Unit tests cover all 4 states + 2 UNCERTAIN paths; all green.
- [ ] Integration test green against test DB.
- [ ] Real-data validation suite green at ≥70% on hand-labelled trough/peak days.
- [ ] `getSignal`, `getSignalForStation`, `getRecentSignals` documented and consumed by at least one stub in SP-3.
- [ ] `/api/health` reports last successful cycle compute timestamp.
