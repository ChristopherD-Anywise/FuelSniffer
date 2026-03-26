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
  GetFullSiteDetailsResponseSchema,
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
          SiteId: 61401008,
          FuelId: 2,
          CollectionMethod: 'Q',
          TransactionDateUtc: '2026-03-25T14:00:00',
          Price: 2499.0,
        },
      ],
    }
    expect(() => GetSitesPricesResponseSchema.parse(validResponse)).not.toThrow()
  })

  it('rejects a response missing the SitePrices field', () => {
    expect(() => GetSitesPricesResponseSchema.parse({ wrongField: [] })).toThrow()
  })

  it('rejects a Price field that is a string', () => {
    const invalidResponse = {
      SitePrices: [
        {
          SiteId: 123,
          FuelId: 2,
          TransactionDateUtc: '2026-03-23T05:00:00Z',
          Price: '1459',
        },
      ],
    }
    expect(() => GetSitesPricesResponseSchema.parse(invalidResponse)).toThrow()
  })
})

describe('GetFullSiteDetailsResponseSchema (Zod validation)', () => {
  it('accepts the real API abbreviated field format', () => {
    const validResponse = {
      S: [
        {
          S: 61401106,
          A: '20 Commercial Rd',
          N: 'BP Newstead',
          B: 5,
          P: '4006',
          Lat: -27.452584,
          Lng: 153.041807,
          GPI: 'ChIJnW80r5NZkWsRgV8e8H0VEto',
        },
      ],
    }
    expect(() => GetFullSiteDetailsResponseSchema.parse(validResponse)).not.toThrow()
  })

  it('rejects when B (brand) is a string instead of number', () => {
    const invalidResponse = {
      S: [
        {
          S: 123,
          N: 'Test Station',
          B: 'BP',  // should be integer brand ID
          P: '4000',
          Lat: -27.4,
          Lng: 153.0,
        },
      ],
    }
    expect(() => GetFullSiteDetailsResponseSchema.parse(invalidResponse)).toThrow()
  })
})
