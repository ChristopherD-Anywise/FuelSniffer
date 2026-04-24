import { describe, it, expect, beforeEach } from 'vitest'

// Set SESSION_SECRET before importing session module
process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-characters-long'

import { createSession, getSession, clearSession } from '@/lib/session'

function makeMockRequest(cookieValue?: string): Request {
  const headers = new Headers()
  if (cookieValue !== undefined) {
    headers.set('cookie', `fillip-session=${cookieValue}`)
  }
  return new Request('http://localhost:4000/dashboard', { headers })
}

describe('session', () => {
  describe('createSession', () => {
    it('returns a Set-Cookie header string', async () => {
      const cookie = await createSession('user-123')
      expect(cookie).toContain('fillip-session=')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
    })

    it('embeds userId in a verifiable JWT', async () => {
      const cookie = await createSession('user-abc')
      // Extract token from cookie header
      const tokenMatch = cookie.match(/fillip-session=([^;]+)/)
      expect(tokenMatch).not.toBeNull()
      const token = tokenMatch![1]

      // Verify via getSession
      const req = makeMockRequest(token)
      const session = await getSession(req)
      expect(session).not.toBeNull()
      expect(session!.userId).toBe('user-abc')
    })
  })

  describe('getSession', () => {
    it('returns null when no cookie is present', async () => {
      const req = makeMockRequest()
      const session = await getSession(req)
      expect(session).toBeNull()
    })

    it('returns null for a tampered token', async () => {
      const req = makeMockRequest('eyJhbGciOiJIUzI1NiJ9.tampered.sig')
      const session = await getSession(req)
      expect(session).toBeNull()
    })

    it('returns null for an obviously invalid token', async () => {
      const req = makeMockRequest('not-a-jwt-at-all')
      const session = await getSession(req)
      expect(session).toBeNull()
    })

    it('returns { userId } for a valid session token', async () => {
      const cookie = await createSession('user-xyz')
      const tokenMatch = cookie.match(/fillip-session=([^;]+)/)
      const token = tokenMatch![1]

      const req = makeMockRequest(token)
      const session = await getSession(req)
      expect(session).toEqual({ userId: 'user-xyz' })
    })
  })

  describe('clearSession', () => {
    it('returns a Set-Cookie header that expires the session cookie', () => {
      const cookie = clearSession()
      expect(cookie).toContain('fillip-session=')
      expect(cookie).toContain('Max-Age=0')
    })
  })
})
