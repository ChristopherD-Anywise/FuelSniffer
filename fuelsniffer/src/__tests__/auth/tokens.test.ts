import { describe, it, expect, vi } from 'vitest'

// Mock the DB client so pure token functions can be tested without Postgres
vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { generateToken, hashToken } from '@/lib/auth/tokens'

describe('token utilities', () => {
  describe('generateToken', () => {
    it('returns a string of at least 32 characters', () => {
      const token = generateToken()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThanOrEqual(32)
    })

    it('generates different tokens on each call', () => {
      const t1 = generateToken()
      const t2 = generateToken()
      expect(t1).not.toBe(t2)
    })

    it('produces URL-safe base64 (no + or /)', () => {
      for (let i = 0; i < 20; i++) {
        const token = generateToken()
        expect(token).not.toMatch(/[+/=]/)
      }
    })
  })

  describe('hashToken', () => {
    it('is deterministic', () => {
      const token = 'test-token-value'
      expect(hashToken(token)).toBe(hashToken(token))
    })

    it('produces a hex string of 64 characters (SHA-256)', () => {
      const hash = hashToken('some-token')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('different tokens produce different hashes', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
    })

    it('is sensitive to input changes', () => {
      const h1 = hashToken('abc')
      const h2 = hashToken('ABC')
      expect(h1).not.toBe(h2)
    })
  })
})
