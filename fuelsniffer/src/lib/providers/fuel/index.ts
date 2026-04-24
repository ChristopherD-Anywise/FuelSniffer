import type {
  StationJurisdictionFields,
  PriceValidFromField,
  ProviderSchedule,
  Jurisdiction,
  FuelTypeMap,
  CanonicalFuelType,
} from './types'

// ── Provider interface ────────────────────────────────────────────────────────

export interface NormalisedStation extends StationJurisdictionFields {
  id: number
  externalId: string
  sourceProvider: string
  name: string
  brand: string | null
  address: string | null
  /**
   * Suburb name. MUST be lower(suburb) per SP-1 §0 amendment.
   * SP-4 cycle engine and SP-5 alerts use `${lower(suburb)}|${lower(state)}` as the composite key.
   */
  suburb: string | null
  postcode: string | null
  latitude: number
  longitude: number
}

export interface NormalisedPrice extends PriceValidFromField {
  stationId: number
  fuelTypeId: number
  priceCents: string
  recordedAt: Date
  sourceTs: Date
  sourceProvider: string
}

export interface ProviderHealth {
  status: 'ok' | 'degraded' | 'down'
  lastRunAt: Date | null
  message?: string
}

export interface FuelPriceProvider {
  readonly id: string
  readonly displayName: string
  fetchStations(): Promise<NormalisedStation[]>
  fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]>
  healthCheck(): Promise<ProviderHealth>
}

// ── SP-1 type re-exports ──────────────────────────────────────────────────────

export type { ProviderSchedule, Jurisdiction, FuelTypeMap, CanonicalFuelType }

// ── Provider registry ─────────────────────────────────────────────────────────

const providers: FuelPriceProvider[] = []

export function registerProvider(provider: FuelPriceProvider): void {
  if (providers.some(p => p.id === provider.id)) {
    console.warn(`[providers] registerProvider: provider '${provider.id}' is already registered — skipping`)
    return
  }
  providers.push(provider)
}

export function getProviders(): FuelPriceProvider[] {
  return [...providers]
}

export function getProvider(id: string): FuelPriceProvider | undefined {
  return providers.find(p => p.id === id)
}

export function clearProviders(): void {
  providers.length = 0
}
