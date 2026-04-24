import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { computeEffective } from '@/lib/discount/calculator'
import { resolveBrandCode } from '@/lib/discount/registry'

// Default: North Lakes
const DEFAULT_LAT = -27.2353
const DEFAULT_LNG = 153.0189

export interface PriceResult {
  id: number
  name: string
  brand: string | null
  address: string | null
  suburb: string | null
  latitude: number
  longitude: number
  price_cents: string
  recorded_at: Date
  source_ts: Date
  distance_km: number
  price_change: number | null
  // SP-6: True-cost fields — null when no user session or no programmes enrolled
  effective_price_cents: number | null
  applied_programme_id: string | null
  applied_programme_name: string | null
  applied_discount_cents: number
  considered_programme_ids: string[]
}

/**
 * Apply effective price computation to a list of price results.
 * Mutates the objects in-place for efficiency.
 *
 * @param results - Raw price results from DB query
 * @param enrolledIds - Programme IDs the user is enrolled in (not paused).
 *                      Pass [] for unauthenticated / no programmes.
 * @param fuelTypeId  - Fuel type for the current query (string or number)
 */
export function applyEffectivePrices(
  results: PriceResult[],
  enrolledIds: string[],
  fuelTypeId: string | number
): PriceResult[] {
  // Feature flag: FILLIP_TRUE_COST must be '1' to compute effective prices
  const featureEnabled = process.env.FILLIP_TRUE_COST === '1'

  for (const result of results) {
    if (!featureEnabled || enrolledIds.length === 0) {
      result.effective_price_cents = parseFloat(result.price_cents)
      result.applied_programme_id = null
      result.applied_programme_name = null
      result.applied_discount_cents = 0
      result.considered_programme_ids = []
      continue
    }

    const brandCode = resolveBrandCode(result.brand)
    const pylonCents = parseFloat(result.price_cents)
    const effective = computeEffective(pylonCents, brandCode, fuelTypeId, enrolledIds)

    result.effective_price_cents = effective.effective_price_cents
    result.applied_programme_id = effective.applied_programme_id
    result.applied_programme_name = effective.applied_programme_name
    result.applied_discount_cents = effective.applied_discount_cents
    result.considered_programme_ids = effective.considered_programme_ids
  }

  return results
}

export async function getLatestPrices(
  fuelTypeId: number,
  radiusKm: number,
  userLocation?: { lat: number; lng: number }
): Promise<PriceResult[]> {
  const lat = userLocation?.lat ?? DEFAULT_LAT
  const lng = userLocation?.lng ?? DEFAULT_LNG

  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (station_id)
        station_id,
        price_cents,
        recorded_at,
        source_ts
      FROM price_readings
      WHERE fuel_type_id = ${fuelTypeId}
      ORDER BY station_id, recorded_at DESC
    ),
    window_start AS (
      -- Oldest bucket in the 168h window per station.
      -- Mirrors /api/prices/history?hours=168 semantics: prefer the
      -- hourly_prices continuous aggregate.
      SELECT DISTINCT ON (station_id)
        station_id, avg_price_cents AS prev_price
      FROM hourly_prices
      WHERE fuel_type_id = ${fuelTypeId}
        AND bucket >= NOW() - INTERVAL '168 hours'
      ORDER BY station_id, bucket ASC
    ),
    window_start_raw AS (
      -- Fallback when the cagg has not yet materialised for this station.
      SELECT station_id, prev_price FROM (
        SELECT
          station_id,
          AVG(price_cents)::numeric AS prev_price,
          DATE_TRUNC('hour', recorded_at) AS bucket,
          ROW_NUMBER() OVER (
            PARTITION BY station_id
            ORDER BY DATE_TRUNC('hour', recorded_at) ASC
          ) AS rn
        FROM price_readings
        WHERE fuel_type_id = ${fuelTypeId}
          AND recorded_at >= NOW() - INTERVAL '168 hours'
        GROUP BY station_id, DATE_TRUNC('hour', recorded_at)
      ) ranked
      WHERE rn = 1
    )
    SELECT
      s.id,
      s.name,
      s.brand,
      s.address,
      s.suburb,
      s.latitude,
      s.longitude,
      l.price_cents,
      l.recorded_at,
      l.source_ts,
      (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(s.latitude) - RADIANS(${lat})) / 2), 2) +
          COS(RADIANS(${lat})) * COS(RADIANS(s.latitude)) *
          POWER(SIN((RADIANS(s.longitude) - RADIANS(${lng})) / 2), 2)
        ))
      ) AS distance_km,
      (
        l.price_cents::numeric -
        COALESCE(ws.prev_price, wsr.prev_price)::numeric
      ) AS price_change
    FROM latest l
    JOIN stations s ON s.id = l.station_id
    LEFT JOIN window_start ws ON ws.station_id = l.station_id
    LEFT JOIN window_start_raw wsr ON wsr.station_id = l.station_id
    WHERE s.is_active = true
      AND (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(s.latitude) - RADIANS(${lat})) / 2), 2) +
          COS(RADIANS(${lat})) * COS(RADIANS(s.latitude)) *
          POWER(SIN((RADIANS(s.longitude) - RADIANS(${lng})) / 2), 2)
        ))
      ) <= ${radiusKm}
    ORDER BY l.price_cents ASC
  `)
  return rows as unknown as PriceResult[]
}
