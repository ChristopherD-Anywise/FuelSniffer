import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Set a known secret before importing the module
const TEST_SECRET = 'test-secret-for-signing-sp8'

describe('share/sign', () => {
  beforeEach(() => {
    process.env.SHARE_SIGNING_SECRET = TEST_SECRET
  })

  afterEach(() => {
    delete process.env.SHARE_SIGNING_SECRET
  })

  describe('signParams', () => {
    it('produces a deterministic base64url string', async () => {
      const { signParams } = await import('@/lib/share/sign')
      const sig1 = signParams({ s: '1', f: '2', p: '174', v: 'default' })
      const sig2 = signParams({ s: '1', f: '2', p: '174', v: 'default' })
      expect(sig1).toBe(sig2)
      expect(typeof sig1).toBe('string')
      expect(sig1.length).toBe(22)
    })

    it('produces different sigs for different params', async () => {
      const { signParams } = await import('@/lib/share/sign')
      const sig1 = signParams({ s: '1', f: '2', p: '174', v: 'default' })
      const sig2 = signParams({ s: '1', f: '2', p: '175', v: 'default' })
      expect(sig1).not.toBe(sig2)
    })

    it('is order-independent (canonical sort)', async () => {
      const { signParams } = await import('@/lib/share/sign')
      const sig1 = signParams({ s: '1', f: '2', p: '174', v: 'default' })
      const sig2 = signParams({ v: 'default', p: '174', f: '2', s: '1' })
      expect(sig1).toBe(sig2)
    })
  })

  describe('verifyParams', () => {
    it('returns true for a valid sig', async () => {
      const { signParams, verifyParams } = await import('@/lib/share/sign')
      const params = { s: '42', f: '3', p: '199', v: 'default' }
      const sig = signParams(params)
      expect(verifyParams(params, sig)).toBe(true)
    })

    it('returns false for a tampered param', async () => {
      const { signParams, verifyParams } = await import('@/lib/share/sign')
      const params = { s: '42', f: '3', p: '199', v: 'default' }
      const sig = signParams(params)
      expect(verifyParams({ ...params, p: '100' }, sig)).toBe(false)
    })

    it('returns false for a tampered sig', async () => {
      const { signParams, verifyParams } = await import('@/lib/share/sign')
      const params = { s: '42', f: '3', p: '199', v: 'default' }
      const sig = signParams(params)
      const tampered = sig.slice(0, -1) + (sig.at(-1) === 'a' ? 'b' : 'a')
      expect(verifyParams(params, tampered)).toBe(false)
    })

    it('returns false for empty sig', async () => {
      const { verifyParams } = await import('@/lib/share/sign')
      expect(verifyParams({ s: '1', f: '2', p: '174', v: 'default' }, '')).toBe(false)
    })
  })

  describe('computeCardHash', () => {
    it('is stable for same inputs', async () => {
      const { computeCardHash } = await import('@/lib/share/sign')
      const h1 = computeCardHash(1, 2, 174, 5, 'default')
      const h2 = computeCardHash(1, 2, 174, 5, 'default')
      expect(h1).toBe(h2)
      expect(h1).toHaveLength(64) // sha256 hex
    })

    it('changes when stationId changes', async () => {
      const { computeCardHash } = await import('@/lib/share/sign')
      expect(computeCardHash(1, 2, 174)).not.toBe(computeCardHash(2, 2, 174))
    })

    it('changes when priceCents changes', async () => {
      const { computeCardHash } = await import('@/lib/share/sign')
      expect(computeCardHash(1, 2, 174)).not.toBe(computeCardHash(1, 2, 175))
    })

    it('handles undefined radiusKm and default variant', async () => {
      const { computeCardHash } = await import('@/lib/share/sign')
      const h = computeCardHash(1, 2, 174)
      expect(typeof h).toBe('string')
      expect(h.length).toBe(64)
    })
  })
})
