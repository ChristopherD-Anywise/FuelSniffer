/**
 * SP-8: OG image route — /api/og/fill
 *
 * GET /api/og/fill?s=<station_id>&f=<fuel_type_id>&p=<price_cents>&r=<radius_km>&v=<variant>&sig=<hmac>
 *
 * Security: HMAC-signed params (SHARE_SIGNING_SECRET) prevent abuse.
 * Caching: Cache-Control: public, max-age=3600 + ETag (card hash).
 * Privacy: No user identifiers. Only station + price.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyParams, computeCardHash } from '@/lib/share/sign'
import { renderCardPng } from '@/lib/share/render-node'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const s = sp.get('s')           // station_id
  const f = sp.get('f')           // fuel_type_id
  const p = sp.get('p')           // price_cents
  const r = sp.get('r') ?? null   // radius_km (optional)
  const v = sp.get('v') ?? 'default' // variant
  const sig = sp.get('sig') ?? ''

  if (!s || !f || !p) {
    return new NextResponse('Missing required params: s, f, p', { status: 400 })
  }

  // Build params map for verification (must match what signParams receives)
  const paramsToSign: Record<string, string> = { s, f, p, v }
  if (r) paramsToSign.r = r

  if (!verifyParams(paramsToSign, sig)) {
    return new NextResponse('Invalid or missing signature', { status: 400 })
  }

  const stationId = parseInt(s, 10)
  const fuelTypeId = parseInt(f, 10)
  const priceCents = parseInt(p, 10)
  const radiusKm = r ? parseInt(r, 10) : undefined

  if (isNaN(stationId) || isNaN(fuelTypeId) || isNaN(priceCents)) {
    return new NextResponse('Invalid numeric params', { status: 400 })
  }

  const hash = computeCardHash(stationId, fuelTypeId, priceCents, radiusKm, v)

  // Lookup station
  type StationRow = { name: string; brand: string | null }
  const stationRows = await db.execute(sql`
    SELECT name, brand FROM stations WHERE id = ${stationId} LIMIT 1
  `) as unknown as StationRow[]

  if (!stationRows.length) {
    return new NextResponse('Station not found', { status: 404 })
  }

  // Lookup fuel type
  type FuelRow = { code: string }
  const ftRows = await db.execute(sql`
    SELECT code FROM fuel_types WHERE id = ${fuelTypeId} LIMIT 1
  `) as unknown as FuelRow[]
  const fuelCode = ftRows[0]?.code ?? 'U91'

  const { name, brand } = stationRows[0]

  // Update cache index (non-fatal on error — don't fail render if DB has issues)
  await db.execute(sql`
    INSERT INTO share_card_renders (hash, station_id, fuel_type_id, price_cents, radius_km, variant)
    VALUES (${hash}, ${stationId}, ${fuelTypeId}, ${priceCents}, ${radiusKm ?? null}, ${v})
    ON CONFLICT (hash) DO UPDATE
      SET served_count   = share_card_renders.served_count + 1,
          last_served_at = NOW()
  `).catch((err) => {
    console.error('[og/fill] cache index update failed (non-fatal):', err)
  })

  // Render PNG
  let png: Buffer
  try {
    png = await renderCardPng({
      stationName: name,
      brand,
      priceCents,
      fuelCode,
      radiusKm,
      variant: v as 'default' | 'weekly_postcode',
    })
  } catch (err) {
    console.error('[og/fill] render failed:', err)
    return new NextResponse('Render failed', { status: 500 })
  }

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.byteLength),
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'ETag': `"${hash}"`,
      'X-Card-Hash': hash,
    },
  })
}
