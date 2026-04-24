import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { GET, resetGeocodeCache } from '@/app/api/geocode/route'
import { mswServer } from '@/app/api/geocode/__tests__/setup'

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => mswServer.resetHandlers())
afterAll(() => mswServer.close())

function makeReq(q: string | null): Request {
  const url = q === null
    ? 'http://localhost:3000/api/geocode'
    : `http://localhost:3000/api/geocode?q=${encodeURIComponent(q)}`
  return new Request(url)
}

describe('/api/geocode', () => {
  beforeEach(() => {
    process.env.MAPBOX_TOKEN = 'test-token'
    resetGeocodeCache()
  })

  it('400 when q is missing', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(400)
  })

  it('400 when q is shorter than 2 chars', async () => {
    const res = await GET(makeReq('a'))
    expect(res.status).toBe(400)
  })

  it('400 when q is longer than 100 chars', async () => {
    const res = await GET(makeReq('x'.repeat(101)))
    expect(res.status).toBe(400)
  })

  it('503 when MAPBOX_TOKEN is not set', async () => {
    delete process.env.MAPBOX_TOKEN
    const res = await GET(makeReq('brisbane'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('geocoding_unavailable')
  })

  it('200 with mapped results on success', async () => {
    const res = await GET(makeReq('brisbane'))
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ label: string; lat: number; lng: number }>
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('label')
    expect(body[0]).toHaveProperty('lat')
    expect(body[0]).toHaveProperty('lng')
    expect(typeof body[0].lat).toBe('number')
    expect(typeof body[0].lng).toBe('number')
  })

  it('502 when Mapbox returns 5xx', async () => {
    const res = await GET(makeReq('__upstream_error__'))
    expect(res.status).toBe(502)
  })

  it('503 when Mapbox returns 429', async () => {
    const res = await GET(makeReq('__rate_limit__'))
    expect(res.status).toBe(503)
  })

  it('caches identical queries within TTL', async () => {
    let upstreamCalls = 0
    mswServer.use(
      http.get('https://api.mapbox.com/search/geocode/v6/forward', () => {
        upstreamCalls++
        return HttpResponse.json({ type: 'FeatureCollection', features: [] })
      })
    )

    await GET(makeReq('same-query-xyz'))
    await GET(makeReq('same-query-xyz'))
    await GET(makeReq('same-query-xyz'))

    expect(upstreamCalls).toBe(1)
  })

  it('passes country=au and proximity params to Mapbox', async () => {
    let capturedUrl: string | null = null
    mswServer.use(
      http.get('https://api.mapbox.com/search/geocode/v6/forward', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ type: 'FeatureCollection', features: [] })
      })
    )

    await GET(makeReq('param-check'))
    expect(capturedUrl).toContain('country=au')
    expect(capturedUrl).toContain('proximity=')
    expect(capturedUrl).toContain('limit=5')
  })
})
