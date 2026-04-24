import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'fillip-session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required')
  }
  return new TextEncoder().encode(secret)
}

/**
 * Create a signed JWT session for the given userId.
 * Returns a Set-Cookie header string ready to be sent in a response.
 */
export async function createSession(userId: string): Promise<string> {
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)

  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(secret)

  const cookieParts = [
    `${COOKIE_NAME}=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]

  // Only set Secure in non-local environments
  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure')
  }

  return cookieParts.join('; ')
}

/**
 * Verify a session cookie from an incoming request.
 * Returns { userId } if valid, null otherwise.
 */
export async function getSession(
  req: Request | NextRequest
): Promise<{ userId: string } | null> {
  try {
    // Parse cookie header
    const cookieHeader = req.headers.get('cookie') ?? ''
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
    if (!match) return null

    const token = match[1]
    const secret = getSecret()

    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    })

    const userId = payload.userId
    if (typeof userId !== 'string') return null

    return { userId }
  } catch {
    return null
  }
}

/**
 * Returns a Set-Cookie header that immediately expires the session cookie.
 */
export function clearSession(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
