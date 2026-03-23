/**
 * Tests for ACCS-01: invite code validation and session management.
 * Run: npx vitest run src/__tests__/auth.test.ts
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock server-only so it doesn't throw outside Next.js server context
vi.mock('server-only', () => ({}))

// Mock next/headers — createSession/deleteSession use cookies() which is Next.js server-only
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    delete: vi.fn(),
  }),
}))

// DB mock — configured per-test via mockResolvedValueOnce in each test
const mockWhere = vi.fn()
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })
const mockUpdateWhere = vi.fn()
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

vi.mock('@/lib/db/client', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}))

// Mock @/lib/session for route handler tests (avoids server-only boundary in unit tests)
const mockCreateSession = vi.fn().mockResolvedValue(undefined)
const mockDeleteSession = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/session', () => ({
  createSession: mockCreateSession,
  deleteSession: mockDeleteSession,
}))

// Set SESSION_SECRET before any imports that read it at module load
beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-32-chars-minimum-xxxx'
})

// Reset mock call counts before each test
beforeEach(() => {
  vi.clearAllMocks()
  // Re-configure mock chain after clearAllMocks resets everything
  mockFrom.mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
  mockUpdate.mockReturnValue({ set: mockUpdateSet })
})

// ─── encrypt / decrypt ────────────────────────────────────────────────────────

describe('encrypt / decrypt session', () => {
  it('round-trips a payload through encrypt then decrypt', async () => {
    const session = await import('@/lib/session')
    const payload = { userId: 'test-user-abc', expiresAt: new Date('2099-01-01') }
    const token = await session.encrypt(payload)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)

    const decoded = await session.decrypt(token)
    expect(decoded).not.toBeNull()
    expect(decoded?.userId).toBe('test-user-abc')
  })

  it('decrypt returns null for a tampered token', async () => {
    const session = await import('@/lib/session')
    const result = await session.decrypt('invalid-token-string-that-is-not-a-jwt')
    expect(result).toBeNull()
  })

  it('decrypt returns null for undefined input', async () => {
    const session = await import('@/lib/session')
    const result = await session.decrypt(undefined)
    expect(result).toBeNull()
  })
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 200 and calls createSession when invite code is valid and active', async () => {
    const { POST } = await import('@/app/api/auth/login/route')

    // DB returns an active invite code
    mockWhere.mockResolvedValueOnce([
      { id: 1, code: 'a3f82b9c', isActive: true, label: "Alice's phone" },
    ])
    mockUpdateWhere.mockResolvedValueOnce([])

    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ code: 'a3f82b9c' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(mockCreateSession).toHaveBeenCalledOnce()
  })

  it('returns 401 with error message when invite code does not exist', async () => {
    const { POST } = await import('@/app/api/auth/login/route')

    // DB returns no rows
    mockWhere.mockResolvedValueOnce([])

    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ code: 'nonexistent' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe("That code isn't valid. Check with the person who shared it.")
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('returns 401 with error message when invite code exists but is_active=false', async () => {
    const { POST } = await import('@/app/api/auth/login/route')

    // DB returns an inactive invite code
    mockWhere.mockResolvedValueOnce([
      { id: 2, code: 'a3f82b9c', isActive: false, label: "Bob's phone" },
    ])

    const req = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ code: 'a3f82b9c' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe("That code isn't valid. Check with the person who shared it.")
    expect(mockCreateSession).not.toHaveBeenCalled()
  })
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('returns 200 and calls deleteSession', async () => {
    const { POST } = await import('@/app/api/auth/logout/route')

    const res = await POST()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(mockDeleteSession).toHaveBeenCalledOnce()
  })
})

// ─── validateInviteCode stubs (to be replaced when extracted to lib function) ─

describe('validateInviteCode()', () => {
  it.todo('returns the code row when code exists and is_active=true')
  it.todo('returns null when code does not exist')
  it.todo('returns null when code exists but is_active=false')
})
