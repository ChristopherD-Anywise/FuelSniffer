import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findStationsAlongRoute } from '@/lib/trip/corridor-query'
import { getSignalForStation } from '@/lib/cycle/queries'

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
  // SP-7: raised cap from 20 to 30; UI shows top 10 toggle when >10
  limit: z.number().int().min(1).max(50).default(30),
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

    // SP-7 D1 integration: attach cycle verdict for each station (quiet failure)
    const stationsWithSignals = await Promise.allSettled(
      stations.map(async station => {
        try {
          const verdict = await getSignalForStation(station.stationId, fuelTypeId)
          return { ...station, verdict: verdict ?? null }
        } catch {
          // Non-critical: if cycle query fails, return station without verdict
          return { ...station, verdict: null }
        }
      })
    )

    const result = stationsWithSignals.map((settled, i) =>
      settled.status === 'fulfilled' ? settled.value : { ...stations[i], verdict: null }
    )

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to query corridor stations'
    console.error('[/api/trip/stations]', message)
    return NextResponse.json({ error: 'Failed to query corridor stations' }, { status: 502 })
  }
}
