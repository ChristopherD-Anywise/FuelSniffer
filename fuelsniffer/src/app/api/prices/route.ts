import { NextResponse } from 'next/server'
import { getLatestPrices, applyEffectivePrices } from '@/lib/db/queries/prices'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

interface UserProgrammeRow {
  programme_id: string
  paused: boolean
}

const PricesQuerySchema = z.object({
  fuel: z
    .string()
    .regex(/^\d+$/, 'fuel must be a positive integer')
    .transform(Number),
  radius: z
    .string()
    .optional()
    .default('20')
    .pipe(
      z.string()
       .regex(/^\d+$/)
       .transform(Number)
       .pipe(z.number().min(1).max(50))
    ),
  lat: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  lng: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  if (!searchParams.has('fuel')) {
    return NextResponse.json({ error: 'fuel is required' }, { status: 400 })
  }

  const parsed = PricesQuerySchema.safeParse({
    fuel: searchParams.get('fuel'),
    radius: searchParams.get('radius') ?? undefined,
    lat: searchParams.get('lat') ?? undefined,
    lng: searchParams.get('lng') ?? undefined,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return NextResponse.json({ error: firstIssue.message }, { status: 400 })
  }

  const userLocation = parsed.data.lat && parsed.data.lng
    ? { lat: parsed.data.lat, lng: parsed.data.lng }
    : undefined

  try {
    const stations = await getLatestPrices(
      parsed.data.fuel,
      parsed.data.radius,
      userLocation
    )

    // SP-6: Load enrolled programme IDs for the authenticated user (non-blocking)
    let enrolledIds: string[] = []
    try {
      const session = await getSession(req)
      if (session) {
        const rows = await db.execute(sql`
          SELECT programme_id, paused
          FROM user_programmes
          WHERE user_id = ${session.userId}
        `) as unknown as UserProgrammeRow[]
        // Only include non-paused enrolments in the effective price calculation
        enrolledIds = rows.filter(r => !r.paused).map(r => r.programme_id)
      }
    } catch {
      // Session or DB error — continue with pylon-only prices
      enrolledIds = []
    }

    applyEffectivePrices(stations, enrolledIds, parsed.data.fuel)

    return NextResponse.json(stations, { status: 200 })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
