/**
 * Auth provider abstraction — SP-2 Auth v2.
 *
 * All three providers (magic-link, Google, Apple) implement this interface.
 * Route handlers call resolveIdentity() → findOrCreateUser() → createSession().
 */

export type AuthProviderId = 'magic-link' | 'google' | 'apple'

export interface ResolvedIdentity {
  providerId: AuthProviderId
  /** Stable per-provider user ID: sub claim for OAuth; sha256(email) for magic-link */
  providerSubject: string
  /** Normalised lowercase email */
  email: string
  /** Whether the provider asserts the email is verified */
  emailVerified: boolean
  /** Display name — Google always provides; Apple only on first sign-in */
  displayName?: string
  /** Raw claims for debugging — never persisted */
  rawClaims?: Record<string, unknown>
}

export interface MagicLinkCallbackInput {
  type: 'magic-link'
  token: string
}

export interface OAuthCallbackInput {
  type: 'oauth'
  /** Authorization code from the provider */
  code: string
  /** PKCE verifier from the state cookie */
  codeVerifier: string
  /** Nonce from the state cookie */
  nonce: string
  /** Redirect URI used in the authorize request */
  redirectUri: string
  /** Apple only: first-signin user JSON from form_post body */
  appleUser?: { name?: { firstName?: string; lastName?: string }; email?: string }
}

export type ProviderCallbackInput = MagicLinkCallbackInput | OAuthCallbackInput

export interface AuthProvider {
  readonly id: AuthProviderId

  /**
   * Build the OAuth authorization URL.
   * Magic-link provider returns null (uses its own issuance flow).
   */
  buildAuthorizeUrl?(opts: {
    redirectUri: string
    state: string
    codeVerifier?: string
    nonce?: string
  }): string

  /**
   * Exchange a callback payload for a verified identity.
   * Throws an AuthProviderError on any validation failure.
   */
  resolveIdentity(input: ProviderCallbackInput): Promise<ResolvedIdentity>
}

export class AuthProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'token_not_found'
      | 'token_expired'
      | 'token_consumed'
      | 'invalid_state'
      | 'invalid_token'
      | 'provider_error'
  ) {
    super(message)
    this.name = 'AuthProviderError'
  }
}
