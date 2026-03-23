/**
 * Tests for DASH-01, DASH-02, DASH-03: filter logic, sort, stale detection.
 * Run: npx vitest run src/__tests__/dashboard.test.ts
 */
import { describe, it, expect } from 'vitest'

describe('isStale()', () => {
  it.todo('returns true when recordedAt is more than 60 minutes ago')
  it.todo('returns false when recordedAt is less than 60 minutes ago')
})

describe('sortStations()', () => {
  it.todo('sorts by price_cents ascending by default')
  it.todo('sorts by distance_km ascending when sort=distance')
})
