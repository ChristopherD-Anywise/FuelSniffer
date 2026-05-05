import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findStationsAlongRoute } from '@/lib/trip/corridor-query'

const StationsRequestSchema = z.object({
  polyline: z.array(
    z.object({
      lat: z.number().min(-44).max(-10),
      lng: z.number().min(112).max(154),
    })
  ).min(2),
  fuelTypeId: z.number().int().positive(),
  corridorMeters: z.number().min(500).max(20000),
  excludeBrands: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(50).default(20),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = StationsRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { polyline, fuelTypeId, corridorMeters, excludeBrands, limit } = parsed.data

  try {
    const stations = await findStationsAlongRoute({
      polyline,
      fuelTypeId,
      corridorMeters,
      excludeBrands,
      providers: [],
      limit,
    })
    return NextResponse.json(stations)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to query corridor stations'
    console.error('[/api/trip/stations]', message)
    return NextResponse.json({ error: 'Failed to query corridor stations' }, { status: 502 })
  }
}
