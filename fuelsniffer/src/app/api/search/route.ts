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

type AreaResult = {
  type: 'area'
  label: string
  lat: number
  lng: number
  stationCount: number
}

type StationResult = {
  type: 'station'
  id: number
  name: string
  lat: number
  lng: number
}

type SearchResult = AreaResult | StationResult

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

  // 1. Area search — group matching stations by postcode
  const areaRows = await db.execute(sql`
    SELECT
      postcode,
      MIN(name) as sample_name,
      AVG(latitude)::numeric(10,6) as lat,
      AVG(longitude)::numeric(10,6) as lng,
      COUNT(*)::int as station_count
    FROM stations
    WHERE is_active = true
      AND postcode IS NOT NULL
      AND (
        postcode LIKE ${q + '%'}
        OR name ILIKE ${'%' + q + '%'}
      )
    GROUP BY postcode
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `)

  // 2. Station name search — individual matches
  const stationRows = await db.execute(sql`
    SELECT id, name, latitude as lat, longitude as lng
    FROM stations
    WHERE is_active = true
      AND name ILIKE ${'%' + q + '%'}
    ORDER BY name
    LIMIT 5
  `)

  // Combine: areas first, then stations, max 10 total
  const results: SearchResult[] = []

  const areaList = areaRows as unknown as Array<Record<string, unknown>>
  const stationList = stationRows as unknown as Array<Record<string, unknown>>

  for (const row of areaList) {
    const postcode = row.postcode as string
    const sampleName = row.sample_name as string
    // Extract a short area name from the sample station name
    // e.g. "BP Cairns Central" -> use postcode + area hint
    const areaHint = extractAreaName(sampleName)
    results.push({
      type: 'area',
      label: `${postcode} — ${areaHint} area`,
      lat: Number(row.lat),
      lng: Number(row.lng),
      stationCount: Number(row.station_count),
    })
  }

  for (const row of stationList) {
    if (results.length >= 10) break
    results.push({
      type: 'station',
      id: Number(row.id),
      name: row.name as string,
      lat: Number(row.lat),
      lng: Number(row.lng),
    })
  }

  return NextResponse.json(results, { status: 200 })
}

/**
 * Extract a human-friendly area name from a station name.
 * Strips common brand prefixes (BP, Shell, Caltex, 7-Eleven, etc.)
 * and returns the remainder as the area label.
 * e.g. "BP Cairns Central" -> "Cairns Central"
 *      "7-Eleven Smithfield" -> "Smithfield"
 */
function extractAreaName(stationName: string): string {
  const brands = [
    'BP', 'Shell', 'Caltex', 'Ampol', 'Puma', 'United',
    'Liberty', 'Mobil', 'Costco', 'Metro', 'Woolworths',
    'Coles Express', 'Coles', '7-Eleven', '7 Eleven',
    'Freedom', 'Enhance', 'Independent', 'Vibe', 'Matilda',
    'Night Owl', 'Mogas', 'Lowes', 'Budget', 'Pacific',
  ]

  let name = stationName.trim()
  for (const brand of brands) {
    if (name.toLowerCase().startsWith(brand.toLowerCase())) {
      name = name.slice(brand.length).trim()
      // Remove leading dash or hyphen left over
      name = name.replace(/^[-–—]\s*/, '')
      break
    }
  }

  return name || stationName
}
