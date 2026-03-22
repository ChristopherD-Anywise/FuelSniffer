/**
 * Tests for DATA-01: QLD API authentication and retry logic.
 * Run: npx vitest run src/__tests__/api-client.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import {
  buildAuthHeader,
  createApiClient,
  fetchWithRetry,
  GetSitesPricesResponseSchema,
} from '@/lib/scraper/client'

describe('buildAuthHeader', () => {
  it('includes the FPDAPI SubscriberToken Authorization header on every request', () => {
    expect(buildAuthHeader('my-token')).toBe('FPDAPI SubscriberToken=my-token')
  })

  it('works with tokens containing hyphens and alphanumerics', () => {
    expect(buildAuthHeader('abc-123-XYZ')).toBe('FPDAPI SubscriberToken=abc-123-XYZ')
  })
})

describe('createApiClient', () => {
  it('throws if QLD_API_TOKEN env var is not set', () => {
    const originalToken = process.env.QLD_API_TOKEN
    delete process.env.QLD_API_TOKEN
    expect(() => createApiClient()).toThrow('QLD_API_TOKEN')
    if (originalToken) process.env.QLD_API_TOKEN = originalToken
  })

  it('creates a client when QLD_API_TOKEN is set', () => {
    process.env.QLD_API_TOKEN = 'test-token'
    const client = createApiClient()
    expect(client).toHaveProperty('getSitesPrices')
    expect(client).toHaveProperty('getFullSiteDetails')
  })
})

describe('fetchWithRetry', () => {
  it('retries exactly 3 times before throwing on persistent failure', async () => {
    // Use a zero-delay version by mocking setTimeout to resolve immediately
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
      fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    let callCount = 0
    const alwaysFails = () => { callCount++; return Promise.reject(new Error('API down')) }

    await expect(fetchWithRetry(alwaysFails, 3)).rejects.toThrow('API down')
    expect(callCount).toBe(3)
    vi.restoreAllMocks()
  }, 10_000)

  it('succeeds on the second attempt without throwing', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
      fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    let callCount = 0
    const succeedsOnSecond = () => {
      callCount++
      if (callCount < 2) return Promise.reject(new Error('transient'))
      return Promise.resolve('ok')
    }

    const result = await fetchWithRetry(succeedsOnSecond as () => Promise<string>, 3)
    expect(result).toBe('ok')
    expect(callCount).toBe(2)
    vi.restoreAllMocks()
  }, 10_000)
})

describe('GetSitesPricesResponseSchema (Zod validation)', () => {
  it('accepts a valid API response shape', () => {
    const validResponse = {
      SitePrices: [
        {
          SiteId: 123,
          FuelId: 52,
          TransactionDateUtc: '2026-03-23T05:00:00Z',
          Price: 1459,
        },
      ],
    }
    expect(() => GetSitesPricesResponseSchema.parse(validResponse)).not.toThrow()
  })

  it('rejects a response missing the SitePrices field', () => {
    expect(() => GetSitesPricesResponseSchema.parse({ wrongField: [] })).toThrow()
  })

  it('rejects a Price field that is not an integer', () => {
    const invalidResponse = {
      SitePrices: [
        {
          SiteId: 123,
          FuelId: 52,
          TransactionDateUtc: '2026-03-23T05:00:00Z',
          Price: '1459',  // string instead of number — should fail
        },
      ],
    }
    expect(() => GetSitesPricesResponseSchema.parse(invalidResponse)).toThrow()
  })
})
