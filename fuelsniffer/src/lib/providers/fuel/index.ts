// ── Provider interface ────────────────────────────────────────────────────────

export interface NormalisedStation {
  id: number
  externalId: string
  sourceProvider: string
  name: string
  brand: string | null
  address: string | null
  suburb: string | null
  postcode: string | null
  latitude: number
  longitude: number
}

export interface NormalisedPrice {
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

// ── Provider registry ─────────────────────────────────────────────────────────

const providers: FuelPriceProvider[] = []

export function registerProvider(provider: FuelPriceProvider): void {
  if (providers.some(p => p.id === provider.id)) {
    throw new Error(`Provider '${provider.id}' is already registered`)
  }
  providers.push(provider)
}

export function getProviders(): readonly FuelPriceProvider[] {
  return providers
}

export function getProvider(id: string): FuelPriceProvider | undefined {
  return providers.find(p => p.id === id)
}

export function clearProviders(): void {
  providers.length = 0
}
