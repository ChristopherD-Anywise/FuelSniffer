/**
 * SP-5 Alerts — favourite_drop evaluator.
 *
 * For each active favourite_drop alert:
 * 1. Get current price and price from `now - window_minutes` ago
 * 2. If drop >= min_drop_cents, yield a delivery candidate
 *
 * Dedup key: 'fd:{alert_id}:{date}:{4h-bucket}'
 */
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { Alert, DeliveryCandidate } from '../types'
import type { FavouriteDropCriteria } from '../criteria'

export async function evaluateFavouriteDrop(
  alerts: Alert[]
): Promise<DeliveryCandidate[]> {
  if (alerts.length === 0) return []

  const candidates: DeliveryCandidate[] = []
  const now = new Date()
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD
  const fourHourBucket = Math.floor(now.getHours() / 4)

  for (const alert of alerts) {
    const criteria = alert.criteriaJson as FavouriteDropCriteria

    try {
      const rows = await db.execute(sql`
        SELECT
          s.name      AS station_name,
          ft.code     AS fuel_code,
          ft.display_name AS fuel_name,
          current_price.price_cents AS current_price_cents,
          older_price.price_cents   AS older_price_cents
        FROM stations s
        JOIN fuel_types ft ON ft.id = ${criteria.fuel_type_id}
        -- Current price (most recent reading)
        JOIN LATERAL (
          SELECT price_cents
          FROM price_readings
          WHERE station_id = ${criteria.station_id}
            AND fuel_type_id = ${criteria.fuel_type_id}
          ORDER BY recorded_at DESC
          LIMIT 1
        ) current_price ON true
        -- Older price (around window_minutes ago)
        JOIN LATERAL (
          SELECT price_cents
          FROM price_readings
          WHERE station_id = ${criteria.station_id}
            AND fuel_type_id = ${criteria.fuel_type_id}
            AND recorded_at <= NOW() - (${criteria.window_minutes} || ' minutes')::interval
          ORDER BY recorded_at DESC
          LIMIT 1
        ) older_price ON true
        WHERE s.id = ${criteria.station_id}
      `)

      type Row = {
        station_name: string
        fuel_code: string
        fuel_name: string
        current_price_cents: string
        older_price_cents: string
      }

      const match = (rows as unknown as Row[])[0]
      if (!match) continue

      const currentPrice = parseFloat(match.current_price_cents)
      const olderPrice = parseFloat(match.older_price_cents)
      const drop = olderPrice - currentPrice

      if (drop >= criteria.min_drop_cents) {
        const dedupKey = `fd:${alert.id}:${today}:${fourHourBucket}`

        candidates.push({
          alert,
          dedupKey,
          payloadData: {
            stationId: criteria.station_id,
            stationName: match.station_name,
            priceCents: currentPrice,
            dropCents: drop,
            fuelCode: match.fuel_code,
            fuelName: match.fuel_name,
          },
          context: {
            stationId: criteria.station_id,
            stationName: match.station_name,
            priceCents: currentPrice,
            dropCents: drop,
            fuelCode: match.fuel_code,
            fuelName: match.fuel_name,
          },
        })
      }
    } catch (err) {
      console.error(`[evaluator:favourite_drop] Alert ${alert.id} failed:`, err)
    }
  }

  return candidates
}
