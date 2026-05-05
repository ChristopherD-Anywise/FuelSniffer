import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mswServer } from '@/lib/providers/routing/mapbox/__tests__/setup'

// Set token before importing the provider (it reads on construction)
process.env.MAPBOX_TOKEN = 'test-token-for-fixtures'

import { MapboxRoutingProvider, MapboxApiError } from '@/lib/providers/routing/mapbox'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

describe('MapboxRoutingProvider', () => {
  const provider = new MapboxRoutingProvider()

  it('returns a primary route for Brisbane → Gold Coast', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -28.00, lng: 153.43 },
      { alternatives: true, profile: 'driving' }
    )
    expect(result.primary).toBeDefined()
    expect(result.primary.polyline.length).toBeGreaterThan(10)
    expect(result.primary.distanceMeters).toBeGreaterThan(50000)
    expect(result.primary.durationSeconds).toBeGreaterThan(1800)
  })

  it('returns alternatives when available', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -28.00, lng: 153.43 },
      { alternatives: true, profile: 'driving' }
    )
    // Mapbox may or may not return alternatives for this route
    expect(result.alternatives).toBeInstanceOf(Array)
  })

  it('polyline coordinates are valid Australian lat/lng', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -28.00, lng: 153.43 },
      { alternatives: true, profile: 'driving' }
    )
    for (const coord of result.primary.polyline) {
      expect(coord.lat).toBeGreaterThan(-45)
      expect(coord.lat).toBeLessThan(-10)
      expect(coord.lng).toBeGreaterThan(110)
      expect(coord.lng).toBeLessThan(160)
    }
  })

  it('returns primary + alternatives with correct labels', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -28.00, lng: 153.43 },
      { alternatives: true, profile: 'driving' }
    )
    expect(result.primary.label).toBeUndefined()
    if (result.alternatives.length > 0) {
      expect(result.alternatives[0].label).toBe('Alternative 1')
    }
  })

  it('throws MapboxApiError for invalid coordinates', async () => {
    await expect(
      provider.route(
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0 },
        { alternatives: false, profile: 'driving' }
      )
    ).rejects.toThrow(MapboxApiError)
  })

  it('returns Brisbane → Toowoomba route', async () => {
    const result = await provider.route(
      { lat: -27.47, lng: 153.02 },
      { lat: -27.56, lng: 151.95 },
      { alternatives: false, profile: 'driving' }
    )
    expect(result.primary).toBeDefined()
    expect(result.primary.distanceMeters).toBeGreaterThan(100000)
    expect(result.alternatives).toBeInstanceOf(Array)
  })
})
