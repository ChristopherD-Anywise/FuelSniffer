/**
 * NSW FuelCheck provider.
 * Covers both NSW and ACT stations — ACT is classified by postcode in the normaliser.
 * Enable via FILLIP_ENABLE_NSW=true environment variable.
 */
import { createNswClient } from './client'
import {
  normaliseFuelCheckStation,
  normaliseFuelCheckPrice,
} from '../_fuelcheck/normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class NswFuelProvider implements FuelPriceProvider {
  readonly id = 'nsw'
  readonly displayName = 'NSW FuelCheck'

  // Station IDs start at 10_000_000 to avoid QLD collision pre-surrogate-PK migration.
  // Post-migration 0015: identity is (source_provider, external_id) UNIQUE; integer id is synthetic.
  private _idCounter = 10_000_000

  private nextId(): number {
    return this._idCounter++
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_NSW) return []

    const client = createNswClient()
    const sites  = await client.getSites()
    return sites.map(s => normaliseFuelCheckStation(s, 'nsw', 'NSW', () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_NSW) return []

    const client = createNswClient()
    const [sites, prices] = await Promise.all([
      client.getSites(),
      client.getPrices(),
    ])

    // Build stationCode → surrogate integer id map
    const stationIdMap = new Map<string, number>()
    let counter = 10_000_000
    for (const s of sites) {
      stationIdMap.set(s.stationCode, counter++)
    }

    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseFuelCheckPrice(p, stationIdMap, recordedAt, 'nsw')
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_NSW) {
      return {
        status:     'ok',
        lastRunAt:  null,
        message:    'NSW provider disabled (FILLIP_ENABLE_NSW not set)',
      }
    }
    try {
      const client = createNswClient()
      await client.getSites()
      return { status: 'ok', lastRunAt: new Date() }
    } catch (err) {
      return {
        status:    'down',
        lastRunAt: null,
        message:   err instanceof Error ? err.message : String(err),
      }
    }
  }
}
