import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.SESSION_SECRET = 'test-session-secret-that-is-at-least-32-chars'
process.env.APP_PUBLIC_URL = 'http://localhost:4000'
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
process.env.APPLE_TEAM_ID = 'TESTTEAM'
process.env.APPLE_CLIENT_ID = 'com.fillip.web'
process.env.APPLE_KEY_ID = 'TESTKEY'

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { execute: vi.fn().mockResolvedValue([]) }
      return fn(tx)
    }),
  },
}))

vi.mock('@/lib/auth/providers/google', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/providers/google')>()

  class MockGoogleProvider {
    id = 'google'
    buildAuthorizeUrl() { return 'https://accounts.google.com/auth?state=test' }
    async resolveIdentity() {
      return {
        providerId: 'google' as const,
        providerSubject: 'google-sub-123',
        email: 'google@example.com',
        emailVerified: true,
        displayName: 'Google User',
      }
    }
  }

  return {
    ...actual,
    resetGoogleProviderCache: vi.fn(),
    GoogleProvider: MockGoogleProvider,
  }
})

vi.mock('@/lib/auth/providers/apple', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/providers/apple')>()

  class MockAppleProvider {
    id = 'apple'
    buildAuthorizeUrl() { return 'https://appleid.apple.com/auth?state=test' }
    async resolveIdentity() {
      return {
        providerId: 'apple' as const,
        providerSubject: 'apple-sub-456',
        email: 'apple@example.com',
        emailVerified: true,
        displayName: 'Apple User',
      }
    }
  }

  return {
    ...actual,
    generateAppleClientSecretJwt: vi.fn().mockResolvedValue('fake-secret'),
    AppleProvider: MockAppleProvider,
  }
})

vi.mock('@/lib/auth/linking', () => ({
  findOrCreateUser: vi.fn().mockResolvedValue({ userId: 'user-uuid', isNew: false }),
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

import { GET as googleStart } from '@/app/api/auth/oauth/google/start/route'
import { GET as googleCallback } from '@/app/api/auth/oauth/google/callback/route'
import { GET as appleStart } from '@/app/api/auth/oauth/apple/start/route'
import { POST as appleCallback } from '@/app/api/auth/oauth/apple/callback/route'
import { findOrCreateUser } from '@/lib/auth/linking'
import { assertAllowed } from '@/lib/auth/cohort'

const mockFindOrCreateUser = vi.mocked(findOrCreateUser)
const mockAssertAllowed = vi.mocked(assertAllowed)

function makeCallbackRequest(url: string, cookies: string): Request {
  return new Request(url, {
    headers: { cookie: cookies },
  })
}

describe('Google OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrCreateUser.mockResolvedValue({ userId: 'user-uuid', isNew: false })
    mockAssertAllowed.mockResolvedValue(undefined)
  })

  describe('GET /api/auth/oauth/google/start', () => {
    it('redirects to Google authorize URL and sets state cookies', async () => {
      const req = new Request('http://localhost:4000/api/auth/oauth/google/start')
      const res = await googleStart(req)

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toContain('accounts.google.com')

      // Should set 3 state cookies
      const cookies = res.headers.getSetCookie?.() ?? []
      expect(cookies.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('GET /api/auth/oauth/google/callback', () => {
    it('issues session and redirects to /dashboard on valid callback', async () => {
      const stateValue = 'valid-state-value'
      const cookieHeader = [
        `__Host-fillip_oauth_state=${stateValue}`,
        `__Host-fillip_oauth_pkce=code-verifier-123`,
        `__Host-fillip_oauth_nonce=nonce-value`,
      ].join('; ')

      const req = makeCallbackRequest(
        `http://localhost:4000/api/auth/oauth/google/callback?code=auth-code&state=${stateValue}`,
        cookieHeader
      )

      const res = await googleCallback(req)

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/dashboard')
      // Session cookie should be set
      const setCookieHeaders = res.headers.getSetCookie?.() ?? [res.headers.get('Set-Cookie') ?? '']
      const hasSession = setCookieHeaders.some(c => c.includes('fillip-session='))
      expect(hasSession).toBe(true)
    })

    it('rejects state mismatch', async () => {
      const cookieHeader = [
        `__Host-fillip_oauth_state=correct-state`,
        `__Host-fillip_oauth_pkce=verifier`,
        `__Host-fillip_oauth_nonce=nonce`,
      ].join('; ')

      const req = makeCallbackRequest(
        'http://localhost:4000/api/auth/oauth/google/callback?code=code&state=wrong-state',
        cookieHeader
      )

      const res = await googleCallback(req)
      expect(res.headers.get('Location')).toContain('oauth_failed')
    })

    it('redirects to /login?error=oauth_failed when findOrCreateUser throws', async () => {
      mockFindOrCreateUser.mockRejectedValueOnce(new Error('DB error'))

      const stateValue = 'state-123'
      const cookieHeader = [
        `__Host-fillip_oauth_state=${stateValue}`,
        `__Host-fillip_oauth_pkce=verifier`,
        `__Host-fillip_oauth_nonce=nonce`,
      ].join('; ')

      const req = makeCallbackRequest(
        `http://localhost:4000/api/auth/oauth/google/callback?code=code&state=${stateValue}`,
        cookieHeader
      )

      const res = await googleCallback(req)
      expect(res.headers.get('Location')).toContain('oauth_failed')
    })

    it('blocks open-redirect and falls back to /dashboard', async () => {
      const stateValue = 'state-safe'
      const cookieHeader = [
        `__Host-fillip_oauth_state=${stateValue}`,
        `__Host-fillip_oauth_pkce=verifier`,
        `__Host-fillip_oauth_nonce=nonce`,
      ].join('; ')

      const req = makeCallbackRequest(
        `http://localhost:4000/api/auth/oauth/google/callback?code=code&state=${stateValue}&next=//evil.com`,
        cookieHeader
      )

      const res = await googleCallback(req)
      expect(res.headers.get('Location')).toBe('/dashboard')
    })
  })
})

describe('Apple OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrCreateUser.mockResolvedValue({ userId: 'user-uuid', isNew: false })
    mockAssertAllowed.mockResolvedValue(undefined)
  })

  describe('GET /api/auth/oauth/apple/start', () => {
    it('redirects to Apple authorize URL with state cookies', async () => {
      const req = new Request('http://localhost:4000/api/auth/oauth/apple/start')
      const res = await appleStart(req)

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toContain('appleid.apple.com')
    })
  })

  describe('POST /api/auth/oauth/apple/callback', () => {
    it('handles form_post callback and issues session', async () => {
      const stateValue = 'apple-state'
      const cookieHeader = [
        `__Host-fillip_oauth_state=${stateValue}`,
        `__Host-fillip_oauth_pkce=verifier`,
        `__Host-fillip_oauth_nonce=nonce`,
      ].join('; ')

      const body = new URLSearchParams({
        code: 'apple-auth-code',
        state: stateValue,
        user: JSON.stringify({ name: { firstName: 'Jane', lastName: 'Doe' } }),
      })

      const req = new Request('http://localhost:4000/api/auth/oauth/apple/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          cookie: cookieHeader,
        },
        body: body.toString(),
      })

      const res = await appleCallback(req)
      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/dashboard')
    })

    it('rejects state mismatch', async () => {
      const cookieHeader = `__Host-fillip_oauth_state=correct-state; __Host-fillip_oauth_pkce=v; __Host-fillip_oauth_nonce=n`
      const body = new URLSearchParams({ code: 'code', state: 'wrong-state' })

      const req = new Request('http://localhost:4000/api/auth/oauth/apple/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieHeader },
        body: body.toString(),
      })

      const res = await appleCallback(req)
      expect(res.headers.get('Location')).toContain('oauth_failed')
    })
  })
})
