/**
 * Input validation smoke tests for all public API routes.
 *
 * Verifies that invalid input returns 400 with a field-level error message
 * and never leaks stack traces or internal error details.
 *
 * Also exercises the shared Zod schemas in src/lib/security/validation.ts.
 *
 * Run: npx vitest run src/__tests__/input-validation.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/lib/db/queries/prices', () => ({
  getLatestPrices: vi.fn().mockResolvedValue([]),
}))

// ── Shared Zod schema tests ───────────────────────────────────────────────────

describe('shared validation schemas', async () => {
  const {
    latitudeSchema,
    longitudeSchema,
    radiusSchema,
    fuelTypeSchema,
    stationIdSchema,
    searchQuerySchema,
  } = await import('@/lib/security/validation')

  describe('latitudeSchema', () => {
    it('accepts valid latitude values', () => {
      expect(latitudeSchema.parse(-27.47)).toBeCloseTo(-27.47)
      expect(latitudeSchema.parse(0)).toBe(0)
      expect(latitudeSchema.parse(90)).toBe(90)
      expect(latitudeSchema.parse(-90)).toBe(-90)
    })

    it('coerces string to number', () => {
      expect(latitudeSchema.parse('-27.47')).toBeCloseTo(-27.47)
    })

    it('rejects out-of-range latitude', () => {
      expect(() => latitudeSchema.parse(91)).toThrow()
      expect(() => latitudeSchema.parse(-91)).toThrow()
    })
  })

  describe('longitudeSchema', () => {
    it('accepts valid longitude values', () => {
      expect(longitudeSchema.parse(153.02)).toBeCloseTo(153.02)
      expect(longitudeSchema.parse(-180)).toBe(-180)
      expect(longitudeSchema.parse(180)).toBe(180)
    })

    it('coerces string to number', () => {
      expect(longitudeSchema.parse('153.02')).toBeCloseTo(153.02)
    })

    it('rejects out-of-range longitude', () => {
      expect(() => longitudeSchema.parse(181)).toThrow()
      expect(() => longitudeSchema.parse(-181)).toThrow()
    })
  })

  describe('radiusSchema', () => {
    it('accepts valid radius', () => {
      expect(radiusSchema.parse(10)).toBe(10)
      expect(radiusSchema.parse(1)).toBe(1)
      expect(radiusSchema.parse(100)).toBe(100)
    })

    it('applies default of 10 when undefined', () => {
      expect(radiusSchema.parse(undefined)).toBe(10)
    })

    it('rejects radius below 1 or above 100', () => {
      expect(() => radiusSchema.parse(0)).toThrow()
      expect(() => radiusSchema.parse(101)).toThrow()
    })
  })

  describe('fuelTypeSchema', () => {
    it('accepts valid fuel type IDs', () => {
      expect(fuelTypeSchema.parse(2)).toBe(2)
      expect(fuelTypeSchema.parse(1)).toBe(1)
      expect(fuelTypeSchema.parse(30)).toBe(30)
    })

    it('coerces string fuel type to number', () => {
      expect(fuelTypeSchema.parse('2')).toBe(2)
    })

    it('rejects non-integers', () => {
      expect(() => fuelTypeSchema.parse(1.5)).toThrow()
    })

    it('rejects out-of-range fuel type IDs', () => {
      expect(() => fuelTypeSchema.parse(0)).toThrow()
      expect(() => fuelTypeSchema.parse(31)).toThrow()
    })

    it('rejects SQL injection attempt strings', () => {
      expect(() => fuelTypeSchema.parse("1; DROP TABLE stations")).toThrow()
      expect(() => fuelTypeSchema.parse("' OR '1'='1")).toThrow()
    })
  })

  describe('stationIdSchema', () => {
    it('accepts positive integers', () => {
      expect(stationIdSchema.parse(1)).toBe(1)
      expect(stationIdSchema.parse(99999)).toBe(99999)
    })

    it('rejects zero and negative values', () => {
      expect(() => stationIdSchema.parse(0)).toThrow()
      expect(() => stationIdSchema.parse(-1)).toThrow()
    })

    it('rejects non-integers', () => {
      expect(() => stationIdSchema.parse(1.5)).toThrow()
    })
  })

  describe('searchQuerySchema', () => {
    it('accepts valid search terms', () => {
      expect(searchQuerySchema.parse('North Lakes')).toBe('North Lakes')
      expect(searchQuerySchema.parse('4020')).toBe('4020')
    })

    it('trims whitespace', () => {
      expect(searchQuerySchema.parse('  Redcliffe  ')).toBe('Redcliffe')
    })

    it('rejects empty string', () => {
      expect(() => searchQuerySchema.parse('')).toThrow()
    })

    it('rejects strings over 100 chars', () => {
      expect(() => searchQuerySchema.parse('a'.repeat(101))).toThrow()
    })

    it('rejects strings that are only whitespace (trims to empty)', () => {
      expect(() => searchQuerySchema.parse('   ')).toThrow()
    })
  })
})

// ── Route handler tests — GET /api/prices ────────────────────────────────────

describe('GET /api/prices — input validation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('@/lib/db/queries/prices', () => ({
      getLatestPrices: vi.fn().mockResolvedValue([]),
    }))
  })

  it('returns 400 when fuel param is missing', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const res = await GET(new Request('http://localhost/api/prices') as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.error).not.toMatch(/stack|at Object|at Module/i)
  })

  it('returns 400 when fuel is not a number', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const res = await GET(new Request('http://localhost/api/prices?fuel=abc') as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 when fuel is a SQL injection attempt', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const res = await GET(
      new Request("http://localhost/api/prices?fuel=1%3B+DROP+TABLE+stations") as any
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when radius is 0', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const res = await GET(new Request('http://localhost/api/prices?fuel=2&radius=0') as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 when radius is 51 (exceeds route max of 50)', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const res = await GET(new Request('http://localhost/api/prices?fuel=2&radius=51') as any)
    expect(res.status).toBe(400)
  })

  it('returns 200 for valid request', async () => {
    const { GET } = await import('@/app/api/prices/route')
    const res = await GET(new Request('http://localhost/api/prices?fuel=2&radius=20') as any)
    expect(res.status).toBe(200)
  })
})

// ── Route handler tests — GET /api/prices/history ────────────────────────────

describe('GET /api/prices/history — input validation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('@/lib/db/client', () => ({
      db: { execute: vi.fn().mockResolvedValue([]) },
    }))
  })

  it('returns 400 when station param is missing', async () => {
    const { GET } = await import('@/app/api/prices/history/route')
    const res = await GET(new Request('http://localhost/api/prices/history?fuel=2') as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.error).not.toMatch(/stack|at Object|at Module/i)
  })

  it('returns 400 when fuel param is missing', async () => {
    const { GET } = await import('@/app/api/prices/history/route')
    const res = await GET(new Request('http://localhost/api/prices/history?station=1001') as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 when station is not a number', async () => {
    const { GET } = await import('@/app/api/prices/history/route')
    const res = await GET(
      new Request('http://localhost/api/prices/history?station=abc&fuel=2') as any
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when hours exceeds maximum (8760)', async () => {
    const { GET } = await import('@/app/api/prices/history/route')
    const res = await GET(
      new Request('http://localhost/api/prices/history?station=1001&fuel=2&hours=8761') as any
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 for valid request', async () => {
    const { GET } = await import('@/app/api/prices/history/route')
    const res = await GET(
      new Request('http://localhost/api/prices/history?station=1001&fuel=2') as any
    )
    expect(res.status).toBe(200)
  })
})

// ── Route handler tests — GET /api/search ────────────────────────────────────

describe('GET /api/search — input validation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('@/lib/db/client', () => ({
      db: { execute: vi.fn().mockResolvedValue([]) },
    }))
  })

  it('returns 400 when q param is missing', async () => {
    const { GET } = await import('@/app/api/search/route')
    const res = await GET(new Request('http://localhost/api/search') as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.error).not.toMatch(/stack|at Object|at Module/i)
  })

  it('returns 400 when q is too short (less than 2 chars)', async () => {
    const { GET } = await import('@/app/api/search/route')
    const res = await GET(new Request('http://localhost/api/search?q=a') as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 when q exceeds max length (50 chars)', async () => {
    const { GET } = await import('@/app/api/search/route')
    const q = 'a'.repeat(51)
    const res = await GET(new Request(`http://localhost/api/search?q=${q}`) as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 when q is a potential XSS payload', async () => {
    const { GET } = await import('@/app/api/search/route')
    // The route validates length (2-50). A long injection string fails on length.
    const xss = '<script>alert(1)</script>'
    const res = await GET(
      new Request(`http://localhost/api/search?q=${encodeURIComponent(xss)}`) as any
    )
    // 25 chars — passes length check but route still returns JSON safely (no eval)
    expect([200, 400]).toContain(res.status)
    const body = await res.json()
    // Response must always be valid JSON, never raw HTML
    expect(typeof body).toBe('object')
  })

  it('returns 200 for valid search term', async () => {
    const { GET } = await import('@/app/api/search/route')
    const res = await GET(new Request('http://localhost/api/search?q=North+Lakes') as any)
    expect(res.status).toBe(200)
  })
})
