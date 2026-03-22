/**
 * Stubs for DATA-03: health endpoint.
 * These tests are INTENTIONALLY FAILING until Plan 04 implements /api/health.
 * Run: npx vitest run src/__tests__/health.test.ts
 */
import { describe, it, expect } from 'vitest'

describe('GET /api/health response shape', () => {
  it('returns status "ok" when last scrape_health row has error = null', () => {
    const buildHealthResponse = (_lastRow: unknown) => { throw new Error('not implemented') }
    const successRow = { scrapedAt: new Date().toISOString(), pricesUpserted: 150, error: null }
    const response = buildHealthResponse(successRow)
    expect(response).toMatchObject({ status: 'ok' })
  })

  it('returns status "degraded" when last scrape_health row has error != null', () => {
    const buildHealthResponse = (_lastRow: unknown) => { throw new Error('not implemented') }
    const failRow = { scrapedAt: new Date().toISOString(), pricesUpserted: 0, error: 'API timeout' }
    const response = buildHealthResponse(failRow)
    expect(response).toMatchObject({ status: 'degraded' })
  })

  it('includes last_scrape_at, minutes_ago, and prices_last_run fields', () => {
    const buildHealthResponse = (_lastRow: unknown) => { throw new Error('not implemented') }
    const successRow = { scrapedAt: new Date().toISOString(), pricesUpserted: 150, error: null }
    const response = buildHealthResponse(successRow)
    expect(response).toHaveProperty('last_scrape_at')
    expect(response).toHaveProperty('minutes_ago')
    expect(response).toHaveProperty('prices_last_run')
  })
})
