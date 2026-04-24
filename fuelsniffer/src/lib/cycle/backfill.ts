/**
 * SP-4 Cycle Engine — Historical backfill script.
 *
 * Computes cycle_signals for all historical days, iterating from
 * the earliest available price_reading up to today.
 *
 * Usage:
 *   npx tsx src/lib/cycle/backfill.ts
 *   npx tsx src/lib/cycle/backfill.ts --from=2025-10-01
 *   npx tsx src/lib/cycle/backfill.ts --dry-run
 *
 * Idempotent: ON CONFLICT DO NOTHING for backfill rows (preserves existing signals).
 * Estimated cost (QLD-only, 6 months × ~50 suburbs × 4 fuel types) ≈ 36k rows.
 */

import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { fetchActiveSuburbFuelPairs } from './compute'
import { rowsToDailyEntries } from './transform'
import { computeSignal } from './detector'
import { DEFAULT_CONFIG, CURRENT_ALGO_VERSION } from './config'

const args = process.argv.slice(2)
const dryRun  = args.includes('--dry-run')
const fromArg = args.find(a => a.startsWith('--from='))?.replace('--from=', '')

async function getEarliestDate(): Promise<string> {
  const rows = await db.execute(sql`
    SELECT MIN(recorded_at AT TIME ZONE 'Australia/Brisbane')::date::text AS earliest
    FROM price_readings
  `)
  const r = rows as unknown as Array<{ earliest: string | null }>
  return r[0]?.earliest ?? new Date().toISOString().slice(0, 10)
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + 'T00:00:00Z')
  const end = new Date(to   + 'T00:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

async function backfillDay(
  suburbKey: string,
  suburbDisplay: string,
  stateCode: string,
  fuelTypeId: number,
  forDate: string,
): Promise<'written' | 'skipped' | 'error'> {
  try {
    // Fetch the window ending on forDate
    const cutoffRows = await db.execute(sql`
      SELECT
        s.id::text                                    AS station_id,
        lower(s.suburb) || '|' || lower(s.state)     AS suburb_key,
        s.suburb                                      AS suburb_display,
        s.state                                       AS state_code,
        (pr.recorded_at AT TIME ZONE 'Australia/Brisbane')::date::text AS day,
        MIN(pr.price_cents::float)                    AS day_min,
        (array_agg(pr.price_cents::float ORDER BY pr.recorded_at DESC))[1] AS latest_price,
        (pr.recorded_at AT TIME ZONE 'Australia/Brisbane')::date
          = ${forDate}::date                          AS is_today
      FROM price_readings pr
      JOIN stations s ON s.id = pr.station_id
      WHERE lower(s.suburb) || '|' || lower(s.state) = ${suburbKey}
        AND pr.fuel_type_id = ${fuelTypeId}
        AND (pr.recorded_at AT TIME ZONE 'Australia/Brisbane')::date
          BETWEEN ${forDate}::date - ${DEFAULT_CONFIG.LOOKBACK_DAYS}
              AND ${forDate}::date
        AND s.is_active = true
      GROUP BY s.id, suburb_key, suburb_display, state_code, day, is_today
      ORDER BY day ASC, s.id ASC
    `)

    const rows = cutoffRows as unknown as Parameters<typeof rowsToDailyEntries>[0]
    const entries = rowsToDailyEntries(rows)
    const result  = computeSignal(entries, DEFAULT_CONFIG)

    if (dryRun) {
      console.log(`[backfill/dry-run] ${forDate} ${suburbKey} ft=${fuelTypeId} → ${result.signalState}`)
      return 'written'
    }

    await db.execute(sql`
      INSERT INTO cycle_signals
        (suburb_key, suburb_display, state_code, fuel_type_id,
         computed_for, computed_at, signal_state, confidence,
         label, supporting, algo_version)
      VALUES (
        ${suburbKey}, ${suburbDisplay}, ${stateCode}, ${fuelTypeId},
        ${forDate}::date, NOW(), ${result.signalState}, ${result.confidence},
        ${result.label}, ${JSON.stringify(result.supporting)}::jsonb, ${CURRENT_ALGO_VERSION}
      )
      ON CONFLICT (suburb_key, fuel_type_id, computed_for, algo_version)
      DO NOTHING
    `)

    return 'written'
  } catch (err) {
    console.error(`[backfill] Error for ${suburbKey}/${fuelTypeId}/${forDate}:`, err)
    return 'error'
  }
}

async function main() {
  console.log('[backfill] Starting SP-4 cycle signals backfill...')
  if (dryRun) console.log('[backfill] DRY RUN — no rows will be written')

  const todayAEST = (await db.execute(sql`
    SELECT (NOW() AT TIME ZONE 'Australia/Brisbane')::date::text AS today
  `) as unknown as Array<{ today: string }>)[0].today

  const fromDate = fromArg ?? await getEarliestDate()
  const dates    = dateRange(fromDate, todayAEST)

  console.log(`[backfill] Date range: ${fromDate} → ${todayAEST} (${dates.length} days)`)

  const pairs = await fetchActiveSuburbFuelPairs(365) // broad lookback for backfill
  console.log(`[backfill] ${pairs.length} active suburb-fuel pairs`)

  let written = 0
  let errors  = 0

  for (const forDate of dates) {
    for (const { suburbKey, suburbDisplay, stateCode, fuelTypeId } of pairs) {
      const outcome = await backfillDay(suburbKey, suburbDisplay, stateCode, fuelTypeId, forDate)
      if (outcome === 'written') written++
      if (outcome === 'error')   errors++
    }
    if (dates.indexOf(forDate) % 30 === 0) {
      console.log(`[backfill] Progress: ${forDate} (${written} written, ${errors} errors)`)
    }
  }

  console.log(`[backfill] Complete: ${written} rows written, ${errors} errors`)
  process.exit(0)
}

main().catch(err => {
  console.error('[backfill] Fatal:', err)
  process.exit(1)
})
