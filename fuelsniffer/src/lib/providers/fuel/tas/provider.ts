/**
 * TAS FuelCheck provider.
 * Enable via FILLIP_ENABLE_TAS=true environment variable.
 * TAS stations start at ID 20_000_000 to avoid collision with NSW (10M+) pre-surrogate-PK.
 */
import { createTasClient } from './client'
import {
  normaliseFuelCheckStation,
  normaliseFuelCheckPrice,
} from '../_fuelcheck/normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class TasFuelProvider implements FuelPriceProvider {
  readonly id = 'tas'
  readonly displayName = 'TAS FuelCheck'

  private _idCounter = 20_000_000

  private nextId(): number {
    return this._idCounter++
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_TAS) return []

    const client = createTasClient()
    const sites  = await client.getSites()
    return sites.map(s => normaliseFuelCheckStation(s, 'tas', 'TAS', () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_TAS) return []

    const client = createTasClient()
    const [sites, prices] = await Promise.all([
      client.getSites(),
      client.getPrices(),
    ])

    const stationIdMap = new Map<string, number>()
    let counter = 20_000_000
    for (const s of sites) {
      stationIdMap.set(s.stationCode, counter++)
    }

    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseFuelCheckPrice(p, stationIdMap, recordedAt, 'tas')
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_TAS) {
      return {
        status:    'ok',
        lastRunAt: null,
        message:   'TAS provider disabled (FILLIP_ENABLE_TAS not set)',
      }
    }
    try {
      const client = createTasClient()
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
