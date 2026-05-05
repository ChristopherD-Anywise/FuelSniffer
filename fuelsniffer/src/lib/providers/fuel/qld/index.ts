import { desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { scrapeHealth } from '@/lib/db/schema'
import { createApiClient } from './client'
import { normaliseStation, normalisePrice, rawToPrice } from './normaliser'
import { fetchCkanPrices, findLatestResourceId, deduplicateToLatest, type CkanRecord } from './ckan-client'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'
import { normaliseBrand } from '../brand-normaliser'

// ── CKAN fuel type → Direct API FuelId mapping ────────────────────────────────

const CKAN_FUEL_TYPE_MAP: Record<string, number> = {
  'Unleaded': 2,
  'Diesel': 3,
  'LPG': 4,
  'PULP 95/96 RON': 5,
  'Premium Unleaded 95': 5,
  'PULP 98 RON': 8,
  'Premium Unleaded 98': 8,
  'e10': 12,
  'E10': 12,
  'Premium Diesel': 14,
  'E85': 19,
}

// ── QLD provider implementation ───────────────────────────────────────────────

export class QldFuelProvider implements FuelPriceProvider {
  readonly id = 'qld'
  readonly displayName = 'Queensland Fuel Prices'

  private get hasDirectApiToken(): boolean {
    const token = process.env.QLD_API_TOKEN
    return !!(token && token !== 'placeholder_register_at_fuelpricesqld')
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (this.hasDirectApiToken) {
      return this._fetchStationsDirect()
    }
    return this._fetchStationsCkan()
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (this.hasDirectApiToken) {
      return this._fetchPricesDirect(recordedAt)
    }
    return this._fetchPricesCkan(recordedAt)
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const rows = await db
        .select()
        .from(scrapeHealth)
        .orderBy(desc(scrapeHealth.scrapedAt))
        .limit(1)

      if (rows.length === 0) {
        return { status: 'down', lastRunAt: null, message: 'No scrape runs recorded yet' }
      }

      const latest = rows[0]
      if (latest.error) {
        return {
          status: 'degraded',
          lastRunAt: latest.scrapedAt,
          message: latest.error,
        }
      }

      return { status: 'ok', lastRunAt: latest.scrapedAt }
    } catch (err) {
      return {
        status: 'down',
        lastRunAt: null,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ── Direct API paths ────────────────────────────────────────────────────────

  private async _fetchStationsDirect(): Promise<NormalisedStation[]> {
    const client = createApiClient()
    const sitesResponse = await client.getFullSiteDetails()
    return sitesResponse.sites.map(site => {
      const row = normaliseStation(site)
      return {
        id:             row.id!,
        externalId:     row.externalId,
        sourceProvider: row.sourceProvider,
        name:           row.name,
        brand:          normaliseBrand(row.brand ?? null),
        address:        row.address ?? null,
        suburb:         row.suburb ?? null,
        postcode:       row.postcode ?? null,
        latitude:       row.latitude,
        longitude:      row.longitude,
      }
    })
  }

  private async _fetchPricesDirect(recordedAt: Date): Promise<NormalisedPrice[]> {
    const client = createApiClient()
    const pricesResponse = await client.getSitesPrices()
    const prices: NormalisedPrice[] = []

    for (const p of pricesResponse.SitePrices) {
      const row = normalisePrice(p, recordedAt)
      if (!row) continue
      prices.push({
        stationId:      row.stationId,
        fuelTypeId:     row.fuelTypeId,
        priceCents:     row.priceCents as string,
        recordedAt:     row.recordedAt as Date,
        sourceTs:       row.sourceTs as Date,
        sourceProvider: row.sourceProvider,
      })
    }

    return prices
  }

  // ── CKAN paths ──────────────────────────────────────────────────────────────

  private async _fetchStationsCkan(): Promise<NormalisedStation[]> {
    const { resourceId } = await findLatestResourceId()
    const allRecords = await fetchCkanPrices(resourceId)
    const latestRecords = deduplicateToLatest(allRecords)

    const validRecords = latestRecords.filter(r => {
      const lat = parseFloat(r.Site_Latitude)
      const lng = parseFloat(r.Site_Longitude)
      return !isNaN(lat) && !isNaN(lng)
    })

    const stationMap = new Map<string, CkanRecord>()
    for (const r of validRecords) {
      if (!stationMap.has(r.SiteId)) stationMap.set(r.SiteId, r)
    }

    const stations: NormalisedStation[] = []
    for (const [siteId, r] of stationMap) {
      stations.push({
        id:             parseInt(siteId, 10),
        externalId:     siteId,
        sourceProvider: 'qld',
        name:           r.Site_Name,
        brand:          normaliseBrand(r.Site_Brand),
        address:        r.Sites_Address_Line_1 || null,
        suburb:         r.Site_Suburb || null,
        postcode:       r.Site_Post_Code || null,
        latitude:       parseFloat(r.Site_Latitude),
        longitude:      parseFloat(r.Site_Longitude),
      })
    }

    return stations
  }

  private async _fetchPricesCkan(recordedAt: Date): Promise<NormalisedPrice[]> {
    const { resourceId } = await findLatestResourceId()
    const allRecords = await fetchCkanPrices(resourceId)
    const latestRecords = deduplicateToLatest(allRecords)

    const validRecords = latestRecords.filter(r => {
      const lat = parseFloat(r.Site_Latitude)
      const lng = parseFloat(r.Site_Longitude)
      return !isNaN(lat) && !isNaN(lng)
    })

    const prices: NormalisedPrice[] = []

    for (const r of validRecords) {
      const fuelTypeId = CKAN_FUEL_TYPE_MAP[r.Fuel_Type]
      if (!fuelTypeId) continue

      const rawPrice = parseInt(r.Price, 10)
      let priceCents: string
      try {
        priceCents = String(rawToPrice(rawPrice))
      } catch {
        continue
      }

      const sourceTs = new Date(r.TransactionDateutc + 'Z')

      prices.push({
        stationId:      parseInt(r.SiteId, 10),
        fuelTypeId,
        priceCents,
        recordedAt,
        sourceTs,
        sourceProvider: 'qld',
      })
    }

    return prices
  }
}
