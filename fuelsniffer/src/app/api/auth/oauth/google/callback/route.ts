import { NextResponse } from 'next/server'
import { GoogleProvider } from '@/lib/auth/providers/google'
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

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const nextParam = url.searchParams.get('next')

  // Always clear state cookies on callback (even on error)
  const clearedCookies = clearOAuthStateCookies()

  function errorRedirect(error: string): NextResponse {
    const res = redirectTo(`/login?error=${error}`)
    appendClearedCookies(res, clearedCookies)
    return res
  }

  if (!code || !returnedState) {
    return errorRedirect('oauth_failed')
  }

  // Validate state
  const cookieHeader = req.headers.get('cookie') ?? ''
  const { state, codeVerifier, nonce } = parseOAuthStateCookies(cookieHeader)

  if (!state || state !== returnedState) {
    return errorRedirect('oauth_failed')
  }

  if (!codeVerifier || !nonce) {
    return errorRedirect('oauth_failed')
  }

  // Resolve identity
  const provider = new GoogleProvider()
  const publicUrl = getPublicUrl()

  let userId: string
  let isNew: boolean
  let displayName: string | undefined

  try {
    const identity = await provider.resolveIdentity({
      type: 'oauth',
      code,
      codeVerifier,
      nonce,
      redirectUri: `${publicUrl}/api/auth/oauth/google/callback`,
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
    console.error('[oauth/google/callback] Error:', err)
    return errorRedirect('oauth_failed')
  }

  // Update display_name if not set yet
  if (displayName) {
    try {
      await db.execute(sql`
        UPDATE users SET display_name = ${displayName} WHERE id = ${userId} AND display_name IS NULL
      `)
    } catch {
      // Non-fatal — display name update failure doesn't block login
    }
  }

  const sessionCookie = await createSession(userId)
  const redirectTarget = validateNextRedirect(nextParam)

  const res = redirectTo(redirectTarget)
  res.headers.set('Set-Cookie', sessionCookie)
  appendClearedCookies(res, clearedCookies)

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
