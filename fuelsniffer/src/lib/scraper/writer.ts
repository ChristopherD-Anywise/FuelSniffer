import axios from 'axios'
import { db } from '@/lib/db/client'
import { stations, priceReadings, scrapeHealth } from '@/lib/db/schema'
import { createApiClient } from './client'
import { normaliseStation, normalisePrice } from './normaliser'
import { sql } from 'drizzle-orm'

// ── Healthchecks.io dead-man's-switch ────────────────────────────────────────

/**
 * Ping healthchecks.io after a successful scrape cycle.
 * Non-fatal: if the ping fails, log and continue — the scraper is still alive.
 * D-03: Failure to ping = dead-man's-switch fires = alert email sent.
 */
async function pingHealthchecks(): Promise<void> {
  const pingUrl = process.env.HEALTHCHECKS_PING_URL
  if (!pingUrl) return  // gracefully skip in local dev (no external monitoring)
  try {
    await axios.get(pingUrl, { timeout: 5000 })
  } catch {
    console.error('[scraper] healthchecks.io ping failed — monitoring may alert')
  }
}

// ── D-09 helper ───────────────────────────────────────────────────────────────

/**
 * D-09 (locked): Always insert a price row regardless of whether price changed.
 * This maintains a consistent time series with no gaps.
 * This function always returns true — it exists to make the decision explicit and testable.
 */
export function shouldInsertRow(_newPrice: number, _lastPrice: number): boolean {
  return true  // D-09: consistent time series — always insert
}

// ── Main scrape orchestrator ──────────────────────────────────────────────────

export interface ScrapeResult {
  pricesUpserted: number
  error: string | null
}

/**
 * Run one complete scrape cycle:
 * 1. Fetch station metadata and prices from QLD API
 * 2. Normalise and filter by 50km radius (D-06)
 * 3. Upsert station records (soft-delete inactive stations via is_active flag, D-05)
 * 4. Insert price rows for all fuel types (D-07)
 * 5. Write scrape_health record
 * 6. Ping healthchecks.io on success (D-03)
 *
 * On failure: writes error row to scrape_health, does NOT ping healthchecks.io.
 * D-08: Retry logic is handled inside createApiClient() via fetchWithRetry.
 * D-10: Minimal logging — errors and summary stats only.
 */
export async function runScrapeJob(): Promise<ScrapeResult> {
  const startTime = Date.now()

  try {
    const client = createApiClient()
    const recordedAt = new Date()

    // 1. Fetch station metadata
    const sitesResponse = await client.getFullSiteDetails()
    const stationRows = sitesResponse.S
      .map(normaliseStation)
      .filter((s): s is NonNullable<typeof s> => s !== null)

    // 2. Upsert stations (D-05: is_active soft-delete managed by caller)
    if (stationRows.length > 0) {
      await db
        .insert(stations)
        .values(stationRows)
        .onConflictDoUpdate({
          target: stations.id,
          set: {
            name:       sql`excluded.name`,
            brand:      sql`excluded.brand`,
            address:    sql`excluded.address`,
            suburb:     sql`excluded.suburb`,
            postcode:   sql`excluded.postcode`,
            latitude:   sql`excluded.latitude`,
            longitude:  sql`excluded.longitude`,
            lastSeenAt: sql`excluded.last_seen_at`,
            // Note: is_active is NOT updated here — soft-delete is managed separately
          },
        })
    }

    // Build a Set of known in-radius station IDs for fast price filtering
    const inRadiusIds = new Set(stationRows.map(s => s.id))

    // 3. Fetch prices
    const pricesResponse = await client.getSitesPrices()
    const priceRows = pricesResponse.SitePrices
      .filter(p => inRadiusIds.has(p.SiteId))  // D-06: only in-radius stations
      .map(p => normalisePrice(p, recordedAt))
      .filter((p): p is NonNullable<typeof p> => p !== null)

    // 4. Insert price rows — D-09: always insert regardless of price change
    if (priceRows.length > 0) {
      await db.insert(priceReadings).values(priceRows)
    }

    const durationMs = Date.now() - startTime
    const pricesUpserted = priceRows.length

    // 5. Write success health record
    await db.insert(scrapeHealth).values({
      pricesUpserted,
      durationMs,
      error: null,
    })

    // 6. Ping healthchecks.io (only on success — dead-man's-switch fires on silence)
    await pingHealthchecks()

    // D-10: Minimal logging — summary stats only
    console.log(`[scraper] OK — ${pricesUpserted} prices in ${durationMs}ms`)

    return { pricesUpserted, error: null }

  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)

    console.error(`[scraper] FAILED after ${durationMs}ms: ${errorMessage}`)

    // Write failure health record — does NOT ping healthchecks.io
    try {
      await db.insert(scrapeHealth).values({
        pricesUpserted: 0,
        durationMs,
        error: errorMessage,
      })
    } catch (dbErr) {
      // If we can't even write to the health table, log but don't rethrow
      console.error('[scraper] Could not write failure record to scrape_health:', dbErr)
    }

    return { pricesUpserted: 0, error: errorMessage }
  }
}
