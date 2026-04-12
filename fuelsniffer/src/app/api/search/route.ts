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

  try {
    const rows = await db.execute(sql`
      SELECT
        postcode,
        -- Take the most common non-null suburb for this postcode
        (
          SELECT suburb
          FROM stations s2
          WHERE s2.postcode = s.postcode
            AND s2.suburb IS NOT NULL
            AND s2.is_active = true
          GROUP BY suburb
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS suburb,
        AVG(latitude)::numeric(10,6)  AS lat,
        AVG(longitude)::numeric(10,6) AS lng,
        COUNT(*)::int                 AS station_count
      FROM stations s
      WHERE is_active = true
        AND (
          suburb ILIKE ${'%' + q + '%'}
          OR postcode LIKE ${q + '%'}
        )
      GROUP BY postcode
      ORDER BY station_count DESC
      LIMIT 8
    `)

    const results: SearchResult[] = (rows as unknown as Array<Record<string, unknown>>).map(row => ({
      type: 'area' as const,
      suburb: row.suburb ? String(row.suburb) : undefined,
      postcode: row.postcode ? String(row.postcode) : undefined,
      label: row.suburb
        ? `${row.suburb}${row.postcode ? ` (${row.postcode})` : ''}`
        : `Postcode ${row.postcode}`,
      lat: Number(row.lat),
      lng: Number(row.lng),
      stationCount: Number(row.station_count),
    }))

    return NextResponse.json(results, { status: 200 })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
