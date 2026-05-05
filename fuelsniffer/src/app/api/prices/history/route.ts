import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

const HistoryQuerySchema = z.object({
  station: z.string().regex(/^\d+$/).transform(Number),
  fuel: z.string().regex(/^\d+$/).transform(Number),
  hours: z.string().optional().default('168').pipe(
    z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(8760))
  ),
})

export interface HistoryPoint {
  bucket: string   // ISO timestamp
  avg_price: number
  min_price: number
  max_price: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const parsed = HistoryQuerySchema.safeParse({
    station: searchParams.get('station'),
    fuel: searchParams.get('fuel'),
    hours: searchParams.get('hours') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { station, fuel, hours } = parsed.data

  try {
    // For ranges > 7 days, use daily aggregates for performance
    if (hours > 168) {
      const rows = await db.execute(sql`
        SELECT day_bucket AS bucket, avg_price_cents AS avg_price,
               min_price_cents AS min_price, max_price_cents AS max_price
        FROM daily_prices
        WHERE station_id = ${station} AND fuel_type_id = ${fuel}
          AND day_bucket >= NOW() - ${hours + ' hours'}::interval
        ORDER BY day_bucket ASC
      `)
      return NextResponse.json(rows)
    }

    // Try hourly_prices cagg first (fast, pre-aggregated).
    // Falls back to raw price_readings if cagg has no data yet (fresh install).
    const rows = await db.execute(sql`
      SELECT
        bucket,
        avg_price_cents AS avg_price,
        min_price_cents AS min_price,
        max_price_cents AS max_price
      FROM hourly_prices
      WHERE station_id = ${station}
        AND fuel_type_id = ${fuel}
        AND bucket >= NOW() - ${hours + ' hours'}::interval
      ORDER BY bucket ASC
    `)

    if (rows.length === 0) {
      // Cagg might not have materialized yet — query raw readings
      const rawRows = await db.execute(sql`
        SELECT
          DATE_TRUNC('hour', recorded_at) AS bucket,
          AVG(price_cents)::NUMERIC(6,1) AS avg_price,
          MIN(price_cents) AS min_price,
          MAX(price_cents) AS max_price
        FROM price_readings
        WHERE station_id = ${station}
          AND fuel_type_id = ${fuel}
          AND recorded_at >= NOW() - ${hours + ' hours'}::interval
        GROUP BY DATE_TRUNC('hour', recorded_at)
        ORDER BY bucket ASC
      `)
      return NextResponse.json(rawRows)
    }

    return NextResponse.json(rows)
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
