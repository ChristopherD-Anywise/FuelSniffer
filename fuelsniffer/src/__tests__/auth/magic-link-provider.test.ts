import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB and tokens
vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(),
  },
}))

// Mock redeemToken so we can control its output
vi.mock('@/lib/auth/tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/tokens')>()
  return {
    ...actual,
    redeemToken: vi.fn(),
  }
})

import { MagicLinkProvider } from '@/lib/auth/providers/magic-link'
import { redeemToken } from '@/lib/auth/tokens'
import { AuthProviderError } from '@/lib/auth/providers/types'

const mockRedeemToken = vi.mocked(redeemToken)

describe('MagicLinkProvider', () => {
  let provider: MagicLinkProvider

  beforeEach(() => {
    provider = new MagicLinkProvider()
    vi.clearAllMocks()
  })

  it('returns a valid ResolvedIdentity for a good token', async () => {
    mockRedeemToken.mockResolvedValueOnce({ ok: true, email: 'user@example.com' })

    const identity = await provider.resolveIdentity({
      type: 'magic-link',
      token: 'valid-raw-token',
    })

    expect(identity.providerId).toBe('magic-link')
    expect(identity.email).toBe('user@example.com')
    expect(identity.emailVerified).toBe(true)
    expect(identity.providerSubject).toBeTruthy()
    expect(typeof identity.providerSubject).toBe('string')
  })

  it('normalises email to lowercase', async () => {
    mockRedeemToken.mockResolvedValueOnce({ ok: true, email: 'User@EXAMPLE.COM' })

    const identity = await provider.resolveIdentity({
      type: 'magic-link',
      token: 'some-token',
    })

    expect(identity.email).toBe('user@example.com')
  })

  it('throws AuthProviderError with code token_not_found for unknown token', async () => {
    mockRedeemToken.mockResolvedValue({ ok: false, error: 'not_found' })

    await expect(
      provider.resolveIdentity({ type: 'magic-link', token: 'bad-token' })
    ).rejects.toThrow(AuthProviderError)

    await expect(
      provider.resolveIdentity({ type: 'magic-link', token: 'bad-token' })
    ).rejects.toMatchObject({ code: 'token_not_found' })
  })

  it('throws AuthProviderError with code token_expired for expired token', async () => {
    mockRedeemToken.mockResolvedValue({ ok: false, error: 'expired' })

    await expect(
      provider.resolveIdentity({ type: 'magic-link', token: 'expired-token' })
    ).rejects.toMatchObject({ code: 'token_expired' })
  })

  it('throws AuthProviderError with code token_consumed for already-used token', async () => {
    mockRedeemToken.mockResolvedValue({ ok: false, error: 'consumed' })

    await expect(
      provider.resolveIdentity({ type: 'magic-link', token: 'consumed-token' })
    ).rejects.toMatchObject({ code: 'token_consumed' })
  })

  it('throws for non-magic-link input type', async () => {
    await expect(
      provider.resolveIdentity({
        type: 'oauth',
        code: 'abc',
        codeVerifier: 'xyz',
        nonce: 'n',
        redirectUri: 'http://localhost',
      })
    ).rejects.toThrow(AuthProviderError)
  })

  it('providerSubject is deterministic for the same email', async () => {
    mockRedeemToken.mockResolvedValue({ ok: true, email: 'same@example.com' })

    const id1 = await provider.resolveIdentity({ type: 'magic-link', token: 'tok1' })
    const id2 = await provider.resolveIdentity({ type: 'magic-link', token: 'tok2' })

    expect(id1.providerSubject).toBe(id2.providerSubject)
  })
})
