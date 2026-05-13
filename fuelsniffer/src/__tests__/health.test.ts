/**
 * Tests for DATA-03: /api/health endpoint response logic.
 * Tests buildHealthResponse() in isolation (no HTTP, no DB required).
 * Run: npx vitest run src/__tests__/health.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the DB client before importing the route to avoid the DATABASE_URL check at module load time
vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}))

import { buildHealthResponse, buildNationalHealthResponse } from '@/app/api/health/route'

describe('buildHealthResponse', () => {
  beforeEach(() => {
    // Fix the current time for deterministic minutes_ago calculations
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T06:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns status "ok" when last scrape_health row has error = null', () => {
    const successRow = {
      scrapedAt: new Date('2026-03-23T05:58:00Z'),
      pricesUpserted: 150,
      error: null,
    }
    const response = buildHealthResponse(successRow)
    expect(response.status).toBe('ok')
  })

  it('returns status "degraded" when last scrape_health row has error != null', () => {
    const failRow = {
      scrapedAt: new Date('2026-03-23T05:58:00Z'),
      pricesUpserted: 0,
      error: 'API timeout after 3 retries',
    }
    const response = buildHealthResponse(failRow)
    expect(response.status).toBe('degraded')
  })

  it('returns status "degraded" when no row exists (null input)', () => {
    const response = buildHealthResponse(null)
    expect(response.status).toBe('degraded')
    expect(response.last_scrape_at).toBeNull()
  })

  it('includes last_scrape_at as ISO UTC string', () => {
    const successRow = {
      scrapedAt: new Date('2026-03-23T05:58:00Z'),
      pricesUpserted: 150,
      error: null,
    }
    const response = buildHealthResponse(successRow)
    expect(response.last_scrape_at).toBe('2026-03-23T05:58:00.000Z')
  })

  it('calculates minutes_ago correctly from current time', () => {
    // System time is 06:00Z, last scrape at 05:58Z = 2 minutes ago
    const successRow = {
      scrapedAt: new Date('2026-03-23T05:58:00Z'),
      pricesUpserted: 150,
      error: null,
    }
    const response = buildHealthResponse(successRow)
    expect(response.minutes_ago).toBe(2)
  })

  it('includes prices_last_run matching pricesUpserted', () => {
    const successRow = {
      scrapedAt: new Date('2026-03-23T05:58:00Z'),
      pricesUpserted: 150,
      error: null,
    }
    const response = buildHealthResponse(successRow)
    expect(response.prices_last_run).toBe(150)
  })

  it('includes last_scrape_at, minutes_ago, and prices_last_run fields in all responses', () => {
    const successRow = {
      scrapedAt: new Date('2026-03-23T05:58:00Z'),
      pricesUpserted: 150,
      error: null,
    }
    const response = buildHealthResponse(successRow)
    expect(response).toHaveProperty('last_scrape_at')
    expect(response).toHaveProperty('minutes_ago')
    expect(response).toHaveProperty('prices_last_run')
  })
})

// ── SP-1: buildNationalHealthResponse ────────────────────────────────────────

describe('buildNationalHealthResponse — SP-1 per-provider shape', () => {
  it('returns overall=ok when all providers are healthy', () => {
    const rows = [
      { provider: 'qld', scrapedAt: new Date('2026-03-23T05:58:00Z'), pricesUpserted: 1820, error: null },
      { provider: 'nsw', scrapedAt: new Date('2026-03-23T05:59:00Z'), pricesUpserted: 2614, error: null },
    ]
    const result = buildNationalHealthResponse(rows)
    expect(result.overall).toBe('ok')
    expect(result.providers.qld.status).toBe('ok')
    expect(result.providers.nsw.status).toBe('ok')
  })

  it('returns overall=degraded when any provider has an error', () => {
    const rows = [
      { provider: 'qld', scrapedAt: new Date('2026-03-23T05:58:00Z'), pricesUpserted: 1820, error: null },
      { provider: 'wa',  scrapedAt: new Date('2026-03-23T05:59:00Z'), pricesUpserted: 0,    error: 'RSS 503' },
    ]
    const result = buildNationalHealthResponse(rows)
    expect(result.overall).toBe('degraded')
    expect(result.providers.wa.status).toBe('degraded')
    expect(result.providers.wa.lastError).toBe('RSS 503')
  })

  it('returns overall=ok for empty providers list', () => {
    const result = buildNationalHealthResponse([])
    expect(result.overall).toBe('ok')
    expect(result.providers).toEqual({})
  })

  it('lastSuccessAt is null when provider has an error', () => {
    const rows = [
      { provider: 'wa', scrapedAt: new Date('2026-03-23T05:59:00Z'), pricesUpserted: 0, error: 'timeout' },
    ]
    const result = buildNationalHealthResponse(rows)
    expect(result.providers.wa.lastSuccessAt).toBeNull()
  })

  it('lastSuccessAt is an ISO string when provider is ok', () => {
    const rows = [
      { provider: 'qld', scrapedAt: new Date('2026-03-23T05:58:00Z'), pricesUpserted: 100, error: null },
    ]
    const result = buildNationalHealthResponse(rows)
    expect(result.providers.qld.lastSuccessAt).toBe('2026-03-23T05:58:00.000Z')
  })

  it('rowsLastRun reflects pricesUpserted', () => {
    const rows = [
      { provider: 'nsw', scrapedAt: new Date('2026-03-23T05:58:00Z'), pricesUpserted: 2614, error: null },
    ]
    const result = buildNationalHealthResponse(rows)
    expect(result.providers.nsw.rowsLastRun).toBe(2614)
  })
})
