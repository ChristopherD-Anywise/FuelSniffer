import { NextResponse } from 'next/server'
import { redeemToken, hashToken } from '@/lib/auth/tokens'
import { findOrCreateUser } from '@/lib/auth/linking'
import { assertAllowed, CohortGateError } from '@/lib/auth/cohort'
import { createSession } from '@/lib/session'
import { validateNextRedirect } from '@/lib/auth/redirect'

function getPublicUrl(): string {
  return process.env.APP_PUBLIC_URL ?? 'http://localhost:4000'
}

function redirectTo(path: string, status = 302): NextResponse {
  const publicUrl = getPublicUrl()
  const res = NextResponse.redirect(new URL(path, publicUrl), { status })
  // Rewrite Location to just the path so tests can assert simply
  res.headers.set('Location', path)
  return res
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const rawToken = url.searchParams.get('token')
  const nextParam = url.searchParams.get('next')
  const inviteCode = url.searchParams.get('invite') ?? undefined

  if (!rawToken) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // Redeem token
  const redemption = await redeemToken(rawToken)
  if (!redemption.ok) {
    return redirectTo('/login?error=invalid_link')
  }

  const email = redemption.email.toLowerCase().trim()

  // Find or create user
  let findResult: { userId: string; isNew: boolean }
  try {
    findResult = await findOrCreateUser({
      providerId: 'magic-link',
      providerSubject: hashToken(email),
      email,
      emailVerified: true,
    })
  } catch (err) {
    console.error('[magic-link callback] findOrCreateUser failed:', err)
    return redirectTo('/login?error=server_error')
  }

  // Cohort gate check
  try {
    await assertAllowed({
      userId: findResult.userId,
      isNew: findResult.isNew,
      inviteCode,
    })
  } catch (err) {
    if (err instanceof CohortGateError) {
      return redirectTo('/login?error=invite_required')
    }
    return redirectTo('/login?error=server_error')
  }

  // Issue session
  const sessionCookie = await createSession(findResult.userId)
  const redirectTarget = validateNextRedirect(nextParam)

  const response = redirectTo(redirectTarget)
  response.headers.set('Set-Cookie', sessionCookie)

  return response
}
