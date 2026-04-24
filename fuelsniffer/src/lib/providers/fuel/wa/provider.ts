/**
 * WA FuelWatch provider.
 * Enable via FILLIP_ENABLE_WA=true environment variable.
 * Cadence: twice daily — 06:30 WST (confirm today) + 14:30 WST (announce tomorrow).
 * WA stations start at ID 30_000_000 pre-surrogate-PK migration.
 */
import { createWaClient } from './client'
import { normaliseWaStation, normaliseWaPrice } from './normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class WaFuelProvider implements FuelPriceProvider {
  readonly id = 'wa'
  readonly displayName = 'WA FuelWatch'

  private _idCounter = 30_000_000

  private nextId(): number {
    return this._idCounter++
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_WA) return []

    const client = createWaClient()
    const sites  = await client.getSites()
    return sites.map(s => normaliseWaStation(s, () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_WA) return []

    const client = createWaClient()
    const [sites, prices] = await Promise.all([
      client.getSites(),
      client.getPrices(),
    ])

    const stationIdMap = new Map<string, number>()
    let counter = 30_000_000
    for (const s of sites) {
      stationIdMap.set(String(s.site_id), counter++)
    }

    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseWaPrice(p, stationIdMap, recordedAt)
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_WA) {
      return {
        status:    'ok',
        lastRunAt: null,
        message:   'WA provider disabled (FILLIP_ENABLE_WA not set)',
      }
    }
    try {
      const client = createWaClient()
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
