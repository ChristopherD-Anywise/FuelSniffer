import { NextResponse } from 'next/server'
import { z } from 'zod'

const GeocodeQuerySchema = z.object({
  q: z
    .string({ required_error: 'q parameter is required' })
    .min(2, 'q must be at least 2 characters')
    .max(100, 'q must be at most 100 characters'),
})

export interface GeocodeResult {
  label: string
  lat: number
  lng: number
}

interface MapboxFeature {
  geometry: { coordinates: [number, number] }
  properties: { full_address?: string; name?: string; place_formatted?: string }
}
interface MapboxResponse {
  features: MapboxFeature[]
}

// Brisbane proximity bias
const PROXIMITY_LNG = 153.02
const PROXIMITY_LAT = -27.47

// In-memory LRU cache
interface CacheEntry { value: GeocodeResult[]; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX = 500

function cacheGet(key: string): GeocodeResult[] | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

function cacheSet(key: string, value: GeocodeResult[]): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

/** Test helper — resets cache state between runs. */
export function resetGeocodeCache(): void {
  cache.clear()
}

function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

function toResults(data: MapboxResponse): GeocodeResult[] {
  return data.features.map(f => ({
    label:
      f.properties.full_address
      ?? (f.properties.name
        ? `${f.properties.name}${f.properties.place_formatted ? ', ' + f.properties.place_formatted : ''}`
        : 'Unknown'),
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const parsed = GeocodeQuerySchema.safeParse({ q: searchParams.get('q') ?? undefined })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const token = process.env.MAPBOX_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'geocoding_unavailable' }, { status: 503 })
  }

  const key = normaliseQuery(parsed.data.q)
  const cached = cacheGet(key)
  if (cached) return NextResponse.json(cached)

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
  url.searchParams.set('q', parsed.data.q)
  url.searchParams.set('country', 'au')
  url.searchParams.set('proximity', `${PROXIMITY_LNG},${PROXIMITY_LAT}`)
  url.searchParams.set('limit', '5')
  url.searchParams.set('types', 'address,postcode,place,locality')
  url.searchParams.set('access_token', token)

  let upstream: Response
  try {
    upstream = await fetch(url)
  } catch {
    return NextResponse.json({ error: 'geocoding_failed' }, { status: 502 })
  }

  if (upstream.status === 429) {
    return NextResponse.json({ error: 'geocoding_rate_limited' }, { status: 503 })
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: 'geocoding_failed' }, { status: 502 })
  }

  const data = await upstream.json() as MapboxResponse
  const results = toResults(data)
  cacheSet(key, results)

  return NextResponse.json(results)
}
