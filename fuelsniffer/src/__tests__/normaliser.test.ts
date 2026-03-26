/**
 * Tests for DATA-04: price encoding and timezone correctness.
 * Run: npx vitest run src/__tests__/normaliser.test.ts
 */
import { describe, it, expect } from 'vitest'
import { rawToPrice, isWithinRadius, toBrisbaneHour, normalisePrice, normaliseStation } from '@/lib/scraper/normaliser'

describe('rawToPrice', () => {
  it('converts QLD API integer 1459 to 145.9 cents per litre', () => {
    expect(rawToPrice(1459)).toBe(145.9)
  })

  it('converts 1000 to 100.0 cents per litre', () => {
    expect(rawToPrice(1000)).toBe(100.0)
  })

  it('throws for values outside the 50–400 c/L plausible range after conversion', () => {
    expect(() => rawToPrice(10)).toThrow()     // raw 10 → 1.0 c/L (impossible)
    expect(() => rawToPrice(9999)).toThrow()    // raw 9999 → 999.9 c/L (impossible)
    expect(() => rawToPrice(499)).toThrow()     // raw 499 → 49.9 c/L (below 50 floor)
    expect(() => rawToPrice(4001)).toThrow()    // raw 4001 → 400.1 c/L (above 400 ceiling)
  })

  it('stores result as a number rounded to one decimal place', () => {
    expect(rawToPrice(1459)).toBeCloseTo(145.9, 1)
    expect(rawToPrice(1500)).toBeCloseTo(150.0, 1)
  })

  it('accepts boundary values: 500 (50.0 c/L) and 4000 (400.0 c/L)', () => {
    expect(rawToPrice(500)).toBe(50.0)
    expect(rawToPrice(4000)).toBe(400.0)
  })
})

describe('toBrisbaneHour — timezone correctness (no DST in Queensland)', () => {
  it('a UTC 00:00 timestamp converts to 10:00 Brisbane in January (summer)', () => {
    // QLD is UTC+10 year-round. In January, NSW is UTC+11 (DST).
    // QLD must stay UTC+10.
    expect(toBrisbaneHour('2026-01-15T00:00:00Z')).toBe(10)
  })

  it('a UTC 00:00 timestamp converts to 10:00 Brisbane in July (winter)', () => {
    expect(toBrisbaneHour('2026-07-15T00:00:00Z')).toBe(10)
  })

  it('a UTC 00:00 timestamp converts to 10:00 Brisbane in October (when NSW enters DST)', () => {
    // First Sunday of October 2026: NSW shifts to UTC+11.
    // Brisbane MUST still show UTC+10, not UTC+11.
    expect(toBrisbaneHour('2026-10-04T00:00:00Z')).toBe(10)
  })

  it('a UTC 14:00 timestamp converts to 00:00 Brisbane (midnight)', () => {
    // UTC 14:00 + 10h = Brisbane 00:00 (next day in Brisbane)
    expect(toBrisbaneHour('2026-03-23T14:00:00Z')).toBe(0)
  })
})

describe('isWithinRadius — 50km from North Lakes (-27.2353, 153.0189)', () => {
  it('accepts North Lakes itself (0km)', () => {
    expect(isWithinRadius(-27.2353, 153.0189)).toBe(true)
  })

  it('accepts Mango Hill (~2km from North Lakes)', () => {
    expect(isWithinRadius(-27.2545, 153.0282)).toBe(true)
  })

  it('accepts Brisbane CBD (~26km from North Lakes — within 50km)', () => {
    expect(isWithinRadius(-27.4698, 153.0251)).toBe(true)
  })

  it('rejects Gold Coast (~100km south)', () => {
    expect(isWithinRadius(-28.0167, 153.4000)).toBe(false)
  })

  it('rejects Sunshine Coast (~90km north)', () => {
    expect(isWithinRadius(-26.6500, 153.0667)).toBe(false)
  })
})

describe('normaliseStation', () => {
  it('returns a NewStation for any station regardless of location', () => {
    const northLakesStation = {
      SiteId: 123, Name: 'North Lakes 7-Eleven', Brand: '7-Eleven',
      Address: '1 North Lakes Dr', Suburb: 'North Lakes', Postcode: '4509',
      Lat: -27.2353, Lng: 153.0189,
    }
    const result = normaliseStation(northLakesStation)
    expect(result).not.toBeNull()
    expect(result.id).toBe(123)
    expect(result.isActive).toBe(true)
  })

  it('returns a NewStation for stations far from North Lakes', () => {
    const goldCoastStation = {
      SiteId: 999, Name: 'Gold Coast BP', Lat: -28.0167, Lng: 153.4000,
    }
    const result = normaliseStation(goldCoastStation)
    expect(result).not.toBeNull()
    expect(result.id).toBe(999)
    expect(result.isActive).toBe(true)
  })
})

describe('normalisePrice', () => {
  it('converts raw integer price to decimal cents/L', () => {
    const sitePrice = {
      SiteId: 123, FuelId: 52,
      TransactionDateUtc: '2026-03-23T05:00:00Z',
      Price: 1459,
    }
    const result = normalisePrice(sitePrice, new Date())
    expect(result).not.toBeNull()
    expect(Number(result!.priceCents)).toBeCloseTo(145.9, 1)
  })

  it('returns null and logs error for invalid price encoding (does not throw)', () => {
    const sitePrice = {
      SiteId: 123, FuelId: 52,
      TransactionDateUtc: '2026-03-23T05:00:00Z',
      Price: 10,  // rawToPrice(10) = 1.0 c/L → throws → normalisePrice returns null
    }
    expect(normalisePrice(sitePrice, new Date())).toBeNull()
  })
})
