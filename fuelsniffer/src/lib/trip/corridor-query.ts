import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { Coord } from '@/lib/providers/routing'

export interface CorridorParams {
  polyline: Coord[]
  fuelTypeId: number
  corridorMeters: number     // 500 to 20000
  excludeBrands: string[]    // empty = no exclusion
  providers: string[]        // empty = all providers
  limit: number              // max stations to return
}

export interface CorridorStation {
  stationId: number
  externalId: string
  sourceProvider: string
  name: string
  brand: string | null
  address: string | null
  suburb: string | null
  latitude: number
  longitude: number
  priceCents: number
  fuelTypeId: number
  detourMeters: number
}

/**
 * Find the cheapest stations within a corridor around a driving route.
 *
 * Uses PostGIS ST_DWithin to find stations near the route polyline,
 * joined to the latest price for the specified fuel type.
 * Results are sorted cheapest-first.
 *
 * The excludeBrands parameter MUST be accepted even though Phase 2 UI
 * doesn't pass it. Phase 3 wires the brand filter into this function.
 */
export async function findStationsAlongRoute(params: CorridorParams): Promise<CorridorStation[]> {
  const { polyline, fuelTypeId, corridorMeters, excludeBrands, providers, limit } = params

  // Build a LINESTRING from the polyline coordinates
  const lineWkt = `LINESTRING(${polyline.map(c => `${c.lng} ${c.lat}`).join(',')})`

  // Build dynamic WHERE clauses
  const brandClause = excludeBrands.length > 0
    ? sql`AND s.brand NOT IN (${sql.join(excludeBrands.map(b => sql`${b}`), sql`, `)})`
    : sql``

  const providerClause = providers.length > 0
    ? sql`AND s.source_provider IN (${sql.join(providers.map(p => sql`${p}`), sql`, `)})`
    : sql``

  const rows = await db.execute(sql`
    WITH latest_prices AS (
      SELECT DISTINCT ON (station_id, fuel_type_id)
        station_id, fuel_type_id, price_cents
      FROM price_readings
      WHERE fuel_type_id = ${fuelTypeId}
      ORDER BY station_id, fuel_type_id, recorded_at DESC
    )
    SELECT
      s.id AS station_id,
      s.external_id,
      s.source_provider,
      s.name,
      s.brand,
      s.address,
      s.suburb,
      s.latitude,
      s.longitude,
      p.price_cents,
      p.fuel_type_id,
      ST_Distance(
        s.geom::geography,
        ST_GeomFromText(${lineWkt}, 4326)::geography
      ) AS detour_meters
    FROM stations s
    JOIN latest_prices p ON p.station_id = s.id
    WHERE s.geom IS NOT NULL
      AND s.is_active = true
      AND ST_DWithin(
        s.geom::geography,
        ST_GeomFromText(${lineWkt}, 4326)::geography,
        ${corridorMeters}
      )
      ${brandClause}
      ${providerClause}
    ORDER BY p.price_cents ASC
    LIMIT ${limit}
  `)

  return (rows as unknown as CorridorStation[]).map(r => ({
    stationId: Number((r as Record<string, unknown>).stationId ?? (r as Record<string, unknown>).station_id),
    externalId: String((r as Record<string, unknown>).externalId ?? (r as Record<string, unknown>).external_id),
    sourceProvider: String((r as Record<string, unknown>).sourceProvider ?? (r as Record<string, unknown>).source_provider),
    name: String((r as Record<string, unknown>).name),
    brand: (r as Record<string, unknown>).brand ? String((r as Record<string, unknown>).brand) : null,
    address: (r as Record<string, unknown>).address ? String((r as Record<string, unknown>).address) : null,
    suburb: (r as Record<string, unknown>).suburb ? String((r as Record<string, unknown>).suburb) : null,
    latitude: Number((r as Record<string, unknown>).latitude),
    longitude: Number((r as Record<string, unknown>).longitude),
    priceCents: Number((r as Record<string, unknown>).priceCents ?? (r as Record<string, unknown>).price_cents),
    fuelTypeId: Number((r as Record<string, unknown>).fuelTypeId ?? (r as Record<string, unknown>).fuel_type_id),
    detourMeters: Number((r as Record<string, unknown>).detourMeters ?? (r as Record<string, unknown>).detour_meters),
  }))
}
