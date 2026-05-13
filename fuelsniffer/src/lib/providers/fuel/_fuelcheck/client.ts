/**
 * Shared FuelCheck API client helpers.
 * Used by NSW (api.onegov.nsw.gov.au) and TAS (fuelcheck.tas.gov.au).
 * Each adapter passes its own baseUrl and apiKey.
 */
import axios, { type AxiosInstance } from 'axios'
import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const FuelCheckSiteSchema = z.object({
  serviceStationName: z.string(),
  address:            z.string().optional(),
  suburb:             z.string().optional(),
  state:              z.string().optional(),
  postcode:           z.string().optional(),
  brand:              z.string().optional(),
  stationCode:        z.string(),
  latitude:           z.number(),
  longitude:          z.number(),
})

export const FuelCheckPriceSchema = z.object({
  stationCode:        z.string(),
  fuelType:           z.string(),
  price:              z.number(),               // price in cents per litre (e.g. 145.9)
  lastupdated:        z.string().optional(),
  transactionDateutc: z.string().optional(),
})

export const FuelCheckSitesResponseSchema = z.object({
  stations: z.array(FuelCheckSiteSchema),
})

export const FuelCheckPricesResponseSchema = z.object({
  prices: z.array(FuelCheckPriceSchema),
})

export type FuelCheckSite  = z.infer<typeof FuelCheckSiteSchema>
export type FuelCheckPrice = z.infer<typeof FuelCheckPriceSchema>

// ── HTTP client factory ───────────────────────────────────────────────────────

export interface FuelCheckClientConfig {
  baseUrl: string
  apiKey:  string
  /** Optional: transaction/request ID header name (NSW uses 'transactionid') */
  transactionIdHeader?: string
}

export interface FuelCheckClient {
  getSites():  Promise<FuelCheckSite[]>
  getPrices(): Promise<FuelCheckPrice[]>
}

export function createFuelCheckClient(config: FuelCheckClientConfig): FuelCheckClient {
  const headers: Record<string, string> = {
    apikey: config.apiKey,
  }
  if (config.transactionIdHeader) {
    headers[config.transactionIdHeader] = crypto.randomUUID()
  }

  const http: AxiosInstance = axios.create({
    baseURL: config.baseUrl,
    headers,
    timeout: 20_000,
  })

  return {
    async getSites() {
      const response = await http.get('/fuel/prices/station')
      const parsed = FuelCheckSitesResponseSchema.parse(response.data)
      return parsed.stations
    },

    async getPrices() {
      const response = await http.get('/fuel/prices')
      const parsed = FuelCheckPricesResponseSchema.parse(response.data)
      return parsed.prices
    },
  }
}
