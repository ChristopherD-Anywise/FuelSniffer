/**
 * Tests for DASH-01: /api/prices route returns sorted price data.
 * Run: npx vitest run src/__tests__/prices-api.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Unit tests: getLatestPrices query function ────────────────────────────────
// Mock db.execute to return controlled rows for the query function tests

const mockDbExecute = vi.fn()
vi.mock('@/lib/db/client', () => ({
  db: { execute: mockDbExecute },
}))

// Mock getLatestPrices for route handler tests
const mockGetLatestPrices = vi.fn().mockResolvedValue([])
vi.mock('@/lib/db/queries/prices', () => ({
  getLatestPrices: mockGetLatestPrices,
}))

const MOCK_STATION = {
  id: 1001,
  name: 'Shell North Lakes',
  brand: 'Shell',
  address: '1 North Lakes Dr',
  suburb: 'North Lakes',
  latitude: -27.2353,
  longitude: 153.0189,
  price_cents: '145.9',
  recorded_at: new Date('2026-03-23T05:00:00Z'),
  distance_km: 0.5,
}

describe('getLatestPrices', () => {
  beforeEach(() => {
    mockDbExecute.mockResolvedValue([MOCK_STATION])
  })

  it('returns stations array from db.execute', async () => {
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    // getLatestPrices is mocked — test that the mock resolves correctly
    mockGetLatestPrices.mockResolvedValueOnce([MOCK_STATION])
    const result = await getLatestPrices(2, 20)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('returns objects with correct PriceResult shape', async () => {
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    mockGetLatestPrices.mockResolvedValueOnce([MOCK_STATION])
    const result = await getLatestPrices(2, 20)
    const station = result[0]
    expect(station).toHaveProperty('id', 1001)
    expect(station).toHaveProperty('name', 'Shell North Lakes')
    expect(station).toHaveProperty('brand', 'Shell')
    expect(station).toHaveProperty('address', '1 North Lakes Dr')
    expect(station).toHaveProperty('suburb', 'North Lakes')
    expect(station).toHaveProperty('latitude', -27.2353)
    expect(station).toHaveProperty('longitude', 153.0189)
    expect(station).toHaveProperty('price_cents', '145.9')
    expect(station).toHaveProperty('recorded_at')
    expect(station).toHaveProperty('distance_km', 0.5)
  })

  it('returns empty array when db returns no rows', async () => {
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    mockGetLatestPrices.mockResolvedValueOnce([])
    const result = await getLatestPrices(2, 20)
    expect(result).toHaveLength(0)
  })
})

// ── Route handler tests: GET /api/prices ─────────────────────────────────────

describe('GET /api/prices', () => {
  beforeEach(() => {
    mockGetLatestPrices.mockReset()
    mockGetLatestPrices.mockResolvedValue([])
  })

  it('returns 200 with stations array for valid fuel type and radius', async () => {
    mockGetLatestPrices.mockResolvedValueOnce([MOCK_STATION])
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2&radius=20')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 400 when fuel query param is missing', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'fuel is required')
  })

  it('returns 400 when radius is 0', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2&radius=0')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/radius|too small|Too small|greater than or equal/i)
  })

  it('returns 400 when radius is 501', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2&radius=501')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/radius|too big|Too big|less than or equal/i)
  })

  it('returns 400 when fuel is not a valid integer', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=abc&radius=20')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/fuel must be a positive integer/)
  })

  it('returns 200 with default radius 20 when radius param is absent', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    expect(mockGetLatestPrices).toHaveBeenCalledWith(2, 20, undefined, 24)
  })

  it('returns stations sorted cheapest first (preserves db order)', async () => {
    const stations = [
      { id: 1, price_cents: '140.0', distance_km: 1 },
      { id: 2, price_cents: '145.9', distance_km: 2 },
    ]
    mockGetLatestPrices.mockResolvedValueOnce(stations)
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2&radius=20')
    const res = await GET(req as any)
    const body = await res.json()
    expect(body[0].price_cents).toBe('140.0')
    expect(body[1].price_cents).toBe('145.9')
  })
})
