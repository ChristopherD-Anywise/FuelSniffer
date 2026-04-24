import { randomBytes, createHash } from 'node:crypto'

/**
 * PKCE (Proof Key for Code Exchange) helpers.
 * Shared between Google and Apple OAuth providers.
 */

/** Generate a random state value for OAuth CSRF protection */
export function generateState(): string {
  return randomBytes(32).toString('base64url')
}

/** Generate a random PKCE code verifier */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/** Derive the PKCE code challenge from a verifier (S256 method) */
export function deriveCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/** Generate a random nonce for ID token validation */
export function generateNonce(): string {
  return randomBytes(16).toString('base64url')
}
