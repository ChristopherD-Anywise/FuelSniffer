/**
 * SP-4 Cycle Engine — pure algorithm (no DB dependency).
 *
 * computeSignal() takes a daily price series and returns a classified signal.
 * All state is passed in; this module is freely unit-testable.
 *
 * Algorithm spec: docs/superpowers/specs/2026-04-22-fillip-sp4-cycle-engine-design.md §3
 */

import type { CycleConfig } from './config'
import type { SignalState, SupportingStats } from './types'
import { SIGNAL_LABELS } from './types'

/**
 * One day's data for a suburb+fuel pair.
 * stationMins: one entry per station with data that day (the station's daily min price in cents).
 * latestPrices: optional — only needed for today's entry to compute cheapest_now.
 */
export interface DailyEntry {
  date: string           // YYYY-MM-DD (used for ordering and debug; series is sorted ascending)
  stationMins: number[]  // array of per-station daily-minimum price_cents values
  latestPrices?: number[] // latest prices per station today (for cheapest_now); today only
  cheapestStationId?: number
}

export interface DetectorResult {
  signalState:  SignalState
  confidence:   number
  label:        string
  supporting:   SupportingStats
}

/** Compute the median of a numeric array. Returns NaN for empty arrays. */
function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/** Clamp a value between min and max (inclusive). */
function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/**
 * Compute the trailing median over a window of size `windowSize`.
 * For index i, smoothed[i] = median of values[max(0, i-windowSize+1) .. i].
 */
function trailingMedian(values: number[], windowSize: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1)
    return median(values.slice(start, i + 1))
  })
}

/**
 * Main entry point.
 *
 * @param entries  Array of daily entries, sorted ascending by date.
 *                 Must span at least config.MIN_DAYS_WITH_DATA days to avoid UNCERTAIN.
 *                 The LAST entry is treated as "today".
 * @param config   CycleConfig with all thresholds.
 * @returns        DetectorResult with state, confidence, label, and supporting stats.
 */
export function computeSignal(
  entries: DailyEntry[],
  config: CycleConfig,
): DetectorResult {
  // ── Step 1: Filter to days with at least one station reading ───────────────
  const validEntries = entries.filter(e => e.stationMins.length > 0)
  const daysWithData = validEntries.length

  // Compute station_count_avg across all valid days
  const stationCountAvg = daysWithData > 0
    ? validEntries.reduce((sum, e) => sum + e.stationMins.length, 0) / daysWithData
    : 0

  // ── Guard: insufficient data ────────────────────────────────────────────────
  if (daysWithData < config.MIN_DAYS_WITH_DATA) {
    return makeResult('UNCERTAIN', 0, {
      windowMinCents:   0,
      windowMaxCents:   0,
      todayMedianCents: 0,
      cheapestNowCents: 0,
      positionInRange:  0,
      slope3dCents:     0,
      stationCountAvg,
      daysWithData,
      trigger:          'insufficient_days',
    })
  }

  if (stationCountAvg < config.MIN_STATIONS) {
    return makeResult('UNCERTAIN', 0, {
      windowMinCents:   0,
      windowMaxCents:   0,
      todayMedianCents: 0,
      cheapestNowCents: 0,
      positionInRange:  0,
      slope3dCents:     0,
      stationCountAvg,
      daysWithData,
      trigger:          'insufficient_stations',
    })
  }

  // ── Step 2: Daily series ────────────────────────────────────────────────────
  // suburb_day_median[i] = median of station daily-mins for day i
  const suburbDayMedians = validEntries.map(e => median(e.stationMins))

  // ── Step 3: Smoothed series (trailing median) ───────────────────────────────
  const smoothed = trailingMedian(suburbDayMedians, config.SMOOTH_WINDOW)

  // ── Step 4: Window statistics ───────────────────────────────────────────────
  const windowMin   = Math.min(...smoothed)
  const windowMax   = Math.max(...smoothed)
  const windowRange = windowMax - windowMin

  const todayIdx          = smoothed.length - 1
  const todaySmoothed     = smoothed[todayIdx]
  const todayRawMedian    = suburbDayMedians[todayIdx]

  // "today" entry for cheapest_now
  const todayEntry = validEntries[todayIdx]
  const cheapestPrices = todayEntry.latestPrices && todayEntry.latestPrices.length > 0
    ? todayEntry.latestPrices
    : todayEntry.stationMins
  const cheapestNow = Math.min(...cheapestPrices)
  const cheapestStationId = todayEntry.cheapestStationId

  // ── Step 5: Derived metrics ─────────────────────────────────────────────────

  // position_in_range: 0.0 = at trough, 1.0 = at peak
  const positionInRange = windowRange > 0
    ? (todaySmoothed - windowMin) / windowRange
    : 0.5

  // cheapest_gap_pct: how much cheaper is the cheapest station vs suburb median
  const cheapestGapPct = todayRawMedian > 0
    ? (todayRawMedian - cheapestNow) / todayRawMedian
    : 0

  // slope_3d: cents change over 3 days (positive = rising)
  const slope3dIdx = Math.max(0, todayIdx - 3)
  const slope3d = smoothed[todayIdx] - smoothed[slope3dIdx]

  // ── Step 6: Confidence proxy ────────────────────────────────────────────────
  const stationFactor  = clamp(stationCountAvg / 8.0, 0, 1)
  const coverageFactor = clamp(daysWithData / config.LOOKBACK_DAYS, 0, 1)
  const rangeFactor    = clamp(windowRange / 10.0, 0, 1)
  const confidence     = 0.4 * stationFactor + 0.4 * coverageFactor + 0.2 * rangeFactor

  const supporting: SupportingStats = {
    windowMinCents:    windowMin,
    windowMaxCents:    windowMax,
    todayMedianCents:  todayRawMedian,
    cheapestNowCents:  cheapestNow,
    ...(cheapestStationId !== undefined ? { cheapestStationId } : {}),
    positionInRange,
    slope3dCents:      slope3d,
    stationCountAvg,
    daysWithData,
  }

  // ── Step 7: Classification rules (first match wins) ─────────────────────────

  // Flat market → HOLD (not enough range to classify)
  if (windowRange < config.MIN_RANGE_CENTS) {
    return makeResult('HOLD', confidence, { ...supporting, trigger: 'flat_market' })
  }

  // FILL_NOW: at or near the trough AND there's a meaningfully cheap option
  if (
    positionInRange <= config.TROUGH_BAND &&
    cheapestGapPct  >= config.GAP_PCT_FOR_FILL
  ) {
    return makeResult('FILL_NOW', confidence, { ...supporting, trigger: 'trough_band+gap_pct' })
  }

  // WAIT_FOR_DROP: near the peak, slope flat or falling
  if (
    positionInRange >= config.PEAK_BAND &&
    slope3d         <= config.SLOPE_FLAT_CENTS
  ) {
    return makeResult('WAIT_FOR_DROP', confidence, { ...supporting, trigger: 'peak_band+flat_slope' })
  }

  // WAIT_FOR_DROP: still climbing and already in upper half of range
  if (
    positionInRange >= 0.6 &&
    slope3d         >= config.SLOPE_RISING_CENTS
  ) {
    return makeResult('WAIT_FOR_DROP', confidence, { ...supporting, trigger: 'upper_half+rising' })
  }

  // Default: no strong signal
  return makeResult('HOLD', confidence, { ...supporting, trigger: 'default' })
}

function makeResult(
  signalState: SignalState,
  confidence: number,
  supporting: SupportingStats,
): DetectorResult {
  return {
    signalState,
    confidence,
    label: SIGNAL_LABELS[signalState],
    supporting,
  }
}
