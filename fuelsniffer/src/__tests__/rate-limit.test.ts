import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, resetRateLimits, type RateLimitConfig } from '@/lib/security/rate-limit'

const config: RateLimitConfig = { maxRequests: 5, windowMs: 60_000 }

describe('checkRateLimit (in-memory token bucket)', () => {
  beforeEach(() => resetRateLimits())

  it('allows requests under the limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('test-ip', 'test-bucket', config)
      expect(result.allowed).toBe(true)
    }
  })

  it('rejects the request that exceeds the limit', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('test-ip', 'test-bucket', config)
    }
    const result = checkRateLimit('test-ip', 'test-bucket', config)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('ip-a', 'test-bucket', config)
    }
    const resultA = checkRateLimit('ip-a', 'test-bucket', config)
    const resultB = checkRateLimit('ip-b', 'test-bucket', config)
    expect(resultA.allowed).toBe(false)
    expect(resultB.allowed).toBe(true)
  })

  it('tracks different buckets independently', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('test-ip', 'bucket-a', config)
    }
    const resultA = checkRateLimit('test-ip', 'bucket-a', config)
    const resultB = checkRateLimit('test-ip', 'bucket-b', config)
    expect(resultA.allowed).toBe(false)
    expect(resultB.allowed).toBe(true)
  })

  it('resets after window expires', async () => {
    const shortConfig: RateLimitConfig = { maxRequests: 2, windowMs: 100 }
    checkRateLimit('test-ip', 'test-bucket', shortConfig)
    checkRateLimit('test-ip', 'test-bucket', shortConfig)
    expect(checkRateLimit('test-ip', 'test-bucket', shortConfig).allowed).toBe(false)

    await new Promise(resolve => setTimeout(resolve, 150))

    expect(checkRateLimit('test-ip', 'test-bucket', shortConfig).allowed).toBe(true)
  })
})
