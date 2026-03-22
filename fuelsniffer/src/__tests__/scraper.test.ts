/**
 * Stubs for DATA-02: scrape cycle and retry logic.
 * These tests are INTENTIONALLY FAILING until Plan 04 implements scraper/writer.
 * Run: npx vitest run src/__tests__/scraper.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

describe('runScrapeJob', () => {
  it('inserts a success row into scrape_health when API responds normally', async () => {
    // Will verify db.insert(scrapeHealth).values({ pricesUpserted: N, error: null })
    const runScrapeJob = async (): Promise<{ pricesUpserted: number; error: null | string }> => {
      throw new Error('not implemented')
    }
    const result = await runScrapeJob()
    expect(result.error).toBeNull()
    expect(result.pricesUpserted).toBeGreaterThanOrEqual(0)
  })

  it('inserts a failure row into scrape_health when API is unreachable', async () => {
    const runScrapeJob = async (): Promise<{ pricesUpserted: number; error: null | string }> => {
      throw new Error('not implemented')
    }
    // When API fails after retries, scrape_health row has error != null
    const result = await runScrapeJob()
    expect(result.error).not.toBeNull()
  })

  it('D-09: always inserts a price row even when price has not changed since last scrape', async () => {
    // Per D-09: consistent time series — row inserted regardless of price change
    const shouldInsertRow = (_newPrice: number, _lastPrice: number): boolean => {
      throw new Error('not implemented')
    }
    expect(shouldInsertRow(145.9, 145.9)).toBe(true)  // same price → still insert
    expect(shouldInsertRow(145.9, 146.0)).toBe(true)  // changed price → insert
  })
})
