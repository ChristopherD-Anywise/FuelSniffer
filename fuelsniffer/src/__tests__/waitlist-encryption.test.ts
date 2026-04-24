/**
 * Tests for waitlist email encryption (AES-256-GCM) and hashing helpers.
 * Run: npx vitest run src/__tests__/waitlist-encryption.test.ts
 */

// Set env vars before importing the module under test
process.env.WAITLIST_EMAIL_AES_KEY = 'a'.repeat(64) // 32 bytes hex
process.env.WAITLIST_EMAIL_PEPPER = 'test-pepper-value'

import { describe, it, expect } from 'vitest'
import { encryptEmail, decryptEmail, hashEmail } from '@/lib/waitlist/encryption'

describe('encryptEmail / decryptEmail', () => {
  it('round-trip: decrypt(encrypt(email)) === email', () => {
    const email = 'hello@example.com'
    const encrypted = encryptEmail(email)
    const decrypted = decryptEmail(encrypted)
    expect(decrypted).toBe(email)
  })

  it('produces different ciphertexts for the same email (random IV)', () => {
    const email = 'hello@example.com'
    const enc1 = encryptEmail(email)
    const enc2 = encryptEmail(email)
    expect(enc1).not.toBe(enc2)
  })

  it('encrypted value contains three colon-separated base64 segments', () => {
    const encrypted = encryptEmail('test@test.com')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // Each segment should be valid base64 (non-empty)
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0)
    }
  })
})

describe('decryptEmail error handling', () => {
  it('throws when given a malformed encrypted string', () => {
    expect(() => decryptEmail('not-valid-format')).toThrow()
  })

  it('throws when the auth tag is wrong (tampered ciphertext)', () => {
    const encrypted = encryptEmail('victim@example.com')
    const parts = encrypted.split(':')
    // Corrupt the ciphertext segment
    const corrupted = [parts[0], Buffer.from('AAAAAAAAAA==', 'base64').toString('base64'), parts[2]].join(':')
    expect(() => decryptEmail(corrupted)).toThrow()
  })

  it('throws when decrypting with a different key', () => {
    const encrypted = encryptEmail('secret@example.com')

    // Temporarily swap the key
    const originalKey = process.env.WAITLIST_EMAIL_AES_KEY
    process.env.WAITLIST_EMAIL_AES_KEY = 'b'.repeat(64)
    try {
      expect(() => decryptEmail(encrypted)).toThrow()
    } finally {
      process.env.WAITLIST_EMAIL_AES_KEY = originalKey
    }
  })
})

describe('hashEmail', () => {
  it('is deterministic: same email + pepper yields same hash', () => {
    const email = 'user@example.com'
    expect(hashEmail(email)).toBe(hashEmail(email))
  })

  it('different emails produce different hashes', () => {
    expect(hashEmail('alice@example.com')).not.toBe(hashEmail('bob@example.com'))
  })

  it('returns a 64-char hex string (SHA-256 HMAC output)', () => {
    const hash = hashEmail('someone@example.com')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when pepper changes', () => {
    const email = 'user@example.com'
    const hash1 = hashEmail(email)

    const originalPepper = process.env.WAITLIST_EMAIL_PEPPER
    process.env.WAITLIST_EMAIL_PEPPER = 'different-pepper'
    const hash2 = hashEmail(email)
    process.env.WAITLIST_EMAIL_PEPPER = originalPepper

    expect(hash1).not.toBe(hash2)
  })
})
