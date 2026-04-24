/**
 * SP-4 Cycle Engine — query layer.
 *
 * getSignal, getSignalForStation, getRecentSignals.
 *
 * All suburb_key construction applies lower() defensively.
 * Phase B: ALGO_PRIORITY preference is applied in-query via array position.
 */

import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { CycleSignalView, SupportingStats } from './types'
import { ALGO_PRIORITY } from './config'

// ── Internal DB row type ─────────────────────────────────────────────────────

interface CycleSignalRow {
  id:             number | string
  suburb_key:     string
  suburb_display: string
  state_code:     string
  fuel_type_id:   number | string
  computed_for:   string
  computed_at:    string
  signal_state:   string
  confidence:     number | string
  label:          string
  supporting:     SupportingStats | string
  algo_version:   string
}

function rowToView(row: CycleSignalRow): CycleSignalView {
  const supporting = typeof row.supporting === 'string'
    ? JSON.parse(row.supporting) as SupportingStats
    : row.supporting

  return {
    state:       row.signal_state as CycleSignalView['state'],
    label:       row.label,
    confidence:  Number(row.confidence),
    suburb:      row.suburb_display,
    suburbKey:   row.suburb_key,
    fuelTypeId:  Number(row.fuel_type_id),
    computedFor: typeof row.computed_for === 'string'
      ? row.computed_for.slice(0, 10)
      : String(row.computed_for),
    computedAt:  String(row.computed_at),
    algoVersion: row.algo_version,
    supporting,
  }
}

// ── Algo priority SQL fragment ───────────────────────────────────────────────

/**
 * Returns the highest-priority algo_version present for a suburb-fuel on a given date.
 * ALGO_PRIORITY = ['rule-v1', 'forecast-v1'] — higher index = higher priority.
 */
function algoPriorityCase(): string {
  // CASE WHEN algo_version = 'forecast-v1' THEN 1 WHEN algo_version = 'rule-v1' THEN 0 ELSE -1 END DESC
  const cases = ALGO_PRIORITY.map((v, i) => `WHEN algo_version = '${v}' THEN ${i}`).join(' ')
  return `CASE ${cases} ELSE -1 END`
}

// ── Public query functions ───────────────────────────────────────────────────

/**
 * Returns the most recent signal for today for (suburb_key, fuel_type_id).
 * Prefers the highest-priority algo_version.
 * 'today' is resolved in Australia/Brisbane timezone.
 *
 * @returns CycleSignalView or null if no signal exists for today.
 */
export async function getSignal(
  suburbKey: string,
  fuelTypeId: number,
): Promise<CycleSignalView | null> {
  // Normalise the key defensively
  const normKey = suburbKey.toLowerCase()

  const rows = await db.execute(sql`
    SELECT *
    FROM cycle_signals
    WHERE suburb_key   = ${normKey}
      AND fuel_type_id = ${fuelTypeId}
      AND computed_for = (NOW() AT TIME ZONE 'Australia/Brisbane')::date
    ORDER BY ${sql.raw(algoPriorityCase())} DESC, computed_at DESC
    LIMIT 1
  `)

  const r = rows as unknown as CycleSignalRow[]
  if (r.length === 0) return null
  return rowToView(r[0])
}

/**
 * Convenience function: resolve station → suburb_key → getSignal.
 * Falls back to postcode-level signal if suburb signal is UNCERTAIN or missing.
 *
 * CRITICAL: applies lower() when building suburb_key from stations table.
 */
export async function getSignalForStation(
  stationId: number,
  fuelTypeId: number,
): Promise<CycleSignalView | null> {
  // Look up station's suburb + state + postcode
  const stationRows = await db.execute(sql`
    SELECT
      lower(suburb) || '|' || lower(state)   AS suburb_key,
      lower(postcode) || '|' || lower(state) AS postcode_key,
      suburb,
      state,
      postcode
    FROM stations
    WHERE id = ${stationId}
      AND suburb IS NOT NULL
      AND state IS NOT NULL
    LIMIT 1
  `)

  const stations = stationRows as unknown as Array<{
    suburb_key: string
    postcode_key: string
    suburb: string
    state: string
    postcode: string | null
  }>

  if (stations.length === 0) return null

  const { suburb_key, postcode_key } = stations[0]

  // Try suburb-level first
  const suburbSignal = await getSignal(suburb_key, fuelTypeId)

  // If suburb signal is UNCERTAIN (or missing), fall back to postcode
  if (!suburbSignal || suburbSignal.state === 'UNCERTAIN') {
    if (postcode_key && postcode_key !== '|') {
      const postcodeSignal = await getSignal(postcode_key, fuelTypeId)
      if (postcodeSignal && postcodeSignal.state !== 'UNCERTAIN') {
        return postcodeSignal
      }
    }
    return suburbSignal  // return UNCERTAIN or null — caller handles gracefully
  }

  return suburbSignal
}

/**
 * Returns recent signals for (suburb_key, fuel_type_id) for the last N days.
 * Used for charts and debugging. Sorted ascending by computed_for.
 */
export async function getRecentSignals(
  suburbKey: string,
  fuelTypeId: number,
  days = 30,
): Promise<CycleSignalView[]> {
  const normKey = suburbKey.toLowerCase()

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (computed_for)
      *
    FROM cycle_signals
    WHERE suburb_key   = ${normKey}
      AND fuel_type_id = ${fuelTypeId}
      AND computed_for >= (NOW() AT TIME ZONE 'Australia/Brisbane')::date - ${days}
    ORDER BY computed_for ASC, ${sql.raw(algoPriorityCase())} DESC
  `)

  const r = rows as unknown as CycleSignalRow[]
  return r.map(rowToView)
}

/**
 * Returns the last successful cycle compute timestamp and today's signal counts.
 * Used by /api/health.
 */
export async function getCycleHealth(): Promise<{
  lastComputedAt: string | null
  todaySignals:   number
  uncertainCount: number
}> {
  const rows = await db.execute(sql`
    SELECT
      MAX(computed_at)::text                                                  AS last_computed_at,
      COUNT(*)::int                                                           AS total_signals,
      COUNT(*) FILTER (WHERE signal_state = 'UNCERTAIN')::int                AS uncertain_count
    FROM cycle_signals
    WHERE computed_for = (NOW() AT TIME ZONE 'Australia/Brisbane')::date
  `)

  const r = rows as unknown as Array<{
    last_computed_at: string | null
    total_signals:    number | string
    uncertain_count:  number | string
  }>

  if (r.length === 0) return { lastComputedAt: null, todaySignals: 0, uncertainCount: 0 }

  return {
    lastComputedAt: r[0].last_computed_at,
    todaySignals:   Number(r[0].total_signals),
    uncertainCount: Number(r[0].uncertain_count),
  }
}
