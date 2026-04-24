/**
 * NSW + ACT normaliser unit tests.
 * Tests ACT classification, lower-case suburb invariant, fuel type mapping,
 * and price range validation.
 */
import { describe, it, expect } from 'vitest'
import sitesFixture  from './fixtures/sites.json'
import pricesFixture from './fixtures/prices.json'
import {
  normaliseFuelCheckStation,
  normaliseFuelCheckPrice,
  classifyActByPostcode,
  resolveState,
} from '../../_fuelcheck/normaliser'
import type { FuelCheckSite, FuelCheckPrice } from '../../_fuelcheck/client'

// ── ACT postcode classification ────────────────────────────────────────────────

describe('classifyActByPostcode', () => {
  it('returns true for 2601 (inner Canberra)', () => {
    expect(classifyActByPostcode('2601')).toBe(true)
  })

  it('returns true for 2900 (Tuggeranong boundary)', () => {
    expect(classifyActByPostcode('2900')).toBe(true)
  })

  it('returns true for 2910 (within 2900-2920)', () => {
    expect(classifyActByPostcode('2910')).toBe(true)
  })

  it('returns true for 0200 (ANU/university area)', () => {
    expect(classifyActByPostcode('0200')).toBe(true)
  })

  it('returns false for NSW postcode 2150', () => {
    expect(classifyActByPostcode('2150')).toBe(false)
  })

  it('returns false for undefined postcode', () => {
    expect(classifyActByPostcode(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(classifyActByPostcode('')).toBe(false)
  })
})

// ── resolveState ───────────────────────────────────────────────────────────────

describe('resolveState', () => {
  it('explicit ACT state field → AU-ACT', () => {
    const result = resolveState('ACT', '2601', 'NSW')
    expect(result.state).toBe('ACT')
    expect(result.jurisdiction).toBe('AU-ACT')
    expect(result.timezone).toBe('Australia/Sydney')
  })

  it('empty state + ACT postcode → AU-ACT', () => {
    const result = resolveState('', '2900', 'NSW')
    expect(result.state).toBe('ACT')
    expect(result.jurisdiction).toBe('AU-ACT')
  })

  it('NSW state → AU-NSW', () => {
    const result = resolveState('NSW', '2150', 'NSW')
    expect(result.state).toBe('NSW')
    expect(result.jurisdiction).toBe('AU-NSW')
    expect(result.timezone).toBe('Australia/Sydney')
  })

  it('TAS state → AU-TAS with Hobart timezone', () => {
    const result = resolveState('TAS', '7000', 'TAS')
    expect(result.state).toBe('TAS')
    expect(result.jurisdiction).toBe('AU-TAS')
    expect(result.timezone).toBe('Australia/Hobart')
  })
})

// ── Station normalisation ──────────────────────────────────────────────────────

describe('normaliseFuelCheckStation — NSW', () => {
  it('emits lower-case suburb (SP-1 §0 amendment)', () => {
    const site = sitesFixture.stations[0] as FuelCheckSite
    let counter = 10_000_000
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.suburb).toBe('parramatta')
  })

  it('NSW station gets state=NSW, jurisdiction=AU-NSW', () => {
    const site = sitesFixture.stations[0] as FuelCheckSite
    let counter = 10_000_000
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.state).toBe('NSW')
    expect(station.jurisdiction).toBe('AU-NSW')
  })

  it('explicit ACT station (state="ACT") → state=ACT, jurisdiction=AU-ACT', () => {
    const site = sitesFixture.stations[1] as FuelCheckSite
    let counter = 10_000_001
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.state).toBe('ACT')
    expect(station.jurisdiction).toBe('AU-ACT')
    expect(station.timezone).toBe('Australia/Sydney')
  })

  it('empty state + ACT postcode → state=ACT (postcode-classified)', () => {
    const site = sitesFixture.stations[2] as FuelCheckSite  // state="", postcode="2900"
    let counter = 10_000_002
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.state).toBe('ACT')
    expect(station.jurisdiction).toBe('AU-ACT')
  })

  it('sourceProvider is "nsw"', () => {
    const site = sitesFixture.stations[0] as FuelCheckSite
    let counter = 10_000_000
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.sourceProvider).toBe('nsw')
  })

  it('externalId = stationCode', () => {
    const site = sitesFixture.stations[0] as FuelCheckSite
    let counter = 10_000_000
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.externalId).toBe('NSW001')
  })
})

// ── Price normalisation ────────────────────────────────────────────────────────

describe('normaliseFuelCheckPrice — NSW', () => {
  const stationIdMap = new Map([
    ['NSW001', 10_000_000],
    ['ACT001', 10_000_001],
    ['ACT002', 10_000_002],
  ])
  const recordedAt = new Date('2026-04-24T02:00:00Z')

  it('U91 → fuelTypeId 2, priceCents in 50–400 range', () => {
    const price = pricesFixture.prices[0] as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).not.toBeNull()
    expect(norm!.fuelTypeId).toBe(2)
    expect(parseFloat(norm!.priceCents)).toBeGreaterThanOrEqual(50)
    expect(parseFloat(norm!.priceCents)).toBeLessThanOrEqual(400)
  })

  it('DL → fuelTypeId 3', () => {
    const price = pricesFixture.prices[1] as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).not.toBeNull()
    expect(norm!.fuelTypeId).toBe(3)
  })

  it('P95 → fuelTypeId 5', () => {
    const price = pricesFixture.prices[3] as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).not.toBeNull()
    expect(norm!.fuelTypeId).toBe(5)
  })

  it('returns null for unknown fuelType code', () => {
    const price = pricesFixture.prices[4] as FuelCheckPrice  // UNKNOWN_FUEL
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).toBeNull()
  })

  it('returns null for out-of-range price (<50)', () => {
    const price = { stationCode: 'NSW001', fuelType: 'U91', price: 5.0 } as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).toBeNull()
  })

  it('returns null for price > 400', () => {
    const price = { stationCode: 'NSW001', fuelType: 'U91', price: 999.0 } as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).toBeNull()
  })

  it('returns null when stationCode is not in the id map', () => {
    const price = { stationCode: 'UNKNOWN', fuelType: 'U91', price: 170.0 } as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).toBeNull()
  })

  it('sourceTs comes from transactionDateutc when present', () => {
    const price = pricesFixture.prices[0] as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).not.toBeNull()
    expect(norm!.sourceTs.toISOString()).toBe('2026-04-24T01:00:00.000Z')
  })

  it('priceCents is formatted to 1 decimal place', () => {
    const price = { stationCode: 'NSW001', fuelType: 'U91', price: 173.5 } as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm!.priceCents).toBe('173.5')
  })
})
