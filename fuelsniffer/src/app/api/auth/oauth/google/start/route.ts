import { NextResponse } from 'next/server'
import { GoogleProvider } from '@/lib/auth/providers/google'
import { generateState, generateCodeVerifier, generateNonce } from '@/lib/auth/pkce'
import { buildOAuthStateCookies } from '@/lib/auth/oauth-state'

function getPublicUrl(): string {
  return process.env.APP_PUBLIC_URL ?? 'http://localhost:4000'
}

export async function GET(_req: Request): Promise<NextResponse> {
  try {
    const provider = new GoogleProvider()
    const state = generateState()
    const codeVerifier = generateCodeVerifier()
    const nonce = generateNonce()
    const publicUrl = getPublicUrl()
    const redirectUri = `${publicUrl}/api/auth/oauth/google/callback`

    const authorizeUrl = provider.buildAuthorizeUrl({
      redirectUri,
      state,
      codeVerifier,
      nonce,
    })

    const cookies = buildOAuthStateCookies(state, codeVerifier, nonce)

    const response = NextResponse.redirect(authorizeUrl, { status: 302 })
    response.headers.append('Set-Cookie', cookies.stateCookie)
    response.headers.append('Set-Cookie', cookies.pkceCookie)
    response.headers.append('Set-Cookie', cookies.nonceCookie)

    return response
  } catch (err) {
    console.error('[oauth/google/start] Error:', err)
    return NextResponse.redirect(
      new URL('/login?error=oauth_failed', getPublicUrl()),
      { status: 302 }
    )
  }
}
