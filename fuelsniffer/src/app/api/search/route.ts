import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

const SearchQuerySchema = z.object({
  q: z
    .string({ required_error: 'q parameter is required' })
    .min(2, 'q must be at least 2 characters')
    .max(50, 'q must be at most 50 characters'),
})

type SearchResult = {
  type: 'area'
  label: string
  suburb?: string
  postcode?: string
  lat: number
  lng: number
  stationCount: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const parsed = SearchQuerySchema.safeParse({
    q: searchParams.get('q') ?? undefined,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return NextResponse.json({ error: firstIssue.message }, { status: 400 })
  }

  const q = parsed.data.q

  const rows = await db.execute(sql`
    SELECT
      COALESCE(suburb, postcode, 'Unknown') AS display_suburb,
      suburb,
      postcode,
      AVG(latitude)::numeric(10,6) AS lat,
      AVG(longitude)::numeric(10,6) AS lng,
      COUNT(*)::int AS station_count
    FROM stations
    WHERE is_active = true
      AND (
        suburb ILIKE ${'%' + q + '%'}
        OR postcode LIKE ${q + '%'}
        OR name ILIKE ${'%' + q + '%'}
      )
    GROUP BY suburb, postcode
    ORDER BY COUNT(*) DESC
    LIMIT 8
  `)

  const results: SearchResult[] = (rows as unknown as Array<Record<string, unknown>>).map(row => ({
    type: 'area' as const,
    label: row.suburb
      ? `${row.suburb}${row.postcode ? ` (${row.postcode})` : ''}`
      : `Postcode ${row.postcode}`,
    suburb: row.suburb ? String(row.suburb) : undefined,
    postcode: row.postcode ? String(row.postcode) : undefined,
    lat: Number(row.lat),
    lng: Number(row.lng),
    stationCount: Number(row.station_count),
  }))

  return NextResponse.json(results, { status: 200 })
}
