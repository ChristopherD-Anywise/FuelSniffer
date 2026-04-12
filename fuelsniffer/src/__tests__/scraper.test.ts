/**
 * Tests for DATA-02: scrape cycle behaviour.
 * Uses mocks to avoid requiring a live database connection.
 * Run: npx vitest run src/__tests__/scraper.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldInsertRow } from '@/lib/scraper/writer'

// Mock the database client and API client to test writer logic in isolation
vi.mock('@/lib/db/client', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    execute: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/lib/scraper/client', () => ({
  createApiClient: vi.fn().mockReturnValue({
    getFullSiteDetails: vi.fn().mockResolvedValue({ sites: [] }),
    getSitesPrices: vi.fn().mockResolvedValue({ SitePrices: [] }),
  }),
}))

vi.mock('@/lib/providers/fuel/qld/client', () => ({
  createApiClient: vi.fn().mockReturnValue({
    getFullSiteDetails: vi.fn().mockResolvedValue({ sites: [] }),
    getSitesPrices: vi.fn().mockResolvedValue({ SitePrices: [] }),
  }),
}))

describe('shouldInsertRow — D-09: always insert regardless of price change', () => {
  it('returns true when price has not changed (D-09: consistent time series)', () => {
    expect(shouldInsertRow(145.9, 145.9)).toBe(true)
  })

  it('returns true when price has changed', () => {
    expect(shouldInsertRow(145.9, 146.0)).toBe(true)
  })

  it('returns true when new price is lower', () => {
    expect(shouldInsertRow(140.0, 145.9)).toBe(true)
  })
})

describe('runScrapeJob — integration with mocked dependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.QLD_API_TOKEN = 'test-token'
  })

  it('returns { pricesUpserted: 0, error: null } when API returns empty response', async () => {
    // Re-import after mocks are set up
    const { runScrapeJob } = await import('@/lib/scraper/writer')
    const result = await runScrapeJob()
    expect(result.error).toBeNull()
    expect(result.pricesUpserted).toBe(0)
  })

  it('returns { error: non-null } when API client throws', async () => {
    const { createApiClient } = await import('@/lib/providers/fuel/qld/client')
    vi.mocked(createApiClient).mockImplementationOnce(() => {
      throw new Error('QLD_API_TOKEN environment variable is not set')
    })
    const { runScrapeJob } = await import('@/lib/scraper/writer')
    const result = await runScrapeJob()
    expect(result.error).not.toBeNull()
    expect(result.pricesUpserted).toBe(0)
  })
})
