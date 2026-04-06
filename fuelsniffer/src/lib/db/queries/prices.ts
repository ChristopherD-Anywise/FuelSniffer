import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

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
}

export async function getLatestPrices(
  fuelTypeId: number,
  radiusKm: number,
  userLocation?: { lat: number; lng: number },
  changeHours: number = 168
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
      (l.price_cents::numeric - prev.price_cents::numeric) AS price_change
    FROM latest l
    JOIN stations s ON s.id = l.station_id
    LEFT JOIN LATERAL (
      SELECT price_cents
      FROM price_readings pr
      WHERE pr.station_id = l.station_id
        AND pr.fuel_type_id = ${fuelTypeId}
        AND pr.recorded_at < NOW() - (${changeHours} || ' hours')::interval
      ORDER BY pr.recorded_at DESC
      LIMIT 1
    ) prev ON true
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
