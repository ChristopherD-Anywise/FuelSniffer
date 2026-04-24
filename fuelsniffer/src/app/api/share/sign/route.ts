/**
 * SP-8: Share signing endpoint — POST /api/share/sign
 *
 * Accepts station_id, fuel_type_id, price_cents, radius_km.
 * Returns signed OG image URL + deep-link URL + content hash.
 *
 * Only accepts authenticated requests (middleware enforces auth on /api/*
 * except /api/auth/* — this endpoint requires auth to prevent batch signing).
 */
import { NextRequest, NextResponse } from 'next/server'
import { signParams, computeCardHash } from '@/lib/share/sign'
import { getPublicUrl } from '@/lib/config/publicUrl'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

interface SignBody {
  station_id: number
  fuel_type_id: number
  price_cents: number
  radius_km?: number
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: SignBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { station_id, fuel_type_id, price_cents, radius_km } = body

  if (!station_id || !fuel_type_id || !price_cents) {
    return NextResponse.json(
      { error: 'Missing required fields: station_id, fuel_type_id, price_cents' },
      { status: 400 }
    )
  }

  if (
    typeof station_id !== 'number' ||
    typeof fuel_type_id !== 'number' ||
    typeof price_cents !== 'number'
  ) {
    return NextResponse.json({ error: 'Fields must be numbers' }, { status: 400 })
  }

  const variant = 'default'
  const paramsToSign: Record<string, string> = {
    s: String(station_id),
    f: String(fuel_type_id),
    p: String(price_cents),
    v: variant,
  }
  if (radius_km) paramsToSign.r = String(radius_km)

  const sig = signParams(paramsToSign)
  const hash = computeCardHash(station_id, fuel_type_id, price_cents, radius_km, variant)

  const base = getPublicUrl().href.replace(/\/$/, '')
  const ogParams = new URLSearchParams({ ...paramsToSign, sig })
  const ogUrl = `${base}/api/og/fill?${ogParams}`
  const deepLink = `${base}/share/s/${hash}?utm_source=share-card&utm_medium=native&utm_campaign=fill&utm_content=${hash.slice(0, 6)}`

  return NextResponse.json({ ogUrl, deepLink, hash })
}
