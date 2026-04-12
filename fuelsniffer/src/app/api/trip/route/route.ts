import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getRoutingProvider, registerRoutingProvider } from '@/lib/providers/routing'
import { MapboxRoutingProvider } from '@/lib/providers/routing/mapbox'

// Lazy-register the Mapbox provider if not already registered
try {
  registerRoutingProvider(new MapboxRoutingProvider())
} catch (err) {
  if (err instanceof Error && !err.message.includes('already registered')) {
    console.error('[trip] Failed to register Mapbox provider:', err.message)
  }
}

const RouteRequestSchema = z.object({
  start: z.object({
    lat: z.number().min(-44).max(-10),
    lng: z.number().min(112).max(154),
  }),
  end: z.object({
    lat: z.number().min(-44).max(-10),
    lng: z.number().min(112).max(154),
  }),
  alternatives: z.boolean().default(true),
})

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000  // ~100m precision
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RouteRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { start, end, alternatives } = parsed.data
  const startLatR = roundCoord(start.lat)
  const startLngR = roundCoord(start.lng)
  const endLatR = roundCoord(end.lat)
  const endLngR = roundCoord(end.lng)

  // Check cache
  const cached = await db.execute(sql`
    SELECT response_json, response_hash FROM route_cache
    WHERE start_lat_r = ${startLatR} AND start_lng_r = ${startLngR}
      AND end_lat_r = ${endLatR} AND end_lng_r = ${endLngR}
      AND alternatives = ${alternatives}
      AND provider_id = 'mapbox'
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `)

  if (cached.length > 0) {
    const row = cached[0] as unknown as { response_json: unknown; response_hash: string }
    const hash = createHash('sha256').update(JSON.stringify(row.response_json)).digest('hex')
    if (hash === row.response_hash) {
      return NextResponse.json(row.response_json)
    }
    // Hash mismatch — cache corrupted, fall through to fresh request
  }

  // Cache miss — call routing provider
  try {
    const provider = getRoutingProvider('mapbox')
    const result = await provider.route(start, end, { alternatives, profile: 'driving' })

    // Store in cache
    const responseJson = JSON.stringify(result)
    const responseHash = createHash('sha256').update(responseJson).digest('hex')

    await db.execute(sql`
      INSERT INTO route_cache (start_lat_r, start_lng_r, end_lat_r, end_lng_r, alternatives, provider_id, response_json, response_hash)
      VALUES (${startLatR}, ${startLngR}, ${endLatR}, ${endLngR}, ${alternatives}, 'mapbox', ${responseJson}::jsonb, ${responseHash})
    `)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Routing failed'
    if (message.includes('Rate limit')) {
      return NextResponse.json({ error: 'Routing service temporarily unavailable' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Routing failed' }, { status: 502 })
  }
}
