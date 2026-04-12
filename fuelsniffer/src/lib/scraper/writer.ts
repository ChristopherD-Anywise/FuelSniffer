import axios from 'axios'
import { db } from '@/lib/db/client'
import { stations, priceReadings, scrapeHealth } from '@/lib/db/schema'
import { createApiClient } from './client'
import { normaliseStation, normalisePrice } from './normaliser'
import { fetchCkanPrices, findLatestResourceId, deduplicateToLatest, type CkanRecord } from './ckan-client'
import { rawToPrice } from './normaliser'
import { sql } from 'drizzle-orm'

// ── Healthchecks.io dead-man's-switch ────────────────────────────────────────

async function pingHealthchecks(): Promise<void> {
  const pingUrl = process.env.HEALTHCHECKS_PING_URL
  if (!pingUrl) return
  try {
    await axios.get(pingUrl, { timeout: 5000 })
  } catch {
    console.error('[scraper] healthchecks.io ping failed — monitoring may alert')
  }
}

// ── D-09 helper ───────────────────────────────────────────────────────────────

export function shouldInsertRow(_newPrice: number, _lastPrice: number): boolean {
  return true
}

// ── Main scrape orchestrator ──────────────────────────────────────────────────

export interface ScrapeResult {
  pricesUpserted: number
  error: string | null
  source: 'direct-api' | 'ckan-open-data'
}

// Map CKAN fuel type names to Direct API FuelId integers
// Direct API IDs: 2=Unleaded, 3=Diesel, 4=LPG, 5=Premium95, 8=Premium98,
//                 12=E10, 14=PremiumDiesel, 19=E85, 21=Opal
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

/**
 * Run scrape using the CKAN Open Data Portal (no auth needed).
 * Used as fallback when QLD_API_TOKEN is not available.
 */
async function runCkanScrapeJob(): Promise<ScrapeResult> {
  const startTime = Date.now()

  try {
    const { resourceId, month } = await findLatestResourceId()
    console.log(`[scraper:ckan] Fetching from Open Data Portal (${month})...`)

    const allRecords = await fetchCkanPrices(resourceId)
    console.log(`[scraper:ckan] Fetched ${allRecords.length} total records`)

    // Deduplicate to latest price per station+fuel
    const latestRecords = deduplicateToLatest(allRecords)
    console.log(`[scraper:ckan] ${latestRecords.length} unique station+fuel combinations`)

    // Filter out records with invalid coordinates
    const validRecords = latestRecords.filter(r => {
      const lat = parseFloat(r.Site_Latitude)
      const lng = parseFloat(r.Site_Longitude)
      return !isNaN(lat) && !isNaN(lng)
    })
    console.log(`[scraper:ckan] ${validRecords.length} records with valid coordinates`)

    const recordedAt = new Date()

    // Upsert stations
    const stationMap = new Map<string, CkanRecord>()
    for (const r of validRecords) {
      if (!stationMap.has(r.SiteId)) stationMap.set(r.SiteId, r)
    }

    for (const [siteId, r] of stationMap) {
      await db
        .insert(stations)
        .values({
          id: parseInt(siteId, 10),
          name: r.Site_Name,
          brand: r.Site_Brand || null,
          address: r.Sites_Address_Line_1 || null,
          suburb: r.Site_Suburb || null,
          postcode: r.Site_Post_Code || null,
          latitude: parseFloat(r.Site_Latitude),
          longitude: parseFloat(r.Site_Longitude),
          isActive: true,
          lastSeenAt: new Date(),
          externalId: siteId,
          sourceProvider: 'qld',
        })
        .onConflictDoUpdate({
          target: stations.id,
          set: {
            name: sql`excluded.name`,
            brand: sql`excluded.brand`,
            address: sql`excluded.address`,
            suburb: sql`excluded.suburb`,
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            isActive: sql`true`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        })
    }

    // Insert price readings
    let priceCount = 0
    for (const r of validRecords) {
      const stationId = parseInt(r.SiteId, 10)
      const fuelTypeId = CKAN_FUEL_TYPE_MAP[r.Fuel_Type]
      if (!fuelTypeId) continue

      const rawPrice = parseInt(r.Price, 10)
      const priceCents = rawPrice / 10 // 1940 → 194.0

      // Parse CKAN date format: "2026-02-28T13:52:00"
      const sourceTs = new Date(r.TransactionDateutc + 'Z')

      await db.insert(priceReadings).values({
        stationId,
        fuelTypeId,
        priceCents: String(priceCents),
        recordedAt,
        sourceTs,
        sourceProvider: 'qld',
      }).onConflictDoNothing()
      priceCount++
    }

    const durationMs = Date.now() - startTime

    await db.insert(scrapeHealth).values({
      pricesUpserted: priceCount,
      durationMs,
      error: null,
    })

    await pingHealthchecks()

    console.log(`[scraper:ckan] OK — ${stationMap.size} stations, ${priceCount} prices in ${durationMs}ms`)

    return { pricesUpserted: priceCount, error: null, source: 'ckan-open-data' }

  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[scraper:ckan] FAILED after ${durationMs}ms: ${errorMessage}`)

    try {
      await db.insert(scrapeHealth).values({
        pricesUpserted: 0,
        durationMs,
        error: errorMessage,
      })
    } catch (dbErr) {
      console.error('[scraper:ckan] Could not write failure record:', dbErr)
    }

    return { pricesUpserted: 0, error: errorMessage, source: 'ckan-open-data' }
  }
}

/**
 * Run one complete scrape cycle using the Direct API.
 * Original implementation — used when QLD_API_TOKEN is set.
 */
async function runDirectApiScrapeJob(): Promise<ScrapeResult> {
  const startTime = Date.now()

  try {
    const client = createApiClient()
    const recordedAt = new Date()

    const sitesResponse = await client.getFullSiteDetails()
    const stationRows = sitesResponse.sites
      .map(normaliseStation)

    if (stationRows.length > 0) {
      await db
        .insert(stations)
        .values(stationRows)
        .onConflictDoUpdate({
          target: stations.id,
          set: {
            name: sql`excluded.name`,
            brand: sql`excluded.brand`,
            address: sql`excluded.address`,
            suburb: sql`excluded.suburb`,
            postcode: sql`excluded.postcode`,
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        })
    }

    // Fetch the latest source_ts we have per station+fuel so we only insert genuine price changes
    const latestSourceTs = await db.execute(sql`
      SELECT DISTINCT ON (station_id, fuel_type_id)
        station_id, fuel_type_id, source_ts
      FROM price_readings
      ORDER BY station_id, fuel_type_id, recorded_at DESC
    `)
    const seenKey = new Set(
      (latestSourceTs as unknown as Array<{ station_id: number; fuel_type_id: number; source_ts: Date }>)
        .map(r => `${r.station_id}-${r.fuel_type_id}-${new Date(r.source_ts).getTime()}`)
    )

    const pricesResponse = await client.getSitesPrices()
    const priceRows = pricesResponse.SitePrices
      .map(p => normalisePrice(p, recordedAt))
      .filter((p): p is NonNullable<typeof p> => p !== null)

    // Only insert rows where source_ts is new (actual price change from the station)
    const newPriceRows = priceRows.filter(p => {
      const key = `${p.stationId}-${p.fuelTypeId}-${new Date(p.sourceTs).getTime()}`
      return !seenKey.has(key)
    })

    if (newPriceRows.length > 0) {
      await db.insert(priceReadings).values(newPriceRows)
    }

    const durationMs = Date.now() - startTime
    const pricesUpserted = newPriceRows.length
    const skipped = priceRows.length - newPriceRows.length

    await db.insert(scrapeHealth).values({ pricesUpserted, durationMs, error: null })
    await pingHealthchecks()

    console.log(`[scraper] OK — ${pricesUpserted} new prices, ${skipped} unchanged in ${durationMs}ms`)

    return { pricesUpserted, error: null, source: 'direct-api' }

  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[scraper] FAILED after ${durationMs}ms: ${errorMessage}`)

    try {
      await db.insert(scrapeHealth).values({ pricesUpserted: 0, durationMs, error: errorMessage })
    } catch (dbErr) {
      console.error('[scraper] Could not write failure record:', dbErr)
    }

    return { pricesUpserted: 0, error: errorMessage, source: 'direct-api' }
  }
}

/**
 * Main entry point — automatically selects the data source.
 * Uses Direct API if QLD_API_TOKEN is set, falls back to CKAN Open Data.
 */
export async function runScrapeJob(): Promise<ScrapeResult> {
  const hasDirectApiToken = process.env.QLD_API_TOKEN &&
    process.env.QLD_API_TOKEN !== 'placeholder_register_at_fuelpricesqld'

  if (hasDirectApiToken) {
    return runDirectApiScrapeJob()
  }

  console.log('[scraper] No QLD_API_TOKEN — using CKAN Open Data Portal')
  return runCkanScrapeJob()
}
