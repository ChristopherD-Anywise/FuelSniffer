import axios, { type AxiosInstance } from 'axios'
import { z } from 'zod'

// ── Zod schemas for QLD API responses ────────────────────────────────────────

/**
 * Single price record from GET /Price/GetSitesPrices
 * Price field is an integer: divide by 10 for cents/L (see rawToPrice in normaliser.ts)
 */
export const SitePriceSchema = z.object({
  SiteId:              z.number().int(),
  FuelId:              z.number().int(),
  CollectionMethod:    z.string().optional(),
  TransactionDateUtc:  z.string(),  // ISO 8601 UTC string
  Price:               z.number().int(),  // raw integer — rawToPrice() converts to c/L
})

export const GetSitesPricesResponseSchema = z.object({
  SitePrices: z.array(SitePriceSchema),
})

/**
 * Single station record from GET /Subscriber/GetFullSiteDetails
 */
export const SiteDetailsSchema = z.object({
  SiteId:    z.number().int(),
  Name:      z.string(),
  Brand:     z.string().optional(),
  Address:   z.string().optional(),
  Suburb:    z.string().optional(),
  Postcode:  z.string().optional(),
  Lat:       z.number(),
  Lng:       z.number(),
})

export const GetFullSiteDetailsResponseSchema = z.object({
  S: z.array(SiteDetailsSchema),
})

export type SitePrice = z.infer<typeof SitePriceSchema>
export type SiteDetails = z.infer<typeof SiteDetailsSchema>

// ── Auth header builder ───────────────────────────────────────────────────────

/**
 * Builds the QLD API Authorization header value.
 * Format: 'FPDAPI SubscriberToken=TOKEN'
 * This is the exact format required by fppdirectapi-prod.fuelpricesqld.com.au
 */
export function buildAuthHeader(token: string): string {
  return `FPDAPI SubscriberToken=${token}`
}

// ── Retry helper ─────────────────────────────────────────────────────────────

/**
 * D-08 (locked): Retry 3 times with exponential backoff before throwing.
 * Backoff delays: 2s, 4s, 8s
 */
export async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries) throw err
      const delay = 1000 * 2 ** attempt  // 2000ms, 4000ms, 8000ms
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('unreachable')
}

// ── API client ────────────────────────────────────────────────────────────────

export interface ApiClient {
  getSitesPrices(): Promise<z.infer<typeof GetSitesPricesResponseSchema>>
  getFullSiteDetails(): Promise<z.infer<typeof GetFullSiteDetailsResponseSchema>>
}

/**
 * Creates a QLD Fuel Price API client.
 * Reads QLD_API_TOKEN from process.env — throws if not set.
 *
 * Geographic strategy (from RESEARCH.md Pitfall 6):
 * - Use geoRegionLevel=3 (state) and geoRegionId=1 as a safe default.
 * - Haversine filtering in normaliser.ts handles geographic precision.
 * - Update geoRegionId to a more specific value after live API access confirms IDs.
 */
export function createApiClient(): ApiClient {
  const token = process.env.QLD_API_TOKEN
  if (!token) {
    throw new Error(
      'QLD_API_TOKEN environment variable is not set. ' +
      'Register at https://www.fuelpricesqld.com.au to obtain a token.'
    )
  }

  const http: AxiosInstance = axios.create({
    baseURL: 'https://fppdirectapi-prod.fuelpricesqld.com.au',
    headers: {
      Authorization: buildAuthHeader(token),
    },
    timeout: 10_000,  // 10 second timeout per request
  })

  // Geo params — state level (safest default before geoRegionId confirmed with live API)
  const GEO_PARAMS = {
    countryId:      21,
    geoRegionLevel: 3,
    geoRegionId:    1,
  }

  return {
    async getSitesPrices() {
      const response = await fetchWithRetry(() =>
        http.get('/Price/GetSitesPrices', { params: GEO_PARAMS })
      )
      return GetSitesPricesResponseSchema.parse(response.data)
    },

    async getFullSiteDetails() {
      const response = await fetchWithRetry(() =>
        http.get('/Subscriber/GetFullSiteDetails', { params: GEO_PARAMS })
      )
      return GetFullSiteDetailsResponseSchema.parse(response.data)
    },
  }
}
