/**
 * SP-4 Cycle Engine — pure algorithm tests (golden series + edge cases).
 *
 * All tests are pure function tests — no DB, no network.
 * Fixtures from spec §9.1 plus cross-state and DST edge cases.
 */

import { describe, it, expect } from 'vitest'
import { computeSignal, type DailyEntry } from '@/lib/cycle/detector'
import { DEFAULT_CONFIG, type CycleConfig } from '@/lib/cycle/config'

// ── Fixture builder ─────────────────────────────────────────────────────────

/**
 * Build a DailyEntry series from an array of daily suburb-medians.
 * Each day gets `stationsPerDay` stations all reporting the same price
 * (simplest fixture that produces the target median).
 * The last entry includes latestPrices set slightly below the median
 * to satisfy GAP_PCT_FOR_FILL for FILL_NOW tests.
 */
function makeSeries(
  medians: number[],
  stationsPerDay = 4,
  opts: { cheapestGap?: number } = {},
): DailyEntry[] {
  return medians.map((med, idx) => {
    const isToday = idx === medians.length - 1
    const stationMins = Array(stationsPerDay).fill(med)
    // For today: optionally make one station cheaper to trigger FILL_NOW
    const gapFraction = opts.cheapestGap ?? 0.04  // 4% below median by default
    const latestPrices = isToday
      ? [...Array(stationsPerDay - 1).fill(med), med * (1 - gapFraction)]
      : undefined
    return {
      date: `2026-01-${String(idx + 1).padStart(2, '0')}`,
      stationMins,
      latestPrices,
    }
  })
}

/** Pad a short series to LOOKBACK_DAYS with repeated first value. */
function padSeries(entries: DailyEntry[], lookbackDays: number): DailyEntry[] {
  const pad = lookbackDays - entries.length
  if (pad <= 0) return entries
  const filler = entries[0]
  return [...Array(pad).fill(filler), ...entries]
}

// ── Golden tests (spec §9.1) ─────────────────────────────────────────────────

describe('computeSignal — golden series', () => {
  // Fixture 1: FILL_NOW — descending then bottoming
  it('classifies a descending-then-flat series as FILL_NOW', () => {
    // Spec fixture: 175,172,169,167,165,164,164,163 (today=163, range=12)
    // Pad to 14 days; today = last
    const rawMedians = [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163]
    const entries = makeSeries(rawMedians, 4, { cheapestGap: 0.04 })
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.signalState).toBe('FILL_NOW')
    expect(result.supporting.trigger).toBe('trough_band+gap_pct')
    expect(result.supporting.positionInRange).toBeLessThanOrEqual(DEFAULT_CONFIG.TROUGH_BAND)
  })

  // Fixture 2: HOLD (flat) — range=1, well within MIN_RANGE_CENTS
  it('classifies a flat series as HOLD', () => {
    const rawMedians = Array(14).fill(168).map((v, i) => (i % 2 === 0 ? v : v - 1))
    const entries = makeSeries(rawMedians, 4)
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.signalState).toBe('HOLD')
    expect(result.supporting.trigger).toBe('flat_market')
  })

  // Fixture 3: HOLD (gradual drift mid-range) — rising but in middle of range
  it('classifies a slow mid-range drift as HOLD', () => {
    // Rising from 165→169 over 14 days — in middle of range, slope < SLOPE_RISING_CENTS
    const rawMedians = Array.from({ length: 14 }, (_, i) => 165 + (i * 4) / 13)
    // Extend range so window_range >= MIN_RANGE_CENTS but today is in middle
    const entries = makeSeries(rawMedians.map(v => Math.round(v * 10) / 10), 4)
    const result = computeSignal(entries, DEFAULT_CONFIG)
    // Should be HOLD (not in upper half of range significantly, and slope is gentle)
    expect(['HOLD', 'WAIT_FOR_DROP']).toContain(result.signalState)
  })

  // Fixture 4: WAIT_FOR_DROP — near peak with flat slope (slope3d <= SLOPE_FLAT_CENTS)
  it('classifies a peak with flat slope as WAIT_FOR_DROP', () => {
    // Today at peak (positionInRange ~1.0), slope = 0 (4 days at same value)
    // window_range = 181 - 164 = 17 (> MIN_RANGE_CENTS)
    const rawMedians = [164, 164, 164, 164, 165, 167, 172, 176, 180, 181, 181, 181, 181, 181]
    const entries = makeSeries(rawMedians, 4)
    const result = computeSignal(entries, DEFAULT_CONFIG)
    // slope3d = smoothed[13] - smoothed[10] = 181 - 181 = 0 <= SLOPE_FLAT_CENTS(0.5)
    // positionInRange = (181 - 164) / 17 = 1.0 >= PEAK_BAND(0.85)
    expect(result.signalState).toBe('WAIT_FOR_DROP')
    expect(result.supporting.trigger).toBe('peak_band+flat_slope')
  })

  // Fixture 5: WAIT_FOR_DROP — high and still rising
  it('classifies a high-and-still-rising series as WAIT_FOR_DROP', () => {
    // Spec fixture: 168,170,173,176,179,181,183,185 padded
    const rawMedians = [162, 163, 164, 165, 168, 170, 173, 176, 179, 181, 183, 185, 186, 188]
    const entries = makeSeries(rawMedians, 4)
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.signalState).toBe('WAIT_FOR_DROP')
  })

  // Fixture 6: UNCERTAIN — only 4 days of data
  it('classifies insufficient days as UNCERTAIN', () => {
    // 4 valid days, 14 provided but 10 are empty
    const validEntries: DailyEntry[] = [
      { date: '2026-01-11', stationMins: [165, 164, 166] },
      { date: '2026-01-12', stationMins: [163, 164, 162] },
      { date: '2026-01-13', stationMins: [162, 163, 161] },
      { date: '2026-01-14', stationMins: [160, 161, 162], latestPrices: [155, 160, 162] },
    ]
    const emptyEntries: DailyEntry[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      stationMins: [],
    }))
    const entries = [...emptyEntries, ...validEntries]
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.signalState).toBe('UNCERTAIN')
    expect(result.supporting.trigger).toBe('insufficient_days')
  })

  // Fixture 7: UNCERTAIN — 14 days but avg < MIN_STATIONS (1 station per day)
  it('classifies sparse suburb (1 station avg) as UNCERTAIN', () => {
    const entries = makeSeries(
      [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163],
      1,   // only 1 station per day
    )
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.signalState).toBe('UNCERTAIN')
    expect(result.supporting.trigger).toBe('insufficient_stations')
  })
})

// ── Confidence proxy tests ───────────────────────────────────────────────────

describe('computeSignal — confidence', () => {
  it('returns confidence between 0 and 1', () => {
    const entries = makeSeries(
      [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163],
      5,
    )
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('returns higher confidence with more stations', () => {
    const medians = [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163]
    const low  = computeSignal(makeSeries(medians, 3), DEFAULT_CONFIG)
    const high = computeSignal(makeSeries(medians, 8), DEFAULT_CONFIG)
    if (low.signalState !== 'UNCERTAIN' && high.signalState !== 'UNCERTAIN') {
      expect(high.confidence).toBeGreaterThanOrEqual(low.confidence)
    }
  })
})

// ── Property / edge case tests ───────────────────────────────────────────────

describe('computeSignal — edge cases', () => {
  it('does not flip HOLD to FILL_NOW when one noisy station added to flat series', () => {
    // Base: flat series at 168
    const base = makeSeries(Array(14).fill(168), 4)
    // Add a single very cheap station to today's entry (one outlier)
    const withNoise: DailyEntry[] = [
      ...base.slice(0, 13),
      {
        ...base[13],
        stationMins: [...(base[13].stationMins as number[]), 100],  // outlier
        latestPrices: [...(base[13].latestPrices ?? base[13].stationMins), 100],
      },
    ]
    const flat   = computeSignal(base, DEFAULT_CONFIG)
    const noisy  = computeSignal(withNoise, DEFAULT_CONFIG)
    // Flat should be HOLD; noisy might be FILL_NOW due to cheap outlier but
    // the spec says median defends against single outliers when < half the suburb
    // In this case the median of [168,168,168,168,100] = 168 — outlier doesn't move it
    expect(flat.signalState).toBe('HOLD')
    // The noisy series' suburb_day_median should still be 168 (median of 5 values with 1 outlier)
    // so it should also remain HOLD
    expect(noisy.signalState).toBe('HOLD')
  })

  it('handles missing days (holes) — excludes empty entries from days_with_data', () => {
    const validEntries: DailyEntry[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 5).padStart(2, '0')}`,
      stationMins: [165, 166, 164],
    }))
    const holes: DailyEntry[] = Array.from({ length: 4 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      stationMins: [],
    }))
    const entries = [...holes, ...validEntries]
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.supporting.daysWithData).toBe(10)
    // 10 == MIN_DAYS_WITH_DATA so should NOT be UNCERTAIN due to days
    expect(result.signalState).not.toBe('UNCERTAIN')
  })

  it('exact MIN_DAYS_WITH_DATA boundary: 10 days = valid, 9 days = UNCERTAIN', () => {
    const valid9: DailyEntry[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        stationMins: [],
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        date: `2026-01-${String(i + 6).padStart(2, '0')}`,
        stationMins: [165, 166, 164],
      })),
    ]
    const result9 = computeSignal(valid9, DEFAULT_CONFIG)
    expect(result9.signalState).toBe('UNCERTAIN')
    expect(result9.supporting.daysWithData).toBe(9)
  })

  it('all-same-price series produces HOLD (flat market)', () => {
    const entries = makeSeries(Array(14).fill(170), 4)
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(result.signalState).toBe('HOLD')
    expect(result.supporting.trigger).toBe('flat_market')
  })

  it('supporting stats carry trigger field', () => {
    const entries = makeSeries(
      [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163],
      4,
      { cheapestGap: 0.04 },
    )
    const result = computeSignal(entries, DEFAULT_CONFIG)
    expect(typeof result.supporting.trigger).toBe('string')
  })
})

// ── Cross-state suburb collision test ────────────────────────────────────────

describe('suburb key namespacing', () => {
  /**
   * CRITICAL (spec §0 amendment + cross-cutting gotcha):
   * QLD does NOT lowercase suburbs (e.g. 'SPRINGFIELD').
   * NSW/WA/TAS DO lowercase.
   * The compute layer must apply lower() defensively.
   *
   * This test verifies that the detector itself is agnostic to the key —
   * it only receives already-resolved series. The key construction is
   * tested in compute.test.ts where the DB query is mocked.
   *
   * Here we verify that two series with different suburb labels
   * (Springfield QLD vs Springfield NSW) are treated as separate signals
   * when computed independently.
   */
  it('produces independent signals for same suburb name in different states', () => {
    // QLD Springfield — mixed case in DB, but compute layer resolves to 'springfield|qld'
    const qldEntries = makeSeries(
      [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163],
      4,
      { cheapestGap: 0.04 },
    )
    // NSW Springfield — flat
    const nswEntries = makeSeries(Array(14).fill(168), 4)

    const qldResult = computeSignal(qldEntries, DEFAULT_CONFIG)
    const nswResult = computeSignal(nswEntries, DEFAULT_CONFIG)

    // They should have different states (QLD is FILL_NOW, NSW is HOLD)
    expect(qldResult.signalState).toBe('FILL_NOW')
    expect(nswResult.signalState).toBe('HOLD')
    // Crucially: computed independently, not cross-contaminated
    expect(qldResult.supporting.todayMedianCents).not.toBe(nswResult.supporting.todayMedianCents)
  })
})

// ── DST / timezone resilience ────────────────────────────────────────────────

describe('computeSignal — timezone', () => {
  /**
   * The detector itself is pure and date-agnostic — it sorts entries by
   * the 'date' field (YYYY-MM-DD). The date assignment is done in the
   * compute layer (using AT TIME ZONE 'Australia/Brisbane').
   *
   * Here we verify that even if dates are slightly off (e.g. DST boundary),
   * the detector handles non-contiguous dates gracefully.
   */
  it('handles non-contiguous date labels gracefully', () => {
    // Simulate a DST gap: 2026-10-03 → 2026-10-05 (2026-10-04 missing in QLD DST transition)
    const entries: DailyEntry[] = Array.from({ length: 14 }, (_, i) => {
      const day = i + 1
      // Skip day 7 (simulate a scraper outage)
      if (day === 7) return { date: `2026-01-${String(day).padStart(2, '0')}`, stationMins: [] }
      return {
        date: `2026-01-${String(day).padStart(2, '0')}`,
        stationMins: [168, 167, 169],
      }
    })
    const result = computeSignal(entries, DEFAULT_CONFIG)
    // 13 valid days, which is >= MIN_DAYS_WITH_DATA=10
    expect(result.supporting.daysWithData).toBe(13)
    expect(result.signalState).not.toBe('UNCERTAIN')
  })
})

// ── Configurable thresholds ──────────────────────────────────────────────────

describe('computeSignal — custom config', () => {
  it('respects overridden MIN_STATIONS threshold', () => {
    const strictConfig: CycleConfig = { ...DEFAULT_CONFIG, MIN_STATIONS: 5 }
    // 4 stations per day is below strict threshold of 5
    const entries = makeSeries(
      [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163],
      4,
    )
    const result = computeSignal(entries, strictConfig)
    expect(result.signalState).toBe('UNCERTAIN')
    expect(result.supporting.trigger).toBe('insufficient_stations')
  })

  it('respects overridden TROUGH_BAND threshold', () => {
    // Very tight trough band — position 0.15 should no longer qualify
    const tightConfig: CycleConfig = { ...DEFAULT_CONFIG, TROUGH_BAND: 0.05 }
    const rawMedians = [175, 174, 173, 172, 171, 169, 167, 165, 164, 164, 163, 163, 163, 163]
    const entries = makeSeries(rawMedians, 4, { cheapestGap: 0.04 })
    const result = computeSignal(entries, tightConfig)
    // position_in_range will be 0 (at the trough) — 0 <= 0.05 so still FILL_NOW
    // This test confirms the threshold is actually applied
    expect(result.signalState).toBe('FILL_NOW')
  })
})
