import axios from 'axios'
import { db } from '@/lib/db/client'
import { stations, priceReadings, scrapeHealth } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import type { FuelPriceProvider } from '@/lib/providers/fuel'

// ── Healthchecks.io dead-man's-switch ────────────────────────────────────────

/**
 * Ping the Healthchecks.io dead-man's switch for a specific provider.
 *
 * Per-provider env vars (SP-1): HEALTHCHECKS_PING_URL_{QLD,NSW,WA,NT,TAS}
 * Falls back to the legacy HEALTHCHECKS_PING_URL if no per-provider var is set.
 */
async function pingHealthchecks(providerId: string): Promise<void> {
  const perProviderKey = `HEALTHCHECKS_PING_URL_${providerId.toUpperCase()}`
  const pingUrl = process.env[perProviderKey] ?? process.env.HEALTHCHECKS_PING_URL
  if (!pingUrl) return
  try {
    await axios.get(pingUrl, { timeout: 5000 })
  } catch {
    console.error(`[scraper:${providerId}] healthchecks.io ping failed — monitoring may alert`)
  }
}

// ── D-09 helper ───────────────────────────────────────────────────────────────

export function shouldInsertRow(_newPrice: number, _lastPrice: number): boolean {
  return true
}

// ── Scrape result ─────────────────────────────────────────────────────────────

export interface ScrapeResult {
  pricesUpserted: number
  error: string | null
  source: string
}

// ── Generic provider scrape ───────────────────────────────────────────────────

/**
 * Run one complete scrape cycle for a given provider.
 * Handles station upsert, price deduplication by source_ts, DB insert,
 * scrape_health logging, and healthchecks.io ping.
 */
export async function runProviderScrape(provider: FuelPriceProvider): Promise<ScrapeResult> {
  const startTime = Date.now()

  try {
    const recordedAt = new Date()

    // Fetch and upsert stations
    const normStations = await provider.fetchStations()

    if (normStations.length > 0) {
      await db
        .insert(stations)
        .values(normStations.map(s => ({
          id:             s.id,
          name:           s.name,
          brand:          s.brand,
          address:        s.address,
          suburb:         s.suburb,
          postcode:       s.postcode,
          latitude:       s.latitude,
          longitude:      s.longitude,
          isActive:       true,
          lastSeenAt:     new Date(),
          externalId:     s.externalId,
          sourceProvider: s.sourceProvider,
          // SP-1 jurisdiction fields (defaulted in schema if absent)
          ...(s.state        !== undefined ? { state:          s.state }        : {}),
          ...(s.jurisdiction !== undefined ? { jurisdiction:   s.jurisdiction } : {}),
          ...(s.timezone     !== undefined ? { timezone:       s.timezone }     : {}),
          ...(s.region       !== undefined ? { region:         s.region }       : {}),
          ...(s.sourceMetadata !== undefined ? { sourceMetadata: s.sourceMetadata } : {}),
        })))
        .onConflictDoUpdate({
          target: stations.id,
          set: {
            name:        sql`excluded.name`,
            brand:       sql`excluded.brand`,
            address:     sql`excluded.address`,
            suburb:      sql`excluded.suburb`,
            postcode:    sql`excluded.postcode`,
            latitude:    sql`excluded.latitude`,
            longitude:   sql`excluded.longitude`,
            isActive:    sql`true`,
            lastSeenAt:  sql`excluded.last_seen_at`,
          },
        })
    }

    // Fetch the latest source_ts per station+fuel to deduplicate
    // Restrict to last 24 hours to keep the query fast (index-friendly)
    const latestSourceTs = await db.execute(sql`
      SELECT DISTINCT ON (station_id, fuel_type_id)
        station_id, fuel_type_id, source_ts
      FROM price_readings
      WHERE recorded_at > NOW() - INTERVAL '1 day'
      ORDER BY station_id, fuel_type_id, recorded_at DESC
    `)
    const seenKey = new Set(
      (latestSourceTs as unknown as Array<{ station_id: number; fuel_type_id: number; source_ts: Date }>)
        .map(r => `${r.station_id}-${r.fuel_type_id}-${new Date(r.source_ts).getTime()}`)
    )

    // Fetch normalised prices
    const normPrices = await provider.fetchPrices(recordedAt)

    // Only insert rows where source_ts is new
    const newPriceRows = normPrices.filter(p => {
      const key = `${p.stationId}-${p.fuelTypeId}-${new Date(p.sourceTs).getTime()}`
      return !seenKey.has(key)
    })

    if (newPriceRows.length > 0) {
      await db.insert(priceReadings).values(
        newPriceRows.map(p => ({
          ...p,
          // SP-1: include validFrom if present (WA T+1), otherwise omit (defaults to recordedAt via migration)
          ...(p.validFrom !== undefined ? { validFrom: p.validFrom } : {}),
        }))
      )
    }

    const durationMs = Date.now() - startTime
    const pricesUpserted = newPriceRows.length
    const skipped = normPrices.length - newPriceRows.length

    // SP-1: include provider in health row
    await db.insert(scrapeHealth).values({
      pricesUpserted,
      durationMs,
      error:    null,
      provider: provider.id,
    })
    await pingHealthchecks(provider.id)

    console.log(`[scraper:${provider.id}] OK — ${pricesUpserted} new prices, ${skipped} unchanged in ${durationMs}ms`)

    return { pricesUpserted, error: null, source: provider.id }

  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[scraper:${provider.id}] FAILED after ${durationMs}ms: ${errorMessage}`)

    try {
      await db.insert(scrapeHealth).values({
        pricesUpserted: 0,
        durationMs,
        error:    errorMessage,
        provider: provider.id,
      })
    } catch (dbErr) {
      console.error(`[scraper:${provider.id}] Could not write failure record:`, dbErr)
    }

    return { pricesUpserted: 0, error: errorMessage, source: provider.id }
  }
}

// ── Legacy entry point (used by existing tests) ───────────────────────────────

/**
 * @deprecated Use runProviderScrape(provider) directly via the scheduler.
 * Kept for backward compatibility with existing tests.
 */
export async function runScrapeJob(): Promise<ScrapeResult> {
  const { QldFuelProvider } = await import('@/lib/providers/fuel/qld')
  return runProviderScrape(new QldFuelProvider())
}
