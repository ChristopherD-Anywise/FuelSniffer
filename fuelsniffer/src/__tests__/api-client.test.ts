/**
 * Stubs for DATA-01: QLD API authentication and data fetch.
 * These tests are INTENTIONALLY FAILING until Plan 03 implements api-client.
 * Run: npx vitest run src/__tests__/api-client.test.ts
 */
import { describe, it, expect } from 'vitest'

describe('QLD API client authentication', () => {
  it('includes the FPDAPI SubscriberToken Authorization header on every request', () => {
    // Will verify that the client adds: Authorization: 'FPDAPI SubscriberToken=TOKEN'
    const buildAuthHeader = (_token: string): string => { throw new Error('not implemented') }
    expect(buildAuthHeader('my-token')).toBe('FPDAPI SubscriberToken=my-token')
  })

  it('throws if QLD_API_TOKEN env var is not set', () => {
    const createApiClient = () => { throw new Error('not implemented') }
    const originalToken = process.env.QLD_API_TOKEN
    delete process.env.QLD_API_TOKEN
    expect(() => createApiClient()).toThrow()
    process.env.QLD_API_TOKEN = originalToken
  })
})

describe('fetchWithRetry', () => {
  it('retries exactly 3 times before throwing on persistent failure', async () => {
    const fetchWithRetry = async <T>(_fn: () => Promise<T>, _retries?: number): Promise<T> => {
      throw new Error('not implemented')
    }
    let callCount = 0
    const alwaysFails = () => { callCount++; return Promise.reject(new Error('API down')) }
    await expect(fetchWithRetry(alwaysFails, 3)).rejects.toThrow('API down')
    expect(callCount).toBe(3)
  })

  it('succeeds on the second attempt without throwing', async () => {
    const fetchWithRetry = async <T>(_fn: () => Promise<T>, _retries?: number): Promise<T> => {
      throw new Error('not implemented')
    }
    let callCount = 0
    const succeedsOnSecond = () => {
      callCount++
      if (callCount < 2) return Promise.reject(new Error('transient'))
      return Promise.resolve('ok' as unknown as never)
    }
    const result = await fetchWithRetry(succeedsOnSecond, 3)
    expect(result).toBe('ok')
    expect(callCount).toBe(2)
  })
})
