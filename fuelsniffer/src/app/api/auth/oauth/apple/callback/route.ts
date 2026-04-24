import { NextResponse } from 'next/server'
import { AppleProvider } from '@/lib/auth/providers/apple'
import { parseOAuthStateCookies, clearOAuthStateCookies } from '@/lib/auth/oauth-state'
import { findOrCreateUser } from '@/lib/auth/linking'
import { assertAllowed, CohortGateError } from '@/lib/auth/cohort'
import { createSession } from '@/lib/session'
import { validateNextRedirect } from '@/lib/auth/redirect'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

function getPublicUrl(): string {
  return process.env.APP_PUBLIC_URL ?? 'http://localhost:4000'
}

function redirectTo(path: string, status = 302): NextResponse {
  const publicUrl = getPublicUrl()
  const res = NextResponse.redirect(new URL(path, publicUrl), { status })
  res.headers.set('Location', path)
  return res
}

function appendClearedCookies(
  res: NextResponse,
  cookies: { stateCookie: string; pkceCookie: string; nonceCookie: string }
): void {
  res.headers.append('Set-Cookie', cookies.stateCookie)
  res.headers.append('Set-Cookie', cookies.pkceCookie)
  res.headers.append('Set-Cookie', cookies.nonceCookie)
}

async function handleCallback(req: Request, body: URLSearchParams): Promise<NextResponse> {
  const code = body.get('code')
  const returnedState = body.get('state')
  // Apple sends user JSON only on first sign-in (form_post body)
  const userJson = body.get('user')

  const clearedCookies = clearOAuthStateCookies()

  function errorRedirect(error: string): NextResponse {
    const res = redirectTo(`/login?error=${error}`)
    appendClearedCookies(res, clearedCookies)
    return res
  }

  if (!code || !returnedState) {
    return errorRedirect('oauth_failed')
  }

  const cookieHeader = req.headers.get('cookie') ?? ''
  const { state, codeVerifier, nonce } = parseOAuthStateCookies(cookieHeader)

  if (!state || state !== returnedState || !codeVerifier || !nonce) {
    return errorRedirect('oauth_failed')
  }

  // Parse Apple's user JSON (first sign-in only)
  let appleUser: { name?: { firstName?: string; lastName?: string }; email?: string } | undefined
  if (userJson) {
    try {
      appleUser = JSON.parse(userJson)
    } catch {
      // Ignore malformed user JSON — name will just be undefined
    }
  }

  const provider = new AppleProvider()
  const publicUrl = getPublicUrl()
  const nextParam = new URL(req.url).searchParams.get('next')

  let userId: string
  let isNew: boolean
  let displayName: string | undefined

  try {
    const identity = await provider.resolveIdentity({
      type: 'oauth',
      code,
      codeVerifier,
      nonce,
      redirectUri: `${publicUrl}/api/auth/oauth/apple/callback`,
      appleUser,
    })

    displayName = identity.displayName

    const result = await findOrCreateUser(identity)
    userId = result.userId
    isNew = result.isNew

    await assertAllowed({ userId, isNew })
  } catch (err) {
    if (err instanceof CohortGateError) {
      return errorRedirect('invite_required')
    }
    console.error('[oauth/apple/callback] Error:', err)
    return errorRedirect('oauth_failed')
  }

  // Persist Apple first-signin display name if not yet set
  if (displayName) {
    try {
      await db.execute(sql`
        UPDATE users SET display_name = ${displayName} WHERE id = ${userId} AND display_name IS NULL
      `)
    } catch {
      // Non-fatal
    }
  }

  const sessionCookie = await createSession(userId)
  const redirectTarget = validateNextRedirect(nextParam)

  const res = redirectTo(redirectTarget)
  res.headers.set('Set-Cookie', sessionCookie)
  appendClearedCookies(res, clearedCookies)

  return res
}

/**
 * Apple uses form_post — the callback arrives as a POST with application/x-www-form-urlencoded.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: URLSearchParams
  try {
    const text = await req.text()
    body = new URLSearchParams(text)
  } catch {
    return redirectTo('/login?error=oauth_failed')
  }
  return handleCallback(req, body)
}

/**
 * Also accept GET for Apple in development/testing environments.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const params = new URLSearchParams(url.search)
  return handleCallback(req, params)
}
