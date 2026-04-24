import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set required env vars
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'

// Mock fetch globally for provider network calls
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Mock jose's remote JWKS to avoid real network
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => {
      // Return a fake JWKS function
      return vi.fn()
    }),
    jwtVerify: vi.fn(),
  }
})

import { GoogleProvider, resetGoogleProviderCache } from '@/lib/auth/providers/google'
import { AuthProviderError } from '@/lib/auth/providers/types'
import { jwtVerify } from 'jose'

const mockJwtVerify = vi.mocked(jwtVerify)

const DISCOVERY_DOC = {
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
}

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'google-sub-12345',
    email: 'user@example.com',
    email_verified: true,
    name: 'Test User',
    iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    nonce: 'test-nonce',
    ...overrides,
  }
}

describe('GoogleProvider', () => {
  let provider: GoogleProvider

  beforeEach(() => {
    provider = new GoogleProvider()
    vi.clearAllMocks()
    resetGoogleProviderCache()

    // Default: discovery doc fetch succeeds for first call, then token endpoint
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => DISCOVERY_DOC,
      text: async () => JSON.stringify(DISCOVERY_DOC),
    })
  })

  describe('buildAuthorizeUrl', () => {
    it('returns a Google authorize URL with required params', () => {
      const url = provider.buildAuthorizeUrl({
        redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
        state: 'test-state',
        codeVerifier: 'test-verifier',
        nonce: 'test-nonce',
      })

      expect(url).toContain('accounts.google.com')
      expect(url).toContain('state=test-state')
      expect(url).toContain('code_challenge_method=S256')
      expect(url).toContain('nonce=test-nonce')
      expect(url).toContain('scope=')
    })
  })

  describe('resolveIdentity', () => {
    function makeCallbackInput(overrides = {}) {
      return {
        type: 'oauth' as const,
        code: 'auth-code-123',
        codeVerifier: 'code-verifier',
        nonce: 'test-nonce',
        redirectUri: 'http://localhost:4000/api/auth/oauth/google/callback',
        ...overrides,
      }
    }

    it('returns ResolvedIdentity for a valid callback', async () => {
      // Mock token exchange
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => DISCOVERY_DOC,
      })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'fake.id.token', access_token: 'access' }),
      })

      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload(),
        protectedHeader: { alg: 'RS256' },
        key: {} as CryptoKey,
      })

      const identity = await provider.resolveIdentity(makeCallbackInput())

      expect(identity.providerId).toBe('google')
      expect(identity.providerSubject).toBe('google-sub-12345')
      expect(identity.email).toBe('user@example.com')
      expect(identity.emailVerified).toBe(true)
      expect(identity.displayName).toBe('Test User')
    })

    it('throws on token exchange failure', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => DISCOVERY_DOC })
      fetchMock.mockResolvedValueOnce({ ok: false, text: async () => 'invalid_grant' })

      await expect(provider.resolveIdentity(makeCallbackInput())).rejects.toThrow(AuthProviderError)
    })

    it('throws on invalid ID token signature', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => DISCOVERY_DOC })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'bad.token', access_token: 'access' }),
      })

      mockJwtVerify.mockRejectedValueOnce(new Error('Signature verification failed'))

      await expect(provider.resolveIdentity(makeCallbackInput())).rejects.toMatchObject({
        code: 'invalid_token',
      })
    })

    it('throws on wrong iss', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => DISCOVERY_DOC })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'token', access_token: 'access' }),
      })

      // jwtVerify with issuer mismatch throws
      mockJwtVerify.mockRejectedValueOnce(new Error('"iss" claim value mismatch'))

      await expect(provider.resolveIdentity(makeCallbackInput())).rejects.toMatchObject({
        code: 'invalid_token',
      })
    })

    it('throws on nonce mismatch', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => DISCOVERY_DOC })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'token', access_token: 'access' }),
      })

      // Return payload with wrong nonce
      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload({ nonce: 'wrong-nonce' }),
        protectedHeader: { alg: 'RS256' },
        key: {} as CryptoKey,
      })

      await expect(
        provider.resolveIdentity(makeCallbackInput({ nonce: 'correct-nonce' }))
      ).rejects.toMatchObject({ code: 'invalid_token' })
    })

    it('normalises email to lowercase', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => DISCOVERY_DOC })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'token', access_token: 'access' }),
      })

      // Use nonce='test-nonce' to match makeCallbackInput default
      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload({ email: 'USER@EXAMPLE.COM', nonce: 'test-nonce' }),
        protectedHeader: { alg: 'RS256' },
        key: {} as CryptoKey,
      })

      const identity = await provider.resolveIdentity(makeCallbackInput())
      expect(identity.email).toBe('user@example.com')
    })

    it('throws for non-oauth input type', async () => {
      await expect(
        provider.resolveIdentity({ type: 'magic-link', token: 'tok' })
      ).rejects.toThrow(AuthProviderError)
    })
  })
})
