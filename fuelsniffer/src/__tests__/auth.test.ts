/**
 * Tests for ACCS-01: invite code validation and session management.
 * Run: npx vitest run src/__tests__/auth.test.ts
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// Mock server-only so it doesn't throw outside Next.js server context
vi.mock('server-only', () => ({}))

// Mock next/headers — createSession/deleteSession use cookies() which is Next.js server-only
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    delete: vi.fn(),
  }),
}))

// Mock @/lib/db/client for route handler tests
vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}))

// Mock @/lib/session for route handler tests (avoids server-only boundary in unit tests)
vi.mock('@/lib/session', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}))

// Set SESSION_SECRET before any imports that read it at module load
beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-xxxx'
})

describe('encrypt / decrypt session', () => {
  it('round-trips a payload through encrypt then decrypt', async () => {
    // Import the real module (not mocked) by using a dynamic import after env is set
    const { encrypt, decrypt } = await import('../lib/session')
    const payload = { userId: 'test-user-abc', expiresAt: new Date('2099-01-01') }
    const token = await encrypt(payload)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)

    const decoded = await decrypt(token)
    expect(decoded).not.toBeNull()
    expect(decoded?.userId).toBe('test-user-abc')
  })

  it('decrypt returns null for a tampered token', async () => {
    const { decrypt } = await import('../lib/session')
    const result = await decrypt('invalid-token-string-that-is-not-a-jwt')
    expect(result).toBeNull()
  })

  it('decrypt returns null for undefined input', async () => {
    const { decrypt } = await import('../lib/session')
    const result = await decrypt(undefined)
    expect(result).toBeNull()
  })
})

describe('validateInviteCode()', () => {
  it.todo('returns the code row when code exists and is_active=true')
  it.todo('returns null when code does not exist')
  it.todo('returns null when code exists but is_active=false')
})
