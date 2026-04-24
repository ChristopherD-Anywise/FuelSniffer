import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerRoutingProvider,
  getRoutingProvider,
  clearRoutingProviders,
  type RoutingProvider,
} from '@/lib/providers/routing'

function makeFake(id: string): RoutingProvider {
  return {
    id,
    displayName: `Fake ${id}`,
    route: async () => ({
      primary: { polyline: [], distanceMeters: 0, durationSeconds: 0 },
      alternatives: [],
    }),
  }
}

describe('Routing provider registry', () => {
  beforeEach(() => clearRoutingProviders())

  it('registers and retrieves', () => {
    registerRoutingProvider(makeFake('mapbox'))
    expect(getRoutingProvider('mapbox').id).toBe('mapbox')
  })

  it('getRoutingProvider() returns first if no id', () => {
    registerRoutingProvider(makeFake('mapbox'))
    expect(getRoutingProvider().id).toBe('mapbox')
  })

  it('throws on duplicate registration', () => {
    registerRoutingProvider(makeFake('mapbox'))
    expect(() => registerRoutingProvider(makeFake('mapbox'))).toThrow()
  })

  it('throws when no providers registered', () => {
    expect(() => getRoutingProvider()).toThrow('No routing providers')
  })

  it('throws when requested provider not found', () => {
    expect(() => getRoutingProvider('nonexistent')).toThrow("Routing provider 'nonexistent' not found")
  })

  it('clearRoutingProviders removes all providers', () => {
    registerRoutingProvider(makeFake('a'))
    registerRoutingProvider(makeFake('b'))
    clearRoutingProviders()
    expect(() => getRoutingProvider()).toThrow('No routing providers')
  })
})
