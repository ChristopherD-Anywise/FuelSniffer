/**
 * Tests for Trip Planner: POST /api/trip/route
 * Tests: valid request shape, invalid coords return 400, rate limit config exists.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDbExecute = vi.fn()
vi.mock('@/lib/db/client', () => ({
  db: { execute: mockDbExecute },
}))

// Mock the routing provider registry
const mockRoute = vi.fn()
vi.mock('@/lib/providers/routing', () => ({
  registerRoutingProvider: vi.fn(),
  getRoutingProvider: vi.fn(() => ({ route: mockRoute })),
  clearRoutingProviders: vi.fn(),
}))

// Mock MapboxRoutingProvider constructor
vi.mock('@/lib/providers/routing/mapbox', () => ({
  MapboxRoutingProvider: vi.fn().mockImplementation(() => ({
    id: 'mapbox',
    displayName: 'Mapbox Directions',
    route: mockRoute,
  })),
}))

const MOCK_ROUTE_RESULT = {
  primary: {
    polyline: [{ lat: -27.47, lng: 153.02 }, { lat: -27.5, lng: 153.1 }],
    distanceMeters: 50000,
    durationSeconds: 2400,
  },
  alternatives: [],
}

// ── Route handler tests ───────────────────────────────────────────────────────

describe('POST /api/trip/route', () => {
  beforeEach(() => {
    mockDbExecute.mockReset()
    mockRoute.mockReset()
    // Default: cache miss
    mockDbExecute.mockResolvedValue([])
    // Default: provider returns a route
    mockRoute.mockResolvedValue(MOCK_ROUTE_RESULT)
  })

  it('returns 200 with route result for valid Australian coords', async () => {
    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: -27.47, lng: 153.02 },
        end: { lat: -28.00, lng: 153.43 },
        alternatives: false,
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('primary')
    expect(body).toHaveProperty('alternatives')
  })

  it('returns 400 when lat is outside Australian bounds (too far north)', async () => {
    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: 10, lng: 153.02 },   // lat 10 is too far north (> -10)
        end: { lat: -28.00, lng: 153.43 },
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 when lng is outside Australian bounds (too far west)', async () => {
    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: -27.47, lng: 100 },  // lng 100 is < 112
        end: { lat: -28.00, lng: 153.43 },
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Invalid JSON body')
  })

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: { lat: -27.47, lng: 153.02 } }),  // missing end
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('returns cached result on cache hit (skips provider call)', async () => {
    const { createHash } = await import('crypto')
    const cachedResult = { ...MOCK_ROUTE_RESULT }
    const responseJson = JSON.stringify(cachedResult)
    const responseHash = createHash('sha256').update(responseJson).digest('hex')

    mockDbExecute.mockResolvedValueOnce([
      { response_json: cachedResult, response_hash: responseHash },
    ])

    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: -27.47, lng: 153.02 },
        end: { lat: -28.00, lng: 153.43 },
        alternatives: false,
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)
    // Provider should NOT have been called
    expect(mockRoute).not.toHaveBeenCalled()
  })

  it('returns 503 when provider throws a Rate limit error', async () => {
    mockRoute.mockRejectedValueOnce(new Error('Rate limit exceeded'))

    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: -27.47, lng: 153.02 },
        end: { lat: -28.00, lng: 153.43 },
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(503)
  })

  it('returns 502 when provider throws a generic error', async () => {
    mockRoute.mockRejectedValueOnce(new Error('Network timeout'))

    const { POST } = await import('@/app/api/trip/route/route')
    const req = new Request('http://localhost/api/trip/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: -27.47, lng: 153.02 },
        end: { lat: -28.00, lng: 153.43 },
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(502)
  })
})

// ── Rate limit config tests ───────────────────────────────────────────────────

describe('rate limit config', () => {
  it('has a rate limit config for /api/trip/route', async () => {
    const { RATE_LIMITS } = await import('@/lib/security/rate-limit')
    expect(RATE_LIMITS['/api/trip/route']).toBeDefined()
    expect(RATE_LIMITS['/api/trip/route'].maxRequests).toBe(30)
    expect(RATE_LIMITS['/api/trip/route'].windowMs).toBe(60_000)
  })

  it('getRateLimitConfig returns config for /api/trip/route', async () => {
    const { getRateLimitConfig } = await import('@/lib/security/rate-limit')
    const config = getRateLimitConfig('/api/trip/route')
    expect(config).toBeDefined()
    expect(config!.maxRequests).toBe(30)
  })
})
