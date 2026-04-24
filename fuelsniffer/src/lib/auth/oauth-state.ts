/**
 * OAuth state/PKCE/nonce cookie management.
 * Shared between Google and Apple OAuth start/callback routes.
 */

const STATE_COOKIE = '__Host-fillip_oauth_state'
const PKCE_COOKIE = '__Host-fillip_oauth_pkce'
const NONCE_COOKIE = '__Host-fillip_oauth_nonce'
const COOKIE_TTL_SECONDS = 10 * 60 // 10 minutes

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function cookieFlags(ttl = COOKIE_TTL_SECONDS): string {
  const parts = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ttl}`,
  ]
  // __Host- prefix requires Secure; add in production
  if (isProduction()) parts.push('Secure')
  return parts.join('; ')
}

export interface OAuthStateCookies {
  stateCookie: string
  pkceCookie: string
  nonceCookie: string
}

export function buildOAuthStateCookies(
  state: string,
  codeVerifier: string,
  nonce: string
): OAuthStateCookies {
  const flags = cookieFlags()
  return {
    stateCookie: `${STATE_COOKIE}=${state}; ${flags}`,
    pkceCookie: `${PKCE_COOKIE}=${codeVerifier}; ${flags}`,
    nonceCookie: `${NONCE_COOKIE}=${nonce}; ${flags}`,
  }
}

export function clearOAuthStateCookies(): OAuthStateCookies {
  const flags = cookieFlags(0)
  return {
    stateCookie: `${STATE_COOKIE}=; ${flags}`,
    pkceCookie: `${PKCE_COOKIE}=; ${flags}`,
    nonceCookie: `${NONCE_COOKIE}=; ${flags}`,
  }
}

export interface ParsedOAuthState {
  state: string | null
  codeVerifier: string | null
  nonce: string | null
}

export function parseOAuthStateCookies(cookieHeader: string): ParsedOAuthState {
  function getCookie(name: string): string | null {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escapeRegex(name)}=([^;]+)`))
    return match ? match[1] : null
  }

  return {
    state: getCookie(STATE_COOKIE),
    codeVerifier: getCookie(PKCE_COOKIE),
    nonce: getCookie(NONCE_COOKIE),
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
