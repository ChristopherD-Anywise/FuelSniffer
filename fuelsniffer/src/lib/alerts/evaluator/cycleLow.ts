/**
 * SP-5 Alerts — cycle_low evaluator.
 *
 * Edge-triggered: fires when cycle_signals transitions INTO 'FILL_NOW'.
 * Detects transition by comparing the latest signal row vs the previous row
 * for each (suburb_key, fuel_type_id).
 *
 * Also fetches the top 3 cheapest stations for the email body.
 *
 * Dedup key: 'cycle:{suburb_key}:{fuel_type_id}:{yyyy-mm-dd}'
 */
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { Alert, DeliveryCandidate } from '../types'
import type { CycleLowCriteria } from '../criteria'

export async function evaluateCycleLow(
  alerts: Alert[],
  sinceTs: Date
): Promise<DeliveryCandidate[]> {
  if (alerts.length === 0) return []

  // Find all FILL_NOW transitions since sinceTs
  // A transition = current signal is FILL_NOW AND the previous signal was not FILL_NOW
  const transitionRows = await db.execute(sql`
    SELECT DISTINCT ON (suburb_key, fuel_type_id)
      suburb_key,
      fuel_type_id,
      signal_state,
      suburb_display,
      computed_at,
      LAG(signal_state) OVER (
        PARTITION BY suburb_key, fuel_type_id
        ORDER BY computed_at ASC
      ) AS prev_signal_state
    FROM cycle_signals
    WHERE computed_at >= ${sinceTs.toISOString()}
    ORDER BY suburb_key, fuel_type_id, computed_at DESC
  `)

  type TransitionRow = {
    suburb_key: string
    fuel_type_id: number
    signal_state: string
    suburb_display: string
    computed_at: Date
    prev_signal_state: string | null
  }

  // Keep only rows that are FILL_NOW and where the previous signal was different
  const transitions = (transitionRows as unknown as TransitionRow[]).filter(
    row => row.signal_state === 'FILL_NOW' && row.prev_signal_state !== 'FILL_NOW'
  )

  if (transitions.length === 0) return []

  const candidates: DeliveryCandidate[] = []
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  for (const alert of alerts) {
    const criteria = alert.criteriaJson as CycleLowCriteria

    // Check if any transition matches this alert's suburb+fuel
    const matching = transitions.filter(
      t => t.suburb_key === criteria.suburb_key && t.fuel_type_id === criteria.fuel_type_id
    )

    if (matching.length === 0) continue

    const transition = matching[0]

    // Fetch top 3 stations for the email body
    let topStations: Array<{ name: string; priceCents: number; distanceKm: number }> = []

    try {
      const stationRows = await db.execute(sql`
        SELECT DISTINCT ON (s.id)
          s.name,
          pr.price_cents,
          0.0 AS distance_km
        FROM stations s
        JOIN price_readings pr ON pr.station_id = s.id
        WHERE pr.fuel_type_id = ${criteria.fuel_type_id}
          AND lower(s.suburb) || '|' || lower(s.state) = ${criteria.suburb_key}
          AND s.is_active = true
        ORDER BY s.id, pr.recorded_at DESC
        LIMIT 3
      `)

      type StationRow = { name: string; price_cents: string; distance_km: number }
      topStations = (stationRows as unknown as StationRow[]).map(r => ({
        name: r.name,
        priceCents: parseFloat(r.price_cents),
        distanceKm: r.distance_km,
      }))
    } catch (err) {
      console.error(`[evaluator:cycle_low] Failed to fetch top stations for alert ${alert.id}:`, err)
    }

    // Fetch fuel name
    let fuelName = `Fuel ${criteria.fuel_type_id}`
    let fuelCode = String(criteria.fuel_type_id)
    try {
      const ftRows = await db.execute(sql`
        SELECT code, display_name FROM fuel_types WHERE id = ${criteria.fuel_type_id} LIMIT 1
      `)
      const ft = (ftRows as unknown as Array<{ code: string; display_name: string }>)[0]
      if (ft) { fuelName = ft.display_name; fuelCode = ft.code }
    } catch { /* non-fatal */ }

    const dedupKey = `cycle:${criteria.suburb_key}:${criteria.fuel_type_id}:${today}`

    candidates.push({
      alert,
      dedupKey,
      payloadData: {
        suburbKey: criteria.suburb_key,
        fuelTypeId: criteria.fuel_type_id,
        suburbDisplay: transition.suburb_display,
        signalState: transition.signal_state,
      },
      context: {
        fuelCode,
        fuelName,
        suburbDisplay: transition.suburb_display,
        signalState: transition.signal_state,
        topStations,
      },
    })
  }

  return candidates
}
