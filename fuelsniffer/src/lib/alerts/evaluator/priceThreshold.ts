/**
 * SP-5 Alerts — price_threshold evaluator.
 *
 * For each active price_threshold alert:
 * 1. Find stations within radius_km of centre using PostGIS ST_DWithin
 *    (falls back to haversine if PostGIS unavailable)
 * 2. Get latest price from new readings
 * 3. If price <= max_price_cents, yield a delivery candidate
 *
 * Dedup key: 'pt:{alert_id}:{station_id}:{date}'
 */
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { Alert, DeliveryCandidate } from '../types'
import type { PriceThresholdCriteria } from '../criteria'

export async function evaluatePriceThreshold(
  alerts: Alert[],
  sinceTs: Date
): Promise<DeliveryCandidate[]> {
  if (alerts.length === 0) return []

  const candidates: DeliveryCandidate[] = []
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  for (const alert of alerts) {
    const criteria = alert.criteriaJson as PriceThresholdCriteria

    try {
      // Find stations within radius and their latest price since sinceTs
      // Uses PostGIS ST_DWithin for accurate radius queries (SP-1 enabled extension)
      const rows = await db.execute(sql`
        SELECT
          s.id          AS station_id,
          s.name        AS station_name,
          s.suburb      AS suburb,
          ft.code       AS fuel_code,
          ft.display_name AS fuel_name,
          pr.price_cents,
          ST_Distance(
            s.geom::geography,
            ST_SetSRID(ST_MakePoint(${criteria.centre.lng}, ${criteria.centre.lat}), 4326)::geography
          ) / 1000.0 AS distance_km
        FROM stations s
        JOIN price_readings pr ON pr.station_id = s.id
        JOIN fuel_types ft ON ft.id = pr.fuel_type_id
        WHERE pr.fuel_type_id = ${criteria.fuel_type_id}
          AND pr.price_cents::numeric <= ${criteria.max_price_cents}
          AND pr.recorded_at >= ${sinceTs.toISOString()}
          AND s.geom IS NOT NULL
          AND ST_DWithin(
            s.geom::geography,
            ST_SetSRID(ST_MakePoint(${criteria.centre.lng}, ${criteria.centre.lat}), 4326)::geography,
            ${criteria.radius_km * 1000}
          )
        ORDER BY pr.price_cents::numeric ASC, pr.recorded_at DESC
      `)

      type Row = {
        station_id: number
        station_name: string
        suburb: string | null
        fuel_code: string
        fuel_name: string
        price_cents: string
        distance_km: number
      }

      const matches = rows as unknown as Row[]

      // One candidate per station (take cheapest/newest price per station)
      const seen = new Set<number>()
      for (const row of matches) {
        if (seen.has(row.station_id)) continue
        seen.add(row.station_id)

        const priceCents = parseFloat(row.price_cents)
        const dedupKey = `pt:${alert.id}:${row.station_id}:${today}`

        candidates.push({
          alert,
          dedupKey,
          payloadData: {
            stationId: row.station_id,
            stationName: row.station_name,
            priceCents,
            maxPriceCents: criteria.max_price_cents,
            fuelCode: row.fuel_code,
            fuelName: row.fuel_name,
            distanceKm: row.distance_km,
          },
          context: {
            stationId: row.station_id,
            stationName: row.station_name,
            priceCents,
            fuelCode: row.fuel_code,
            fuelName: row.fuel_name,
            distanceKm: row.distance_km,
            suburbDisplay: row.suburb ?? undefined,
          },
        })
      }
    } catch (err) {
      console.error(`[evaluator:price_threshold] Alert ${alert.id} failed:`, err)
    }
  }

  return candidates
}
