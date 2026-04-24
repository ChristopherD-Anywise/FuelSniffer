/**
 * NT MyFuel provider.
 * Enable via FILLIP_ENABLE_NT=true environment variable.
 *
 * ⚠ This provider is BLOCKED on Q4 (NT API URL unverified).
 * When FILLIP_ENABLE_NT is set, fetchStations/fetchPrices will throw NtApiUnverified.
 * Set FILLIP_NT_VERIFIED=true after confirming the API URL.
 *
 * Cadence: 30 min (low station count ~150 makes 15 min wasteful).
 * NT stations start at ID 40_000_000 pre-surrogate-PK migration.
 */
import { createNtClient, NtApiUnverified } from './client'
import { normaliseNtStation, normaliseNtPrice } from './normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class NtFuelProvider implements FuelPriceProvider {
  readonly id = 'nt'
  readonly displayName = 'NT MyFuel'

  private _idCounter = 40_000_000

  private nextId(): number {
    return this._idCounter++
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_NT) return []

    const client = createNtClient()  // throws NtApiUnverified until Q4 resolved
    const sites  = await client.getSites()
    return sites.map(s => normaliseNtStation(s, () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_NT) return []

    const client = createNtClient()
    const [sites, prices] = await Promise.all([
      client.getSites(),
      client.getPrices(),
    ])

    const stationIdMap = new Map<string, number>()
    let counter = 40_000_000
    for (const s of sites) {
      stationIdMap.set(String(s.siteId), counter++)
    }

    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseNtPrice(p, stationIdMap, recordedAt)
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_NT) {
      return {
        status:    'ok',
        lastRunAt: null,
        message:   'NT provider disabled (FILLIP_ENABLE_NT not set)',
      }
    }
    return {
      status:    'down',
      lastRunAt: null,
      message:   'NT API unverified (Q4) — set FILLIP_NT_VERIFIED=true after confirming the API URL',
    }
  }
}

// Re-export the error class so tests can reference it without importing client
export { NtApiUnverified }
