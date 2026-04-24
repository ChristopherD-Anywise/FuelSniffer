import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Set required env vars
process.env.APPLE_TEAM_ID = 'TESTTEAMID'
process.env.APPLE_CLIENT_ID = 'com.fillip.web'
process.env.APPLE_KEY_ID = 'TESTKEYID1'
// We'll set APPLE_PRIVATE_KEY_P8 per test since invalid keys should throw

// Mock fetch globally
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Track whether generateAppleClientSecretJwt should be mocked
let _mockClientSecret: string | null = null

vi.mock('@/lib/auth/providers/apple', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/providers/apple')>()
  return {
    ...actual,
    generateAppleClientSecretJwt: vi.fn(async () => {
      if (_mockClientSecret !== null) return _mockClientSecret
      // Fall through to real implementation for JWT generation tests
      return actual.generateAppleClientSecretJwt()
    }),
  }
})

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => vi.fn()),
    jwtVerify: vi.fn(),
  }
})

import { AppleProvider, generateAppleClientSecretJwt } from '@/lib/auth/providers/apple'
import { AuthProviderError } from '@/lib/auth/providers/types'
import { jwtVerify, importPKCS8, SignJWT } from 'jose'

const mockJwtVerify = vi.mocked(jwtVerify)

// Real EC P-256 PKCS8 test key — test-only, never used in production
const TEST_EC_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgFaJ7j82EPMCgYU3D
1a4nOjMOep1HV7U3WeaeAaOVHcOhRANCAATPuJrKzKkIxvC25vZVPV6xvUgJSazR
DsBY984yMpdig4/WcXYs5UlJ9fH4KF3e308dKZBQB8r02BF0V54FfjFN
-----END PRIVATE KEY-----`

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'apple-sub-00001',
    email: 'user@example.com',
    email_verified: true,
    iss: 'https://appleid.apple.com',
    aud: 'com.fillip.web',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    nonce: 'test-nonce',
    ...overrides,
  }
}

describe('AppleProvider', () => {
  let provider: AppleProvider

  beforeEach(() => {
    provider = new AppleProvider()
    vi.clearAllMocks()
    process.env.APPLE_PRIVATE_KEY_P8 = TEST_EC_KEY_PEM
  })

  describe('buildAuthorizeUrl', () => {
    it('returns an Apple authorize URL with form_post response_mode', () => {
      const url = provider.buildAuthorizeUrl({
        redirectUri: 'https://fillip.clarily.au/api/auth/oauth/apple/callback',
        state: 'test-state',
        codeVerifier: 'verifier',
        nonce: 'test-nonce',
      })

      expect(url).toContain('appleid.apple.com')
      expect(url).toContain('response_mode=form_post')
      expect(url).toContain('state=test-state')
      expect(url).toContain('scope=')
    })
  })

  describe('generateAppleClientSecretJwt', () => {
    it('generates a valid ES256 JWT when valid .p8 key is set', async () => {
      const jwt = await generateAppleClientSecretJwt()
      expect(typeof jwt).toBe('string')
      // JWT has 3 parts
      expect(jwt.split('.').length).toBe(3)
    })

    it('throws AuthProviderError when APPLE_PRIVATE_KEY_P8 is not set', async () => {
      const saved = process.env.APPLE_PRIVATE_KEY_P8
      delete process.env.APPLE_PRIVATE_KEY_P8

      await expect(generateAppleClientSecretJwt()).rejects.toMatchObject({
        code: 'provider_error',
      })

      process.env.APPLE_PRIVATE_KEY_P8 = saved
    })

    it('throws AuthProviderError when .p8 key is malformed', async () => {
      process.env.APPLE_PRIVATE_KEY_P8 = 'not-a-valid-pem-key'

      await expect(generateAppleClientSecretJwt()).rejects.toMatchObject({
        code: 'provider_error',
      })
    })
  })

  describe('resolveIdentity', () => {
    function makeCallbackInput(overrides = {}) {
      return {
        type: 'oauth' as const,
        code: 'apple-auth-code',
        codeVerifier: 'code-verifier',
        nonce: 'test-nonce',
        redirectUri: 'https://fillip.clarily.au/api/auth/oauth/apple/callback',
        ...overrides,
      }
    }

    beforeEach(() => {
      // Bypass real client secret generation in callback tests
      _mockClientSecret = 'fake.client.secret.jwt'

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id_token: 'fake.id.token', access_token: 'access' }),
      })
    })

    afterEach(() => {
      _mockClientSecret = null
    })

    it('returns ResolvedIdentity for a valid callback', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload(),
        protectedHeader: { alg: 'ES256' },
        key: {} as CryptoKey,
      })

      const identity = await provider.resolveIdentity(makeCallbackInput())

      expect(identity.providerId).toBe('apple')
      expect(identity.providerSubject).toBe('apple-sub-00001')
      expect(identity.email).toBe('user@example.com')
      expect(identity.emailVerified).toBe(true)
      expect(identity.displayName).toBeUndefined()
    })

    it('captures display name from first-signin user payload', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload(),
        protectedHeader: { alg: 'ES256' },
        key: {} as CryptoKey,
      })

      const identity = await provider.resolveIdentity(
        makeCallbackInput({
          appleUser: { name: { firstName: 'Jane', lastName: 'Smith' } },
        })
      )

      expect(identity.displayName).toBe('Jane Smith')
    })

    it('does not set displayName when no user payload (subsequent sign-ins)', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload(),
        protectedHeader: { alg: 'ES256' },
        key: {} as CryptoKey,
      })

      const identity = await provider.resolveIdentity(makeCallbackInput())
      expect(identity.displayName).toBeUndefined()
    })

    it('handles Apple relay email (@privaterelay.appleid.com) as normal email', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload({ email: 'abc123@privaterelay.appleid.com' }),
        protectedHeader: { alg: 'ES256' },
        key: {} as CryptoKey,
      })

      const identity = await provider.resolveIdentity(makeCallbackInput())
      expect(identity.email).toBe('abc123@privaterelay.appleid.com')
      expect(identity.emailVerified).toBe(true)
    })

    it('throws on ID token validation failure', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Token validation failed'))

      await expect(provider.resolveIdentity(makeCallbackInput())).rejects.toMatchObject({
        code: 'invalid_token',
      })
    })

    it('throws on nonce mismatch', async () => {
      mockJwtVerify.mockResolvedValueOnce({
        payload: makeValidPayload({ nonce: 'wrong-nonce' }),
        protectedHeader: { alg: 'ES256' },
        key: {} as CryptoKey,
      })

      await expect(
        provider.resolveIdentity(makeCallbackInput({ nonce: 'correct-nonce' }))
      ).rejects.toMatchObject({ code: 'invalid_token' })
    })

    it('throws for non-oauth input type', async () => {
      await expect(
        provider.resolveIdentity({ type: 'magic-link', token: 'tok' })
      ).rejects.toThrow(AuthProviderError)
    })
  })
})
