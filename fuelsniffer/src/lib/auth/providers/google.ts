import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AuthProvider, OAuthCallbackInput, ProviderCallbackInput, ResolvedIdentity } from './types'
import { AuthProviderError } from './types'
import { deriveCodeChallenge } from '@/lib/auth/pkce'

const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration'
const GOOGLE_ISSUER = 'https://accounts.google.com'

interface GoogleDiscovery {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
}

interface GoogleTokenResponse {
  id_token: string
  access_token: string
  token_type: string
}

// Cache discovery doc for 24 hours
let _discovery: GoogleDiscovery | null = null
let _discoveryFetchedAt = 0
const DISCOVERY_CACHE_MS = 24 * 60 * 60 * 1000

/** Reset caches — for testing only */
export function resetGoogleProviderCache(): void {
  _discovery = null
  _discoveryFetchedAt = 0
  _jwksSet = null
  _jwksUri = ''
}

async function getDiscovery(): Promise<GoogleDiscovery> {
  const now = Date.now()
  if (_discovery && (now - _discoveryFetchedAt) < DISCOVERY_CACHE_MS) {
    return _discovery
  }

  const res = await fetch(GOOGLE_DISCOVERY_URL)
  if (!res.ok) {
    throw new AuthProviderError('Failed to fetch Google discovery document', 'provider_error')
  }
  _discovery = await res.json() as GoogleDiscovery
  _discoveryFetchedAt = now
  return _discovery
}

// Cache JWKS set
let _jwksSet: ReturnType<typeof createRemoteJWKSet> | null = null
let _jwksUri = ''

function getJwksSet(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwksSet || _jwksUri !== jwksUri) {
    _jwksSet = createRemoteJWKSet(new URL(jwksUri))
    _jwksUri = jwksUri
  }
  return _jwksSet
}

export class GoogleProvider implements AuthProvider {
  readonly id = 'google' as const

  private getClientId(): string {
    const id = process.env.GOOGLE_CLIENT_ID
    if (!id) throw new AuthProviderError('GOOGLE_CLIENT_ID not configured', 'provider_error')
    return id
  }

  private getClientSecret(): string {
    const secret = process.env.GOOGLE_CLIENT_SECRET
    if (!secret) throw new AuthProviderError('GOOGLE_CLIENT_SECRET not configured', 'provider_error')
    return secret
  }

  buildAuthorizeUrl(opts: {
    redirectUri: string
    state: string
    codeVerifier?: string
    nonce?: string
  }): string {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: opts.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: opts.state,
      access_type: 'online',
    })

    if (opts.codeVerifier) {
      params.set('code_challenge', deriveCodeChallenge(opts.codeVerifier))
      params.set('code_challenge_method', 'S256')
    }

    if (opts.nonce) {
      params.set('nonce', opts.nonce)
    }

    // Use cached discovery endpoint or fallback
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  async resolveIdentity(input: ProviderCallbackInput): Promise<ResolvedIdentity> {
    if (input.type !== 'oauth') {
      throw new AuthProviderError('Invalid input type for Google provider', 'provider_error')
    }

    const callbackInput = input as OAuthCallbackInput
    const discovery = await getDiscovery()
    const clientId = this.getClientId()
    const clientSecret = this.getClientSecret()

    // Exchange code for tokens
    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: callbackInput.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackInput.redirectUri,
        grant_type: 'authorization_code',
        ...(callbackInput.codeVerifier ? { code_verifier: callbackInput.codeVerifier } : {}),
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      throw new AuthProviderError(`Google token exchange failed: ${body}`, 'provider_error')
    }

    const tokens = await tokenRes.json() as GoogleTokenResponse

    // Validate ID token
    const jwks = await getJwksSet(discovery.jwks_uri)

    let payload: Record<string, unknown>
    try {
      const { payload: p } = await jwtVerify(tokens.id_token, jwks, {
        issuer: GOOGLE_ISSUER,
        audience: clientId,
      })
      payload = p as Record<string, unknown>
    } catch (err) {
      throw new AuthProviderError(
        `Google ID token validation failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'invalid_token'
      )
    }

    // Validate nonce if provided
    if (callbackInput.nonce && payload.nonce !== callbackInput.nonce) {
      throw new AuthProviderError('Google ID token nonce mismatch', 'invalid_token')
    }

    const sub = payload.sub as string
    const email = (payload.email as string)?.toLowerCase().trim()
    const emailVerified = Boolean(payload.email_verified)
    const displayName = (payload.name as string) ?? undefined

    if (!sub || !email) {
      throw new AuthProviderError('Google ID token missing sub or email claims', 'invalid_token')
    }

    return {
      providerId: 'google',
      providerSubject: sub,
      email,
      emailVerified,
      displayName,
      rawClaims: payload,
    }
  }
}
