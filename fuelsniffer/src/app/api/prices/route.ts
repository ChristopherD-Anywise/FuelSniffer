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
       .regex(/^\d+$/, 'radius must be between 1 and 50')
       .transform(Number)
       .pipe(z.number().min(1, 'radius must be between 1 and 50').max(50, 'radius must be between 1 and 50'))
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
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return NextResponse.json({ error: firstIssue.message }, { status: 400 })
  }

  const stations = await getLatestPrices(parsed.data.fuel, parsed.data.radius)

  return NextResponse.json(stations, { status: 200 })
}
