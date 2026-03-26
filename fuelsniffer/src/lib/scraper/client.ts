import axios, { type AxiosInstance } from 'axios'
import { z } from 'zod'

// ── Zod schemas for QLD API responses ────────────────────────────────────────

/**
 * Single price record from GET /Price/GetSitesPrices
 * Price field is a float: divide by 10 for cents/L (see rawToPrice in normaliser.ts)
 */
export const SitePriceSchema = z.object({
  SiteId:              z.number(),
  FuelId:              z.number(),
  CollectionMethod:    z.string().optional(),
  TransactionDateUtc:  z.string(),  // ISO 8601 UTC string
  Price:               z.number(),  // raw value — rawToPrice() converts to c/L
})

export const GetSitesPricesResponseSchema = z.object({
  SitePrices: z.array(SitePriceSchema),
})

/**
 * Single station record from GET /Subscriber/GetFullSiteDetails
 * The real API uses abbreviated single-letter field names.
 */
export const RawSiteDetailsSchema = z.object({
  S:    z.number(),           // SiteId
  N:    z.string(),           // Name
  B:    z.number(),           // BrandId (integer — resolve via brands lookup)
  A:    z.string().optional(), // Address
  P:    z.string().optional(), // Postcode
  Lat:  z.number(),
  Lng:  z.number(),
  GPI:  z.string().optional(), // Google Place ID
})

export const GetFullSiteDetailsResponseSchema = z.object({
  S: z.array(RawSiteDetailsSchema),
})

/** Normalised site details after field mapping and brand resolution */
export interface SiteDetails {
  SiteId:   number
  Name:     string
  Brand:    string | null
  Address:  string | null
  Postcode: string | null
  Lat:      number
  Lng:      number
}

export type SitePrice = z.infer<typeof SitePriceSchema>
export type RawSiteDetails = z.infer<typeof RawSiteDetailsSchema>

// ── Brand lookup ─────────────────────────────────────────────────────────────

const BrandSchema = z.object({
  BrandId: z.number(),
  Name:    z.string(),
})

const GetCountryBrandsResponseSchema = z.object({
  Brands: z.array(BrandSchema),
})

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
  getFullSiteDetails(): Promise<{ sites: SiteDetails[] }>
}

/**
 * Creates a QLD Fuel Price API client.
 * Reads QLD_API_TOKEN from process.env — throws if not set.
 *
 * Fetches brand names on first call to getFullSiteDetails and caches them.
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
    timeout: 15_000,  // 15 second timeout per request
  })

  // Geo params — state level to get all QLD stations; Haversine filter narrows to North Brisbane
  const GEO_PARAMS = {
    countryId:      21,
    geoRegionLevel: 3,
    geoRegionId:    1,
  }

  let brandCache: Map<number, string> | null = null

  async function fetchBrands(): Promise<Map<number, string>> {
    if (brandCache) return brandCache
    const response = await fetchWithRetry(() =>
      http.get('/Subscriber/GetCountryBrands', { params: { countryId: 21 } })
    )
    const parsed = GetCountryBrandsResponseSchema.parse(response.data)
    brandCache = new Map(parsed.Brands.map(b => [b.BrandId, b.Name]))
    return brandCache
  }

  return {
    async getSitesPrices() {
      const response = await fetchWithRetry(() =>
        http.get('/Price/GetSitesPrices', { params: GEO_PARAMS })
      )
      return GetSitesPricesResponseSchema.parse(response.data)
    },

    async getFullSiteDetails() {
      const [siteResponse, brands] = await Promise.all([
        fetchWithRetry(() =>
          http.get('/Subscriber/GetFullSiteDetails', { params: GEO_PARAMS })
        ),
        fetchBrands(),
      ])
      const parsed = GetFullSiteDetailsResponseSchema.parse(siteResponse.data)

      // Normalise abbreviated API fields to our domain model
      const sites: SiteDetails[] = parsed.S.map(raw => ({
        SiteId:   raw.S,
        Name:     raw.N,
        Brand:    brands.get(raw.B) ?? null,
        Address:  raw.A ?? null,
        Postcode: raw.P ?? null,
        Lat:      raw.Lat,
        Lng:      raw.Lng,
      }))

      return { sites }
    },
  }
}
