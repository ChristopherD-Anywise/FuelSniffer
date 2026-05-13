/**
 * TAS FuelCheck normaliser unit tests.
 */
import { describe, it, expect } from 'vitest'
import sitesFixture  from './fixtures/sites.json'
import pricesFixture from './fixtures/prices.json'
import {
  normaliseFuelCheckStation,
  normaliseFuelCheckPrice,
} from '../../_fuelcheck/normaliser'
import type { FuelCheckSite, FuelCheckPrice } from '../../_fuelcheck/client'

describe('TAS station normalisation', () => {
  it('emits lower-case suburb', () => {
    const site = sitesFixture.stations[0] as FuelCheckSite
    let counter = 20_000_000
    const station = normaliseFuelCheckStation(site, 'tas', 'TAS', () => counter++)
    expect(station.suburb).toBe('hobart')
  })

  it('state=TAS, jurisdiction=AU-TAS, timezone=Australia/Hobart', () => {
    const site = sitesFixture.stations[0] as FuelCheckSite
    let counter = 20_000_000
    const station = normaliseFuelCheckStation(site, 'tas', 'TAS', () => counter++)
    expect(station.state).toBe('TAS')
    expect(station.jurisdiction).toBe('AU-TAS')
    expect(station.timezone).toBe('Australia/Hobart')
  })

  it('sourceProvider is "tas"', () => {
    const site = sitesFixture.stations[1] as FuelCheckSite
    let counter = 20_000_001
    const station = normaliseFuelCheckStation(site, 'tas', 'TAS', () => counter++)
    expect(station.sourceProvider).toBe('tas')
  })
})

describe('TAS price normalisation', () => {
  const stationIdMap = new Map([['TAS001', 20_000_000], ['TAS002', 20_000_001]])
  const recordedAt   = new Date('2026-04-24T02:00:00Z')

  it('U91 → fuelTypeId 2', () => {
    const price = pricesFixture.prices[0] as FuelCheckPrice
    const norm  = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'tas')
    expect(norm).not.toBeNull()
    expect(norm!.fuelTypeId).toBe(2)
  })

  it('priceCents is in 50–400 range', () => {
    for (const p of pricesFixture.prices as FuelCheckPrice[]) {
      const norm = normaliseFuelCheckPrice(p, stationIdMap, recordedAt, 'tas')
      if (norm !== null) {
        expect(parseFloat(norm.priceCents)).toBeGreaterThanOrEqual(50)
        expect(parseFloat(norm.priceCents)).toBeLessThanOrEqual(400)
      }
    }
  })
})
