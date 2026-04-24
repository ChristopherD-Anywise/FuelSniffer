/**
 * T-TEST-2 — Sort/filter unit tests.
 *
 * Pure functions — no DOM, no mocks needed.
 */

import { describe, it, expect } from 'vitest'
import { sortStations, filterStations, computeSaving, computeTripCost } from '@/lib/trip/sort-filter'
import type { CorridorStation } from '@/lib/trip/corridor-query'
import type { CycleSignalView } from '@/lib/cycle/types'

function makeStation(
  id: number,
  priceCents: number,
  detourMeters: number,
  brand = 'Shell',
  verdictState?: CycleSignalView['state'] | null,
): CorridorStation {
  const verdict: CycleSignalView | null = verdictState
    ? {
        state: verdictState,
        label: verdictState,
        confidence: 0.8,
        suburb: 'TestSuburb',
        suburbKey: 'testsuburb|qld',
        fuelTypeId: 2,
        computedFor: '2026-04-24',
        computedAt: '2026-04-24T10:00:00Z',
        algoVersion: 'rule-v1',
        supporting: {
          windowMinCents: 1500,
          windowMaxCents: 2100,
          todayMedianCents: 1800,
          cheapestNowCents: 1700,
          positionInRange: 0.5,
          slope3dCents: 0,
          stationCountAvg: 10,
          daysWithData: 14,
        },
      }
    : null

  return {
    stationId: id,
    externalId: `ext-${id}`,
    sourceProvider: 'qld',
    name: `Station ${id}`,
    brand,
    address: null,
    suburb: 'Brisbane',
    latitude: -27.47,
    longitude: 153.02,
    // priceCents is stored as a float c/L (e.g. 197.9 = 197.9¢/L)
    priceCents,
    fuelTypeId: 2,
    detourMeters,
    verdict: verdict ?? undefined,
  }
}

// NOTE: priceCents is a float c/L (e.g. 200.0 = 200.0¢/L), not an integer.
describe('sortStations — effective_price', () => {
  it('sorts ascending by priceCents when no effectivePriceCents', () => {
    const stations = [
      makeStation(1, 200.0, 500),
      makeStation(2, 180.0, 1000),
      makeStation(3, 195.0, 200),
    ]
    const result = sortStations(stations, 'effective_price')
    expect(result.map(s => s.stationId)).toEqual([2, 3, 1])
  })

  it('breaks price ties by detour (shorter detour wins)', () => {
    const stations = [
      makeStation(1, 190.0, 1000),
      makeStation(2, 190.0, 500),
    ]
    const result = sortStations(stations, 'effective_price')
    expect(result[0].stationId).toBe(2) // shorter detour
  })

  it('uses effectivePriceCents when present', () => {
    const s1 = { ...makeStation(1, 200.0, 100), effectivePriceCents: 196.0 }
    const s2 = makeStation(2, 198.0, 100)
    const result = sortStations([s1, s2], 'effective_price')
    expect(result[0].stationId).toBe(1) // 196.0 < 198.0
  })

  it('null effectivePriceCents falls back to pylon in sort', () => {
    const s1 = { ...makeStation(1, 180.0, 100), effectivePriceCents: undefined }
    const s2 = makeStation(2, 190.0, 100)
    const result = sortStations([s1, s2], 'effective_price')
    expect(result[0].stationId).toBe(1) // fallback to 180.0 < 190.0
  })
})

describe('sortStations — detour_minutes', () => {
  it('sorts ascending by detourMeters', () => {
    const stations = [
      makeStation(1, 200.0, 2000),
      makeStation(2, 180.0, 500),
      makeStation(3, 195.0, 1000),
    ]
    const result = sortStations(stations, 'detour_minutes')
    expect(result.map(s => s.stationId)).toEqual([2, 3, 1])
  })

  it('breaks detour ties by effective price', () => {
    const stations = [
      makeStation(1, 200.0, 500),
      makeStation(2, 180.0, 500),
    ]
    const result = sortStations(stations, 'detour_minutes')
    expect(result[0].stationId).toBe(2) // cheaper
  })
})

describe('sortStations — verdict', () => {
  it('FILL_NOW first, then HOLD, WAIT_FOR_DROP, UNCERTAIN, then null', () => {
    const stations = [
      makeStation(1, 200.0, 100, 'Shell', 'UNCERTAIN'),
      makeStation(2, 200.0, 100, 'Shell', 'WAIT_FOR_DROP'),
      makeStation(3, 200.0, 100, 'Shell', 'FILL_NOW'),
      makeStation(4, 200.0, 100, 'Shell', null),
      makeStation(5, 200.0, 100, 'Shell', 'HOLD'),
    ]
    const result = sortStations(stations, 'verdict')
    expect(result.map(s => s.stationId)).toEqual([3, 5, 2, 1, 4])
  })
})

describe('filterStations — brand', () => {
  it('returns all stations when brands array is empty', () => {
    const stations = [makeStation(1, 190.0, 100, 'Shell'), makeStation(2, 190.0, 100, '7-Eleven')]
    expect(filterStations(stations, { brands: [], verdict: null })).toHaveLength(2)
  })

  it('filters to only matching brands', () => {
    const stations = [
      makeStation(1, 190.0, 100, 'Shell'),
      makeStation(2, 190.0, 100, '7-Eleven'),
      makeStation(3, 190.0, 100, 'BP'),
    ]
    const result = filterStations(stations, { brands: ['Shell', 'BP'], verdict: null })
    expect(result.map(s => s.stationId)).toEqual([1, 3])
  })
})

describe('filterStations — verdict', () => {
  it('returns all when verdict is null', () => {
    const stations = [
      makeStation(1, 190.0, 100, 'Shell', 'FILL_NOW'),
      makeStation(2, 190.0, 100, 'Shell', 'HOLD'),
    ]
    expect(filterStations(stations, { brands: [], verdict: null })).toHaveLength(2)
  })

  it('filters to FILL_NOW only', () => {
    const stations = [
      makeStation(1, 190.0, 100, 'Shell', 'FILL_NOW'),
      makeStation(2, 190.0, 100, 'Shell', 'HOLD'),
      makeStation(3, 190.0, 100, 'Shell', null),
    ]
    const result = filterStations(stations, { brands: [], verdict: 'FILL_NOW' })
    expect(result.map(s => s.stationId)).toEqual([1])
  })
})

describe('computeSaving', () => {
  it('returns saving in dollars when >= $0.50', () => {
    // worstEffective=200.0¢, thisEffective=195.0¢, tankSize=50L
    // saving = (200.0-195.0)*50/100 = 5*50/100 = $2.50
    const result = computeSaving(195.0, 200.0, 50)
    expect(result).toBeCloseTo(2.50)
  })

  it('returns null when saving < $0.50', () => {
    // (200.0 - 199.0) * 50 / 100 = 1 * 50 / 100 = $0.50 → shown
    expect(computeSaving(199.0, 200.0, 50)).toBeCloseTo(0.50)
    // Below threshold: (200.0 - 199.5) * 50 / 100 = 0.5 * 50 / 100 = $0.25
    expect(computeSaving(199.5, 200.0, 50)).toBeNull()
  })

  it('returns null when both prices are equal', () => {
    expect(computeSaving(200.0, 200.0, 50)).toBeNull()
  })
})

describe('computeTripCost', () => {
  it('computes cost for a 100km trip at 8L/100km, 50L tank, 200.0¢/L', () => {
    // fuelNeeded = min(100 * 8 / 100, 50) = 8 L
    // cost = 8 * 200.0 / 100 = $16.00
    const cost = computeTripCost(100, 8, 50, 200.0)
    expect(cost).toBeCloseTo(16.00)
  })

  it('caps fuel at tank size', () => {
    // 1000km * 8L/100km = 80L, but tank = 50L → capped at 50
    const cost = computeTripCost(1000, 8, 50, 200.0)
    expect(cost).toBeCloseTo(50 * 200.0 / 100) // $100
  })

  it('handles short trip', () => {
    // 10km * 6.5L/100km = 0.65L at 190.0¢/L
    const cost = computeTripCost(10, 6.5, 50, 190.0)
    expect(cost).toBeCloseTo(0.65 * 190.0 / 100)
  })
})
