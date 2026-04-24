/**
 * SP-5 Alerts — weekly_digest evaluator.
 *
 * Fires on Sunday 06:00–06:59 in the user's local timezone.
 * Computes:
 * - Best day to fill (day with lowest median price over last 4 weeks)
 * - Top 3 cheapest stations within radius now
 * - Cycle signal for user's suburb
 *
 * Dedup key: 'digest:{alert_id}:{iso_year}-W{iso_week}'
 */
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { Alert, DeliveryCandidate } from '../types'
import type { WeeklyDigestCriteria } from '../criteria'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Returns { year, week } ISO 8601 week number */
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNo }
}

/**
 * Check if `now` falls within Sunday 06:00–06:59 in the given IANA timezone.
 */
export function isDigestWindow(timezone: string, now: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const weekday = parts.find(p => p.type === 'weekday')?.value
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  return weekday === 'Sun' && hour === 6
}

export async function evaluateWeeklyDigest(
  alerts: Alert[],
  userTimezone: string,
  now: Date = new Date()
): Promise<DeliveryCandidate[]> {
  if (alerts.length === 0) return []
  if (!isDigestWindow(userTimezone, now)) return []

  const candidates: DeliveryCandidate[] = []
  const { year, week } = isoWeek(now)
  const dedupKeySuffix = `${year}-W${String(week).padStart(2, '0')}`

  for (const alert of alerts) {
    const criteria = alert.criteriaJson as WeeklyDigestCriteria
    const dedupKey = `digest:${alert.id}:${dedupKeySuffix}`

    let topStations: Array<{ name: string; priceCents: number; distanceKm: number }> = []
    let bestDayToFill = 'Unknown'
    let signalState = 'UNCERTAIN'
    let signalLabel = 'Check prices'
    let fuelName = `Fuel ${criteria.fuel_type_id}`
    let fuelCode = String(criteria.fuel_type_id)

    try {
      // Fetch fuel name
      const ftRows = await db.execute(sql`
        SELECT code, display_name FROM fuel_types WHERE id = ${criteria.fuel_type_id} LIMIT 1
      `)
      const ft = (ftRows as unknown as Array<{ code: string; display_name: string }>)[0]
      if (ft) { fuelName = ft.display_name; fuelCode = ft.code }

      // Top 3 stations within radius (PostGIS)
      const stationRows = await db.execute(sql`
        SELECT
          s.name,
          pr.price_cents,
          ST_Distance(
            s.geom::geography,
            ST_SetSRID(ST_MakePoint(${criteria.centre.lng}, ${criteria.centre.lat}), 4326)::geography
          ) / 1000.0 AS distance_km
        FROM stations s
        JOIN LATERAL (
          SELECT price_cents
          FROM price_readings
          WHERE station_id = s.id AND fuel_type_id = ${criteria.fuel_type_id}
          ORDER BY recorded_at DESC
          LIMIT 1
        ) pr ON true
        WHERE s.geom IS NOT NULL AND s.is_active = true
          AND ST_DWithin(
            s.geom::geography,
            ST_SetSRID(ST_MakePoint(${criteria.centre.lng}, ${criteria.centre.lat}), 4326)::geography,
            ${criteria.radius_km * 1000}
          )
        ORDER BY pr.price_cents::numeric ASC
        LIMIT 3
      `)

      type StationRow = { name: string; price_cents: string; distance_km: number }
      topStations = (stationRows as unknown as StationRow[]).map(r => ({
        name: r.name,
        priceCents: parseFloat(r.price_cents),
        distanceKm: r.distance_km,
      }))

      // Best day to fill: day-of-week with lowest median price over last 4 weeks
      const bestDayRows = await db.execute(sql`
        SELECT
          EXTRACT(DOW FROM day)::int AS dow,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_price_cents) AS median_price
        FROM daily_prices
        WHERE fuel_type_id = ${criteria.fuel_type_id}
          AND day >= CURRENT_DATE - INTERVAL '28 days'
        GROUP BY EXTRACT(DOW FROM day)
        ORDER BY median_price ASC
        LIMIT 1
      `)

      const bestDay = (bestDayRows as unknown as Array<{ dow: number; median_price: number }>)[0]
      if (bestDay) {
        bestDayToFill = DAYS[bestDay.dow] ?? 'Unknown'
      }

      // Cycle signal — use suburb_key from centre (find nearest suburb)
      const signalRows = await db.execute(sql`
        SELECT signal_state, label
        FROM cycle_signals
        WHERE fuel_type_id = ${criteria.fuel_type_id}
          AND computed_for = CURRENT_DATE
        ORDER BY computed_at DESC
        LIMIT 1
      `)

      const signal = (signalRows as unknown as Array<{ signal_state: string; label: string }>)[0]
      if (signal) {
        signalState = signal.signal_state
        signalLabel = signal.label
      }

    } catch (err) {
      console.error(`[evaluator:weekly_digest] Alert ${alert.id} failed:`, err)
    }

    candidates.push({
      alert,
      dedupKey,
      payloadData: {
        fuelTypeId: criteria.fuel_type_id,
        signalLabel,
        dedupSuffix: dedupKeySuffix,
      },
      context: {
        fuelCode,
        fuelName,
        topStations,
        bestDayToFill,
        signalState,
      },
    })
  }

  return candidates
}
