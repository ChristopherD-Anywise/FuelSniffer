/**
 * SP-5 Alerts — signed JWT helpers for one-click unsubscribe / pause links.
 *
 * Tokens are signed with SESSION_SECRET, expire in 30 days,
 * and carry aud='alert-mgmt'.
 */
import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const AUDIENCE = 'alert-mgmt'

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET environment variable is required')
  return new TextEncoder().encode(secret)
}

/**
 * Create a signed token for an alert management action.
 */
export async function createAlertToken(
  alertId: number,
  action: 'unsubscribe' | 'pause'
): Promise<string> {
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ alertId, action })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(secret)
}

/**
 * Verify an alert management token.
 * Returns the payload if valid, null otherwise.
 */
export async function verifyAlertToken(
  token: string
): Promise<{ alertId: number; action: string } | null> {
  try {
    const secret = getSecret()
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      audience: AUDIENCE,
    })

    const alertId = payload.alertId
    const action = payload.action
    if (typeof alertId !== 'number' || typeof action !== 'string') return null

    return { alertId, action }
  } catch {
    return null
  }
}
