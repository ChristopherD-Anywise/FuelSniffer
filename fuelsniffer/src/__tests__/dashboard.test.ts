/**
 * Tests for DASH-01, DASH-02, DASH-03: filter logic, sort, stale detection.
 * Run: npx vitest run src/__tests__/dashboard.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isStale, sortStations } from '@/lib/dashboard-utils'

const MINUTE = 60_000

describe('isStale()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T06:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('returns false when recordedAt is 30 minutes ago', () => {
    const recordedAt = new Date('2026-03-23T05:30:00Z')
    expect(isStale(recordedAt)).toBe(false)
  })
  it('returns true when recordedAt is 61 minutes ago', () => {
    const recordedAt = new Date('2026-03-23T04:59:00Z')
    expect(isStale(recordedAt)).toBe(true)
  })
  it('returns false exactly at 60 minutes (boundary is exclusive)', () => {
    const recordedAt = new Date('2026-03-23T05:00:00Z')
    expect(isStale(recordedAt)).toBe(false)
  })
})

describe('sortStations()', () => {
  const base = { id: 1, name: 'S', brand: null, address: null, suburb: null,
                 latitude: 0, longitude: 0, recorded_at: new Date(),
                 source_ts: new Date(), price_change: 0 }
  it('sorts by price_cents ascending when sort=price', () => {
    const input = [
      { ...base, price_cents: '150.0', distance_km: 5 },
      { ...base, price_cents: '140.0', distance_km: 10 },
    ]
    const result = sortStations(input, 'price')
    expect(result[0].price_cents).toBe('140.0')
  })
  it('sorts by distance_km ascending when sort=distance', () => {
    const input = [
      { ...base, price_cents: '150.0', distance_km: 10 },
      { ...base, price_cents: '140.0', distance_km: 2 },
    ]
    const result = sortStations(input, 'distance')
    expect(result[0].distance_km).toBe(2)
  })
})
