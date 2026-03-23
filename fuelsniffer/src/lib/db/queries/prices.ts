import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

// North Lakes coordinates — fixed reference point for all distance calculations
// Source: fuelsniffer/src/lib/scraper/normaliser.ts
const NORTH_LAKES_LAT = -27.2353
const NORTH_LAKES_LNG = 153.0189

export interface PriceResult {
  id: number
  name: string
  brand: string | null
  address: string | null
  suburb: string | null
  latitude: number
  longitude: number
  price_cents: string   // numeric(6,1) comes back as string from postgres driver
  recorded_at: Date
  distance_km: number
}

export async function getLatestPrices(
  fuelTypeId: number,
  radiusKm: number
): Promise<PriceResult[]> {
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
      (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(s.latitude) - RADIANS(${NORTH_LAKES_LAT})) / 2), 2) +
          COS(RADIANS(${NORTH_LAKES_LAT})) * COS(RADIANS(s.latitude)) *
          POWER(SIN((RADIANS(s.longitude) - RADIANS(${NORTH_LAKES_LNG})) / 2), 2)
        ))
      ) AS distance_km
    FROM latest l
    JOIN stations s ON s.id = l.station_id
    WHERE s.is_active = true
    HAVING (
      6371 * 2 * ASIN(SQRT(
        POWER(SIN((RADIANS(s.latitude) - RADIANS(${NORTH_LAKES_LAT})) / 2), 2) +
        COS(RADIANS(${NORTH_LAKES_LAT})) * COS(RADIANS(s.latitude)) *
        POWER(SIN((RADIANS(s.longitude) - RADIANS(${NORTH_LAKES_LNG})) / 2), 2)
      ))
    ) <= ${radiusKm}
    ORDER BY l.price_cents ASC
  `)
  return rows as unknown as PriceResult[]
}
