/**
 * Tests for DASH-01: /api/prices route returns sorted price data.
 * Run: npx vitest run src/__tests__/prices-api.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Unit tests: getLatestPrices query function ────────────────────────────────

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([
      {
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
      },
    ]),
  },
}))

describe('getLatestPrices', () => {
  it('returns stations array from db.execute', async () => {
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    const result = await getLatestPrices(2, 20)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('returns objects with correct PriceResult shape', async () => {
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
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
    const { db } = await import('@/lib/db/client')
    ;(db.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    const result = await getLatestPrices(2, 20)
    expect(result).toHaveLength(0)
  })
})

// ── Route handler tests: GET /api/prices ─────────────────────────────────────

vi.mock('@/lib/db/queries/prices', () => ({
  getLatestPrices: vi.fn().mockResolvedValue([]),
}))

describe('GET /api/prices', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 200 with stations array for valid fuel type and radius', async () => {
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    ;(getLatestPrices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
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
      },
    ])
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
    expect(body.error).toMatch(/radius must be between 1 and 50/)
  })

  it('returns 400 when radius is 51', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2&radius=51')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/radius must be between 1 and 50/)
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
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    ;(getLatestPrices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    expect(getLatestPrices).toHaveBeenCalledWith(2, 20)
  })

  it('returns stations sorted cheapest first (preserves db order)', async () => {
    const stations = [
      { id: 1, price_cents: '140.0', distance_km: 1 },
      { id: 2, price_cents: '145.9', distance_km: 2 },
    ]
    const { getLatestPrices } = await import('@/lib/db/queries/prices')
    ;(getLatestPrices as ReturnType<typeof vi.fn>).mockResolvedValueOnce(stations)
    const { GET } = await import('@/app/api/prices/route')
    const req = new Request('http://localhost/api/prices?fuel=2&radius=20')
    const res = await GET(req as any)
    const body = await res.json()
    expect(body[0].price_cents).toBe('140.0')
    expect(body[1].price_cents).toBe('145.9')
  })
})
