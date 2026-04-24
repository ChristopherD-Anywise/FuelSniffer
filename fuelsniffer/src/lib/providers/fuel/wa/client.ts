/**
 * WA FuelWatch API client.
 * Auth: none (public API).
 * Base URL: https://www.fuelwatch.wa.gov.au/api
 *
 * T+1 semantics: FuelWatch publishes tomorrow's prices after 14:00 WST.
 * Each price record includes a 'date' field (YYYY-MM-DD) indicating the
 * effective date. The normaliser converts this to a UTC valid_from timestamp.
 *
 * Cadence: twice daily — 14:30 WST (tomorrow's announced) + 06:30 WST (today confirmed).
 */
import axios from 'axios'
import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const FuelWatchSiteSchema = z.object({
  site_id:   z.union([z.string(), z.number()]),
  name:      z.string(),
  address:   z.string().optional(),
  suburb:    z.string().optional(),
  postcode:  z.string().optional(),
  brand:     z.string().optional(),
  latitude:  z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
})

const FuelWatchPriceSchema = z.object({
  site_id:   z.union([z.string(), z.number()]),
  fuel_type: z.string(),
  price:     z.union([z.string(), z.number()]),
  date:      z.string().optional(),  // YYYY-MM-DD effective date
})

const FuelWatchSitesResponseSchema  = z.object({ sites:  z.array(FuelWatchSiteSchema) })
const FuelWatchPricesResponseSchema = z.object({ prices: z.array(FuelWatchPriceSchema) })

export type FuelWatchSite  = z.infer<typeof FuelWatchSiteSchema>
export type FuelWatchPrice = z.infer<typeof FuelWatchPriceSchema>

// ── Client factory ────────────────────────────────────────────────────────────

export interface FuelWatchClient {
  getSites():  Promise<FuelWatchSite[]>
  getPrices(): Promise<FuelWatchPrice[]>
}

export function createWaClient(): FuelWatchClient {
  const http = axios.create({
    baseURL:  'https://www.fuelwatch.wa.gov.au/api',
    timeout:  20_000,
  })

  return {
    async getSites() {
      const response = await http.get('/sites')
      const parsed = FuelWatchSitesResponseSchema.parse(response.data)
      return parsed.sites
    },

    async getPrices() {
      const response = await http.get('/prices')
      const parsed = FuelWatchPricesResponseSchema.parse(response.data)
      return parsed.prices
    },
  }
}
