import { describe, it, expect } from 'vitest'
import { buildAppleMapsUrl, buildGoogleMapsUrl } from '@/lib/trip/maps-deeplink'

const start = { lat: -27.47, lng: 153.02 }
const station = { lat: -27.70, lng: 153.20, name: "Shell O'Brien's Corner" }
const end = { lat: -28.00, lng: 153.43 }

describe('buildGoogleMapsUrl', () => {
  it('includes start, waypoint station, and destination', () => {
    const url = buildGoogleMapsUrl(start, station, end)
    expect(url).toContain('origin=-27.47,153.02')
    expect(url).toContain('destination=-28,153.43')
    expect(url).toContain('waypoints=-27.7,153.2')
    expect(url).toContain('travelmode=driving')
  })

  it('URL-encodes special characters in station name', () => {
    const url = buildGoogleMapsUrl(start, station, end)
    // The apostrophe in O'Brien's should be encoded
    expect(url).not.toContain("O'Brien")
  })
})

describe('buildAppleMapsUrl', () => {
  it('includes start and destination with station waypoint', () => {
    const url = buildAppleMapsUrl(start, station, end)
    expect(url).toContain('maps.apple.com')
    expect(url).toContain('saddr=-27.47,153.02')
    expect(url).toContain('daddr=')
    expect(url).toContain('-27.7,153.2')
  })
})

describe('coordinate validation', () => {
  it('rejects coords outside Australia', () => {
    const london = { lat: 51.5, lng: -0.1 }
    expect(() => buildGoogleMapsUrl(london, station, end)).toThrow('outside Australian bounds')
  })
})
