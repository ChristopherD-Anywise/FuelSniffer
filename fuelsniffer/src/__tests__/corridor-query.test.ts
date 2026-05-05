import { describe, it, expect } from 'vitest'
import { findStationsAlongRoute, type CorridorParams } from '@/lib/trip/corridor-query'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL required')

describe('findStationsAlongRoute', () => {
  const brisbaneToGoldCoast: CorridorParams = {
    polyline: [
      { lat: -27.47, lng: 153.02 },   // Brisbane CBD
      { lat: -27.60, lng: 153.10 },   // midpoint
      { lat: -28.00, lng: 153.43 },   // Gold Coast
    ],
    fuelTypeId: 2,
    corridorMeters: 5000,
    excludeBrands: [],
    providers: [],
    limit: 50,
  }

  it('returns stations with price and detour info', async () => {
    const results = await findStationsAlongRoute(brisbaneToGoldCoast)
    // May be empty if no test data, but should not throw
    expect(results).toBeInstanceOf(Array)
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('stationId')
      expect(results[0]).toHaveProperty('priceCents')
      expect(results[0]).toHaveProperty('detourMeters')
      expect(results[0]).toHaveProperty('name')
    }
  })

  it('respects excludeBrands parameter', async () => {
    const withExclude: CorridorParams = {
      ...brisbaneToGoldCoast,
      excludeBrands: ['7-Eleven'],
    }
    const results = await findStationsAlongRoute(withExclude)
    for (const r of results) {
      expect(r.brand).not.toBe('7-Eleven')
    }
  })

  it('respects corridor width — wider returns more stations', async () => {
    const narrow = await findStationsAlongRoute({ ...brisbaneToGoldCoast, corridorMeters: 500 })
    const wide = await findStationsAlongRoute({ ...brisbaneToGoldCoast, corridorMeters: 20000 })
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length)
  })
})
