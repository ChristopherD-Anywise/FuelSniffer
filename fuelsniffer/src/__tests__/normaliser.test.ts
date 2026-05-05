/**
 * Tests for DATA-04: price encoding and timezone correctness.
 * Run: npx vitest run src/__tests__/normaliser.test.ts
 */
import { describe, it, expect } from 'vitest'
import { rawToPrice, toBrisbaneHour, normalisePrice, normaliseStation, extractSuburb } from '@/lib/scraper/normaliser'

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
      SiteId: 999, Name: 'Gold Coast BP', Brand: 'BP',
      Address: '1 Surfers Paradise Blvd, SURFERS PARADISE QLD 4217', Postcode: '4217',
      Lat: -28.0167, Lng: 153.4000,
    }
    const result = normaliseStation(goldCoastStation)
    expect(result).not.toBeNull()
    expect(result.id).toBe(999)
    expect(result.isActive).toBe(true)
  })

  it('accepts a Sydney CBD station (~920km from North Lakes) — NSW coverage', () => {
    const sydneyStation = {
      SiteId: 5001, Name: 'Sydney CBD 7-Eleven', Brand: '7-Eleven',
      Address: '1 George St, SYDNEY NSW 2000', Postcode: '2000',
      Lat: -33.87, Lng: 151.20,
    }
    const result = normaliseStation(sydneyStation)
    expect(result).not.toBeNull()
    expect(result.id).toBe(5001)
    expect(result.latitude).toBe(-33.87)
    expect(result.longitude).toBe(151.20)
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

describe('extractSuburb — postcode fallback', () => {
  it('extracts suburb from enriched address (regex path)', () => {
    expect(extractSuburb('123 Main St, NORTH LAKES QLD 4509', '4509'))
      .toBe('NORTH LAKES')
  })

  it('falls back to postcode lookup when address is bare street', () => {
    expect(extractSuburb('1256 Anzac Avenue', '4503')).toBe('Dakabin')
  })

  it('returns null when address is bare and postcode is unknown', () => {
    expect(extractSuburb('bare street', '9999')).toBeNull()
  })

  it('returns null when both address and postcode are null', () => {
    expect(extractSuburb(null, null)).toBeNull()
  })

  it('falls back to postcode lookup when address is null but postcode is known', () => {
    expect(extractSuburb(null, '4000')).toBe('Brisbane City')
  })

  it('does not treat a 2-part "street, suburb" address as a street fragment', () => {
    // Legacy bug: the parts[length-2] fallback fired on 2-part addresses
    // and returned the street (parts[0]) as the "suburb". Now the comma
    // split only fires at 3+ parts, so 2-part addresses fall through to
    // the postcode lookup instead of poisoning stations.suburb.
    expect(extractSuburb('143A Targo St, Kedron', '4031')).toBe('Glen Kedron')
  })

  it('uses the middle segment on a proper 3-part address', () => {
    expect(extractSuburb('123 Main St, North Lakes, 4509', '4509'))
      .toBe('North Lakes')
  })
})

describe('normaliseStation.suburb — postcode fallback', () => {
  it('populates suburb from postcode when address lacks suburb info', () => {
    const site = {
      SiteId: 9999001,
      Name: 'Test',
      Brand: null,
      Address: '1256 Anzac Avenue',
      Postcode: '4503',
      Lat: -27.2,
      Lng: 153.0,
    }
    const result = normaliseStation(site)
    expect(result.suburb).toBe('Dakabin')
  })
})

describe('extractSuburb — parse suburb from QLD API address string', () => {
  it('extracts suburb from "123 Main St, NORTH LAKES, QLD 4509"', () => {
    expect(extractSuburb('123 Main St, NORTH LAKES, QLD 4509', null)).toBe('NORTH LAKES')
  })

  it('extracts suburb from "45 Anzac Ave, REDCLIFFE QLD 4020"', () => {
    expect(extractSuburb('45 Anzac Ave, REDCLIFFE QLD 4020', null)).toBe('REDCLIFFE')
  })

  it('extracts suburb from "Shop 1, NARANGBA, QLD 4504"', () => {
    expect(extractSuburb('Shop 1, NARANGBA, QLD 4504', null)).toBe('NARANGBA')
  })

  it('returns null for null input', () => {
    expect(extractSuburb(null, null)).toBeNull()
  })

  it('returns null for an address with no recognisable suburb pattern', () => {
    expect(extractSuburb('No suburb here', null)).toBeNull()
  })
})
