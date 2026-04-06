import { NextResponse } from 'next/server'
import { getLatestPrices } from '@/lib/db/queries/prices'
import { z } from 'zod'

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
       .pipe(z.number().min(1).max(2000))
    ),
  lat: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  lng: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  suburb: z.string().optional(),
  postcode: z.string().optional(),
  changeHours: z
    .string()
    .optional()
    .default('24')
    .pipe(
      z.string()
       .regex(/^\d+$/)
       .transform(Number)
       .pipe(z.number().min(1).max(168))
    ),
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
    suburb: searchParams.get('suburb') ?? undefined,
    postcode: searchParams.get('postcode') ?? undefined,
    changeHours: searchParams.get('changeHours') ?? undefined,
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return NextResponse.json({ error: firstIssue.message }, { status: 400 })
  }

  const userLocation = parsed.data.lat && parsed.data.lng
    ? { lat: parsed.data.lat, lng: parsed.data.lng }
    : undefined

  const stations = await getLatestPrices(parsed.data.fuel, parsed.data.radius, userLocation, parsed.data.changeHours, parsed.data.suburb, parsed.data.postcode)

  return NextResponse.json(stations, { status: 200 })
}
