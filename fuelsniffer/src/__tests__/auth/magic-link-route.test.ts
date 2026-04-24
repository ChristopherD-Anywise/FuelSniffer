import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set required env vars before imports
process.env.SESSION_SECRET = 'test-session-secret-that-is-at-least-32-chars'
process.env.APP_PUBLIC_URL = 'http://localhost:4000'
vi.stubEnv('NODE_ENV', 'test')

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { execute: vi.fn() }
      return fn(tx)
    }),
  },
}))

vi.mock('@/lib/auth/tokens', () => ({
  storeToken: vi.fn().mockResolvedValue('fake-raw-token'),
  redeemToken: vi.fn(),
  hashToken: vi.fn((s: string) => `hashed:${s}`),
  checkMagicLinkRateLimit: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/auth/linking', () => ({
  findOrCreateUser: vi.fn().mockResolvedValue({ userId: 'user-uuid-123', isNew: false }),
}))

vi.mock('@/lib/auth/cohort', () => ({
  assertAllowed: vi.fn().mockResolvedValue(undefined),
  CohortGateError: class CohortGateError extends Error {
    constructor(msg = 'invite_required') {
      super(msg)
      this.name = 'CohortGateError'
    }
  },
}))

vi.mock('@/lib/email/factory', () => ({
  getEmailSender: vi.fn(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { POST as requestPOST } from '@/app/api/auth/magic-link/request/route'
import { GET as callbackGET } from '@/app/api/auth/magic-link/callback/route'
import { redeemToken, storeToken } from '@/lib/auth/tokens'
import { findOrCreateUser } from '@/lib/auth/linking'
import { assertAllowed } from '@/lib/auth/cohort'

const mockRedeemToken = vi.mocked(redeemToken)
const mockStoreToken = vi.mocked(storeToken)
const mockFindOrCreateUser = vi.mocked(findOrCreateUser)
const mockAssertAllowed = vi.mocked(assertAllowed)

function makeRequest(
  url: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Request {
  const headers = new Headers(opts.headers ?? {})
  if (!headers.has('Origin')) {
    headers.set('Origin', 'http://localhost:4000')
  }
  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return new Request(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

describe('POST /api/auth/magic-link/request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreToken.mockResolvedValue('fake-raw-token')
  })

  it('returns { ok: true } for a valid email', async () => {
    const req = makeRequest('http://localhost:4000/api/auth/magic-link/request', {
      method: 'POST',
      body: { email: 'user@example.com' },
    })

    const res = await requestPOST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })

  it('returns { ok: true } even for unknown emails (enumeration defence)', async () => {
    const req = makeRequest('http://localhost:4000/api/auth/magic-link/request', {
      method: 'POST',
      body: { email: 'unknown@nowhere.test' },
    })

    const res = await requestPOST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })

  it('returns 400 for invalid email', async () => {
    const req = makeRequest('http://localhost:4000/api/auth/magic-link/request', {
      method: 'POST',
      body: { email: 'not-an-email' },
    })

    const res = await requestPOST(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 for Origin mismatch', async () => {
    const req = makeRequest('http://localhost:4000/api/auth/magic-link/request', {
      method: 'POST',
      body: { email: 'user@example.com' },
      headers: { Origin: 'https://evil.com' },
    })

    const res = await requestPOST(req)
    expect(res.status).toBe(403)
  })

  it('returns 429 when rate limit exceeded', async () => {
    const { checkMagicLinkRateLimit } = await import('@/lib/auth/tokens')
    vi.mocked(checkMagicLinkRateLimit).mockResolvedValueOnce(false)

    const req = makeRequest('http://localhost:4000/api/auth/magic-link/request', {
      method: 'POST',
      body: { email: 'user@example.com' },
    })

    const res = await requestPOST(req)
    expect(res.status).toBe(429)
  })
})

describe('GET /api/auth/magic-link/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrCreateUser.mockResolvedValue({ userId: 'user-uuid-123', isNew: false })
    mockAssertAllowed.mockResolvedValue(undefined)
  })

  it('issues session cookie and redirects to /dashboard on valid token', async () => {
    mockRedeemToken.mockResolvedValueOnce({ ok: true, email: 'user@example.com' })

    const req = new Request(
      'http://localhost:4000/api/auth/magic-link/callback?token=valid-token'
    )

    const res = await callbackGET(req)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('/dashboard')
    const setCookie = res.headers.get('Set-Cookie')
    expect(setCookie).toContain('fillip-session=')
  })

  it('redirects to /login?error=invalid_link for invalid token', async () => {
    mockRedeemToken.mockResolvedValueOnce({ ok: false, error: 'not_found' })

    const req = new Request(
      'http://localhost:4000/api/auth/magic-link/callback?token=bad-token'
    )

    const res = await callbackGET(req)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('/login')
    expect(res.headers.get('Location')).toContain('invalid_link')
  })

  it('returns 400 when token param is missing', async () => {
    const req = new Request('http://localhost:4000/api/auth/magic-link/callback')
    const res = await callbackGET(req)
    expect(res.status).toBe(400)
  })

  it('redirects to /login?error=invite_required when cohort gate blocks', async () => {
    mockRedeemToken.mockResolvedValueOnce({ ok: true, email: 'new@example.com' })
    mockFindOrCreateUser.mockResolvedValueOnce({ userId: 'new-user', isNew: true })

    const { CohortGateError } = await import('@/lib/auth/cohort')
    mockAssertAllowed.mockRejectedValueOnce(new CohortGateError())

    const req = new Request(
      'http://localhost:4000/api/auth/magic-link/callback?token=valid-token'
    )

    const res = await callbackGET(req)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('invite_required')
  })

  it('sanitises open-redirect: //evil.com redirects to /dashboard', async () => {
    mockRedeemToken.mockResolvedValueOnce({ ok: true, email: 'user@example.com' })

    const req = new Request(
      'http://localhost:4000/api/auth/magic-link/callback?token=valid&next=//evil.com'
    )

    const res = await callbackGET(req)
    expect(res.headers.get('Location')).toBe('/dashboard')
  })

  it('allows safe same-origin ?next= redirect', async () => {
    mockRedeemToken.mockResolvedValueOnce({ ok: true, email: 'user@example.com' })

    const req = new Request(
      'http://localhost:4000/api/auth/magic-link/callback?token=valid&next=/dashboard/trip'
    )

    const res = await callbackGET(req)
    expect(res.headers.get('Location')).toBe('/dashboard/trip')
  })
})
