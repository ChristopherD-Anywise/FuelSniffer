import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

// SESSION_SECRET env var must be a high-entropy string (32+ chars recommended).
// Throw at module load if missing so misconfiguration is caught early.
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is not set')
}
const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET)

export async function encrypt(payload: { userId: string; expiresAt: Date }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = ''): Promise<{ userId: string; expiresAt: Date } | null> {
  try {
    const { payload } = await jwtVerify(session, encodedKey, { algorithms: ['HS256'] })
    return payload as { userId: string; expiresAt: Date }
  } catch {
    return null
  }
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const token = await encrypt({ userId, expiresAt })
  const cookieStore = await cookies()  // ASYNC in Next.js 16
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === 'true',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()  // ASYNC in Next.js 16
  cookieStore.delete('session')
}
