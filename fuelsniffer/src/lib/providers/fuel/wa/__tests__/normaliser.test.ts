/**
 * WA FuelWatch normaliser unit tests.
 * Key focus: T+1 valid_from semantics.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import sitesFixture  from './fixtures/sites.json'
import pricesFixture from './fixtures/prices.json'
import {
  waDateToValidFrom,
  normaliseWaStation,
  normaliseWaPrice,
  WA_FUEL_MAP,
} from '../normaliser'
import type { FuelWatchSite, FuelWatchPrice } from '../client'

afterEach(() => {
  vi.useRealTimers()
})

// ── waDateToValidFrom ─────────────────────────────────────────────────────────

describe('waDateToValidFrom — T+1 UTC conversion', () => {
  it('2026-04-25 → 2026-04-24T22:00:00.000Z (06:00 WST)', () => {
    const result = waDateToValidFrom('2026-04-25')
    expect(result.toISOString()).toBe('2026-04-24T22:00:00.000Z')
  })

  it('2026-04-24 → 2026-04-23T22:00:00.000Z', () => {
    const result = waDateToValidFrom('2026-04-24')
    expect(result.toISOString()).toBe('2026-04-23T22:00:00.000Z')
  })

  it('announced price (date=tomorrow) has validFrom > now (14:00 WST context)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T06:00:00Z'))  // 14:00 WST

    const tomorrowValidFrom = waDateToValidFrom('2026-04-25')
    expect(tomorrowValidFrom.getTime()).toBeGreaterThan(Date.now())

    vi.useRealTimers()
  })

  it('current price (date=today) has validFrom <= now (after 06:00 WST)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T10:00:00Z'))  // 18:00 WST

    const todayValidFrom = waDateToValidFrom('2026-04-24')
    expect(todayValidFrom.getTime()).toBeLessThanOrEqual(Date.now())

    vi.useRealTimers()
  })

  it('what was "tomorrow" becomes "current" after 22:00 UTC', () => {
    vi.useFakeTimers()
    // Before 22:00 UTC — it is still "future" for April 25
    vi.setSystemTime(new Date('2026-04-24T21:59:00Z'))
    const validFrom = waDateToValidFrom('2026-04-25')
    expect(validFrom.getTime()).toBeGreaterThan(Date.now())

    // After 22:00 UTC — now April 25 is "current"
    vi.setSystemTime(new Date('2026-04-24T22:01:00Z'))
    expect(validFrom.getTime()).toBeLessThanOrEqual(Date.now())

    vi.useRealTimers()
  })
})

// ── WA_FUEL_MAP ───────────────────────────────────────────────────────────────

describe('WA_FUEL_MAP', () => {
  it('ULP → 2 (Unleaded 91)', () => expect(WA_FUEL_MAP['ULP']).toBe(2))
  it('PULP → 5 (Premium 95)', () => expect(WA_FUEL_MAP['PULP']).toBe(5))
  it('98RON → 8 (Premium 98)', () => expect(WA_FUEL_MAP['98RON']).toBe(8))
  it('Diesel → 3', () => expect(WA_FUEL_MAP['Diesel']).toBe(3))
  it('LPG → 4', () => expect(WA_FUEL_MAP['LPG']).toBe(4))
})

// ── Station normalisation ─────────────────────────────────────────────────────

describe('normaliseWaStation', () => {
  it('emits lower-case suburb', () => {
    const site = sitesFixture.sites[0] as FuelWatchSite
    let counter = 30_000_000
    const station = normaliseWaStation(site, () => counter++)
    expect(station.suburb).toBe('perth')
  })

  it('state=WA, jurisdiction=AU-WA, timezone=Australia/Perth', () => {
    const site = sitesFixture.sites[0] as FuelWatchSite
    let counter = 30_000_000
    const station = normaliseWaStation(site, () => counter++)
    expect(station.state).toBe('WA')
    expect(station.jurisdiction).toBe('AU-WA')
    expect(station.timezone).toBe('Australia/Perth')
  })

  it('externalId = string(site_id)', () => {
    const site = sitesFixture.sites[0] as FuelWatchSite
    let counter = 30_000_000
    const station = normaliseWaStation(site, () => counter++)
    expect(station.externalId).toBe('WA001')
  })

  it('Better Choice brand normalises correctly', () => {
    const site = sitesFixture.sites[1] as FuelWatchSite
    let counter = 30_000_001
    const station = normaliseWaStation(site, () => counter++)
    expect(station.brand).toBe('Better Choice')
  })
})

// ── Price normalisation ───────────────────────────────────────────────────────

describe('normaliseWaPrice', () => {
  const stationIdMap = new Map([['WA001', 30_000_000], ['WA002', 30_000_001]])
  const recordedAt   = new Date('2026-04-24T06:00:00Z')

  it('ULP → fuelTypeId 2', () => {
    const price = pricesFixture.prices[0] as FuelWatchPrice
    const norm  = normaliseWaPrice(price, stationIdMap, recordedAt)
    expect(norm).not.toBeNull()
    expect(norm!.fuelTypeId).toBe(2)
  })

  it('today price: validFrom is past (2026-04-23T22:00Z) relative to recordedAt (2026-04-24T06:00Z)', () => {
    const price = pricesFixture.prices[0] as FuelWatchPrice  // date='2026-04-24'
    const norm  = normaliseWaPrice(price, stationIdMap, recordedAt)
    expect(norm).not.toBeNull()
    // valid_from for 2026-04-24 = 2026-04-23T22:00:00Z which is before recordedAt
    expect(norm!.validFrom!.getTime()).toBeLessThanOrEqual(recordedAt.getTime())
  })

  it('tomorrow price: validFrom is future (2026-04-24T22:00Z) relative to recordedAt (2026-04-24T06:00Z)', () => {
    const price = pricesFixture.prices[1] as FuelWatchPrice  // date='2026-04-25'
    const norm  = normaliseWaPrice(price, stationIdMap, recordedAt)
    expect(norm).not.toBeNull()
    // valid_from for 2026-04-25 = 2026-04-24T22:00:00Z which is after recordedAt (06:00Z)
    expect(norm!.validFrom!.getTime()).toBeGreaterThan(recordedAt.getTime())
  })

  it('accepts price as string (WA sometimes returns strings)', () => {
    const price = pricesFixture.prices[2] as FuelWatchPrice  // price="203.2"
    const norm  = normaliseWaPrice(price, stationIdMap, recordedAt)
    expect(norm).not.toBeNull()
    expect(norm!.priceCents).toBe('203.2')
  })

  it('returns null for unknown fuel type', () => {
    const price = pricesFixture.prices[4] as FuelWatchPrice
    const norm  = normaliseWaPrice(price, stationIdMap, recordedAt)
    expect(norm).toBeNull()
  })

  it('PULP → fuelTypeId 5', () => {
    const price = pricesFixture.prices[2] as FuelWatchPrice
    const norm  = normaliseWaPrice(price, stationIdMap, recordedAt)
    expect(norm).not.toBeNull()
    expect(norm!.fuelTypeId).toBe(5)
  })
})
