/**
 * SP-4 Cycle Engine — DB-aware compute layer.
 *
 * Fetches price_readings from DB, builds DailyEntry series,
 * runs the pure detector, and upserts results into cycle_signals.
 *
 * CRITICAL: All suburb_key construction uses lower(suburb)||'|'||lower(state)
 * defensively — QLD does NOT normalise suburb casing at ingest.
 */

import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { computeSignal } from './detector'
import { DEFAULT_CONFIG, CURRENT_ALGO_VERSION } from './config'
import type { CycleConfig } from './config'
import { rowsToDailyEntries } from './transform'
import type { SuburbSeriesRow } from './transform'

// ── Types ───────────────────────────────────────────────────────────────────

interface SuburbFuelPair {
  suburbKey:     string
  suburbDisplay: string
  stateCode:     string
  fuelTypeId:    number
}

interface CycleRunHealth {
  rowsWritten:    number
  uncertainCount: number
  suburbsScanned: number
  durationMs:     number
  error?:         string
}

// ── Series fetcher ───────────────────────────────────────────────────────────

/**
 * Fetch the price series for a (suburb_key, fuel_type_id) over the lookback window.
 * Returns one row per (station, day) with the daily minimum price.
 *
 * GOTCHA: lower(s.suburb)||'|'||lower(s.state) — QLD has mixed-case suburbs.
 */
export async function fetchSuburbSeries(
  suburbKey: string,
  fuelTypeId: number,
  lookbackDays: number,
): Promise<SuburbSeriesRow[]> {
  const rows = await db.execute(sql`
    SELECT
      s.id::text                                      AS station_id,
      lower(s.suburb) || '|' || lower(s.state)       AS suburb_key,
      s.suburb                                        AS suburb_display,
      s.state                                         AS state_code,
      (pr.recorded_at AT TIME ZONE 'Australia/Brisbane')::date::text AS day,
      MIN(pr.price_cents::float)                      AS day_min,
      -- Latest price per station on this day (for cheapest_now on today)
      (array_agg(pr.price_cents::float ORDER BY pr.recorded_at DESC))[1] AS latest_price,
      (pr.recorded_at AT TIME ZONE 'Australia/Brisbane')::date
        = (NOW() AT TIME ZONE 'Australia/Brisbane')::date AS is_today
    FROM price_readings pr
    JOIN stations s ON s.id = pr.station_id
    WHERE lower(s.suburb) || '|' || lower(s.state) = ${suburbKey}
      AND pr.fuel_type_id = ${fuelTypeId}
      AND pr.recorded_at >= NOW() - (${lookbackDays} || ' days')::interval
      AND s.is_active = true
    GROUP BY s.id, suburb_key, suburb_display, state_code, day, is_today
    ORDER BY day ASC, s.id ASC
  `)
  return rows as unknown as SuburbSeriesRow[]
}

// ── Active suburb-fuel pairs ─────────────────────────────────────────────────

/**
 * Returns all (suburb_key, fuel_type_id) pairs that have data within the lookback window.
 * Used by the nightly full recompute to enumerate work items.
 */
export async function fetchActiveSuburbFuelPairs(lookbackDays: number): Promise<SuburbFuelPair[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT
      lower(s.suburb) || '|' || lower(s.state) AS suburb_key,
      s.suburb                                  AS suburb_display,
      s.state                                   AS state_code,
      pr.fuel_type_id
    FROM price_readings pr
    JOIN stations s ON s.id = pr.station_id
    WHERE pr.recorded_at >= NOW() - (${lookbackDays} || ' days')::interval
      AND s.is_active = true
      AND s.suburb IS NOT NULL
      AND s.state IS NOT NULL
    ORDER BY suburb_key, pr.fuel_type_id
  `)
  return rows as unknown as SuburbFuelPair[]
}

// ── Compute + upsert ─────────────────────────────────────────────────────────

/**
 * Compute and upsert the signal for one (suburb_key, fuel_type_id) on a given date.
 * Idempotent: ON CONFLICT updates computed_at + signal fields.
 *
 * @param suburbKey   e.g. 'chermside|qld' — already lowercased
 * @param fuelTypeId  canonical fuel_type_id
 * @param forDate     YYYY-MM-DD in AEST; defaults to today in Brisbane TZ
 * @param config      override defaults for tests
 */
export async function computeAndUpsertSignal(
  suburbKey: string,
  fuelTypeId: number,
  forDate?: string,
  config: CycleConfig = DEFAULT_CONFIG,
): Promise<{ signalState: string; suburbKey: string; fuelTypeId: number }> {
  const rows = await fetchSuburbSeries(suburbKey, fuelTypeId, config.LOOKBACK_DAYS)

  // Derive suburb_display and state_code from first row
  const firstRow = rows[0]
  const suburbDisplay = firstRow?.suburb_display ?? suburbKey.split('|')[0]
  const stateCode     = firstRow?.state_code ?? suburbKey.split('|')[1]?.toUpperCase() ?? 'UNK'

  const entries = rowsToDailyEntries(rows)
  const result  = computeSignal(entries, config)

  // Resolve the date to write for
  const computedFor = forDate ?? await getTodayAEST()

  await db.execute(sql`
    INSERT INTO cycle_signals
      (suburb_key, suburb_display, state_code, fuel_type_id,
       computed_for, computed_at, signal_state, confidence,
       label, supporting, algo_version)
    VALUES (
      ${suburbKey}, ${suburbDisplay}, ${stateCode}, ${fuelTypeId},
      ${computedFor}::date, NOW(), ${result.signalState}, ${result.confidence},
      ${result.label}, ${JSON.stringify(result.supporting)}::jsonb, ${CURRENT_ALGO_VERSION}
    )
    ON CONFLICT (suburb_key, fuel_type_id, computed_for, algo_version)
    DO UPDATE SET
      computed_at   = EXCLUDED.computed_at,
      signal_state  = EXCLUDED.signal_state,
      confidence    = EXCLUDED.confidence,
      label         = EXCLUDED.label,
      supporting    = EXCLUDED.supporting
  `)

  return { signalState: result.signalState, suburbKey, fuelTypeId }
}

// ── Nightly full recompute ───────────────────────────────────────────────────

/**
 * Run the nightly full recompute for all active (suburb_key, fuel_type_id) pairs.
 * Writes a health row to scrape_health-like log after completion.
 */
export async function runNightlyCompute(config: CycleConfig = DEFAULT_CONFIG): Promise<CycleRunHealth> {
  const startMs = Date.now()
  let rowsWritten = 0
  let uncertainCount = 0
  let error: string | undefined

  try {
    const pairs = await fetchActiveSuburbFuelPairs(config.LOOKBACK_DAYS)
    console.log(`[cycle] Nightly compute: ${pairs.length} suburb-fuel pairs`)

    for (const { suburbKey, fuelTypeId } of pairs) {
      try {
        const { signalState } = await computeAndUpsertSignal(suburbKey, fuelTypeId, undefined, config)
        rowsWritten++
        if (signalState === 'UNCERTAIN') uncertainCount++
      } catch (err) {
        console.error(`[cycle] Failed for ${suburbKey}/${fuelTypeId}:`, err)
      }
    }

    console.log(`[cycle] Nightly compute complete: ${rowsWritten} rows, ${uncertainCount} UNCERTAIN`)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    console.error('[cycle] Nightly compute failed:', err)
  }

  return {
    rowsWritten,
    uncertainCount,
    suburbsScanned: rowsWritten,
    durationMs: Date.now() - startMs,
    error,
  }
}

// ── Intraday refresh ─────────────────────────────────────────────────────────

/**
 * Light intraday refresh — recompute today's signal only for touched suburbs.
 * Called by the scraper after each successful scrape.
 *
 * @param touchedSuburbKeys  Set of suburb_keys whose stations had price changes.
 * @param fuelTypeIds        Fuel types to refresh (default: all active fuel types).
 */
export async function runIntradayRefresh(
  touchedSuburbKeys: Set<string>,
  fuelTypeIds?: number[],
  config: CycleConfig = DEFAULT_CONFIG,
): Promise<void> {
  if (touchedSuburbKeys.size === 0) return

  // If no fuelTypeIds provided, discover from touched suburbs
  const fuelIds = fuelTypeIds ?? await fetchFuelTypesForSuburbs([...touchedSuburbKeys])

  let refreshed = 0
  for (const suburbKey of touchedSuburbKeys) {
    for (const fuelTypeId of fuelIds) {
      try {
        await computeAndUpsertSignal(suburbKey, fuelTypeId, undefined, config)
        refreshed++
      } catch {
        // Non-fatal for intraday
      }
    }
  }

  if (refreshed > 0) {
    console.log(`[cycle] Intraday refresh: ${refreshed} signals updated for ${touchedSuburbKeys.size} suburbs`)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getTodayAEST(): Promise<string> {
  const rows = await db.execute(sql`
    SELECT (NOW() AT TIME ZONE 'Australia/Brisbane')::date::text AS today
  `)
  const r = rows as unknown as Array<{ today: string }>
  return r[0].today
}

async function fetchFuelTypesForSuburbs(suburbKeys: string[]): Promise<number[]> {
  if (suburbKeys.length === 0) return []
  const rows = await db.execute(sql`
    SELECT DISTINCT pr.fuel_type_id
    FROM price_readings pr
    JOIN stations s ON s.id = pr.station_id
    WHERE lower(s.suburb) || '|' || lower(s.state) = ANY(${suburbKeys})
      AND pr.recorded_at >= NOW() - INTERVAL '1 day'
  `)
  const r = rows as unknown as Array<{ fuel_type_id: number }>
  return r.map(row => row.fuel_type_id)
}
