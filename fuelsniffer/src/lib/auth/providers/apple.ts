import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose'
import type { AuthProvider, OAuthCallbackInput, ProviderCallbackInput, ResolvedIdentity } from './types'
import { AuthProviderError } from './types'
import { deriveCodeChallenge } from '@/lib/auth/pkce'

const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys'
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token'

// Cache JWKS
let _appleJwksSet: ReturnType<typeof createRemoteJWKSet> | null = null

function getAppleJwksSet(): ReturnType<typeof createRemoteJWKSet> {
  if (!_appleJwksSet) {
    _appleJwksSet = createRemoteJWKSet(new URL(APPLE_JWKS_URL))
  }
  return _appleJwksSet
}

interface AppleTokenResponse {
  id_token: string
  access_token: string
  token_type: string
}

function getRequiredEnv(name: string, errorCode?: string): string {
  const val = process.env[name]
  if (!val) {
    throw new AuthProviderError(
      `${name} environment variable is required for Apple Sign In`,
      (errorCode as 'provider_error') ?? 'provider_error'
    )
  }
  return val
}

/**
 * Generate an Apple client secret JWT.
 *
 * Apple requires a short-lived (max 6 months) ES256 JWT signed with the
 * .p8 private key. Claims: iss=teamId, iat, exp, aud=appleid.apple.com, sub=clientId.
 */
export async function generateAppleClientSecretJwt(): Promise<string> {
  const teamId = getRequiredEnv('APPLE_TEAM_ID')
  const clientId = getRequiredEnv('APPLE_CLIENT_ID')
  const keyId = getRequiredEnv('APPLE_KEY_ID')
  const privateKeyPem = getRequiredEnv('APPLE_PRIVATE_KEY_P8')

  let privateKey: CryptoKey
  try {
    // Apple .p8 keys are PKCS8 EC keys
    privateKey = await importPKCS8(privateKeyPem, 'ES256')
  } catch (err) {
    throw new AuthProviderError(
      `Failed to import APPLE_PRIVATE_KEY_P8: ${err instanceof Error ? err.message : 'invalid PEM'}`,
      'provider_error'
    )
  }

  const now = Math.floor(Date.now() / 1000)
  // TTL: 1 hour (well within Apple's 6-month max)
  const exp = now + 3600

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey)
}

export class AppleProvider implements AuthProvider {
  readonly id = 'apple' as const

  buildAuthorizeUrl(opts: {
    redirectUri: string
    state: string
    codeVerifier?: string
    nonce?: string
  }): string {
    const clientId = getRequiredEnv('APPLE_CLIENT_ID')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: opts.redirectUri,
      response_type: 'code',
      scope: 'name email',
      state: opts.state,
      response_mode: 'form_post',
    })

    if (opts.codeVerifier) {
      params.set('code_challenge', deriveCodeChallenge(opts.codeVerifier))
      params.set('code_challenge_method', 'S256')
    }

    if (opts.nonce) {
      params.set('nonce', opts.nonce)
    }

    return `https://appleid.apple.com/auth/authorize?${params.toString()}`
  }

  async resolveIdentity(input: ProviderCallbackInput): Promise<ResolvedIdentity> {
    if (input.type !== 'oauth') {
      throw new AuthProviderError('Invalid input type for Apple provider', 'provider_error')
    }

    const callbackInput = input as OAuthCallbackInput
    const clientId = getRequiredEnv('APPLE_CLIENT_ID')

    // Generate client secret JWT
    const clientSecret = await generateAppleClientSecretJwt()

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      code: callbackInput.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackInput.redirectUri,
      grant_type: 'authorization_code',
    })

    if (callbackInput.codeVerifier) {
      tokenParams.set('code_verifier', callbackInput.codeVerifier)
    }

    const tokenRes = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      throw new AuthProviderError(`Apple token exchange failed: ${body}`, 'provider_error')
    }

    const tokens = await tokenRes.json() as AppleTokenResponse

    // Validate ID token
    const jwks = getAppleJwksSet()

    let payload: Record<string, unknown>
    try {
      const { payload: p } = await jwtVerify(tokens.id_token, jwks, {
        issuer: APPLE_ISSUER,
        audience: clientId,
      })
      payload = p as Record<string, unknown>
    } catch (err) {
      throw new AuthProviderError(
        `Apple ID token validation failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'invalid_token'
      )
    }

    // Validate nonce if provided
    if (callbackInput.nonce && payload.nonce !== callbackInput.nonce) {
      throw new AuthProviderError('Apple ID token nonce mismatch', 'invalid_token')
    }

    const sub = payload.sub as string
    const email = (payload.email as string)?.toLowerCase().trim()
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true'

    if (!sub || !email) {
      throw new AuthProviderError('Apple ID token missing sub or email claims', 'invalid_token')
    }

    // Extract display name — only available on first sign-in from form_post body
    let displayName: string | undefined
    if (callbackInput.appleUser?.name) {
      const { firstName, lastName } = callbackInput.appleUser.name
      const parts = [firstName, lastName].filter(Boolean)
      if (parts.length > 0) {
        displayName = parts.join(' ')
      }
    }

    return {
      providerId: 'apple',
      providerSubject: sub,
      email,
      emailVerified,
      displayName,
      rawClaims: payload,
    }
  }
}
