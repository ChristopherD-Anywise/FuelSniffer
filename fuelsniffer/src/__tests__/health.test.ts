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

import { buildHealthResponse } from '@/app/api/health/route'

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
