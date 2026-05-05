import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

const TTL_MINUTES = parseInt(process.env.MAGIC_LINK_TTL_MINUTES ?? '15', 10)

/**
 * Generate a cryptographically random token.
 * Returns 32 bytes as base64url (~43 chars, URL-safe, no padding).
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Compute the SHA-256 hash of a token.
 * This is what gets stored in the database — the raw token is never persisted.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Store a new magic-link token in the database.
 * Returns the raw (unhashed) token to be embedded in the email URL.
 */
export async function storeToken(opts: {
  email: string
  ip?: string
  ua?: string
  purpose?: string
}): Promise<string> {
  const rawToken = generateToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000)
  const email = opts.email.toLowerCase().trim()
  const purpose = opts.purpose ?? 'login'
  const ip = opts.ip ?? null
  const ua = opts.ua ?? null

  await db.execute(sql`
    INSERT INTO magic_link_tokens (email, token_hash, purpose, expires_at, ip_at_request, ua_at_request)
    VALUES (${email}, ${tokenHash}, ${purpose}, ${expiresAt.toISOString()}, ${ip}::inet, ${ua})
  `)

  return rawToken
}

export type TokenRedemptionResult =
  | { ok: true; email: string }
  | { ok: false; error: 'not_found' | 'expired' | 'consumed' }

/**
 * Redeem a magic-link token atomically.
 * Hashes the incoming token, looks it up, validates, and marks consumed in one transaction.
 */
export async function redeemToken(rawToken: string): Promise<TokenRedemptionResult> {
  const tokenHash = hashToken(rawToken)

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id, email, expires_at, consumed_at
        FROM magic_link_tokens
        WHERE token_hash = ${tokenHash}
        FOR UPDATE
      `) as unknown as Array<{
        id: string
        email: string
        expires_at: string
        consumed_at: string | null
      }>

      if (rows.length === 0) {
        return { ok: false as const, error: 'not_found' as const }
      }

      const row = rows[0]

      if (new Date(row.expires_at) < new Date()) {
        return { ok: false as const, error: 'expired' as const }
      }

      if (row.consumed_at !== null) {
        return { ok: false as const, error: 'consumed' as const }
      }

      await tx.execute(sql`
        UPDATE magic_link_tokens SET consumed_at = NOW() WHERE id = ${row.id}
      `)

      return { ok: true as const, email: row.email as string }
    })

    return result as TokenRedemptionResult
  } catch {
    return { ok: false, error: 'not_found' }
  }
}

/**
 * Check rate limiting for magic-link requests.
 * Uses magic_link_request_log table with 1-hour buckets.
 * Returns true if the request is allowed, false if rate-limited.
 */
export async function checkMagicLinkRateLimit(opts: {
  emailHash: string
  ipHash?: string
  maxPerEmail?: number
  maxPerIp?: number
}): Promise<boolean> {
  const maxPerEmail = opts.maxPerEmail ?? 5
  const maxPerIp = opts.maxPerIp ?? 20
  const bucketWindow = new Date(Math.floor(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000))
  const { emailHash, ipHash } = opts

  await db.execute(sql`
    INSERT INTO magic_link_request_log (email_or_ip_hash, bucket_window, count)
    VALUES (${emailHash}, ${bucketWindow.toISOString()}, 1)
    ON CONFLICT (email_or_ip_hash, bucket_window)
    DO UPDATE SET count = magic_link_request_log.count + 1
  `)

  const emailRows = await db.execute(sql`
    SELECT count FROM magic_link_request_log
    WHERE email_or_ip_hash = ${emailHash} AND bucket_window = ${bucketWindow.toISOString()}
  `) as unknown as Array<{ count: number }>

  if ((emailRows[0]?.count ?? 0) > maxPerEmail) {
    return false
  }

  if (ipHash) {
    await db.execute(sql`
      INSERT INTO magic_link_request_log (email_or_ip_hash, bucket_window, count)
      VALUES (${ipHash}, ${bucketWindow.toISOString()}, 1)
      ON CONFLICT (email_or_ip_hash, bucket_window)
      DO UPDATE SET count = magic_link_request_log.count + 1
    `)

    const ipRows = await db.execute(sql`
      SELECT count FROM magic_link_request_log
      WHERE email_or_ip_hash = ${ipHash} AND bucket_window = ${bucketWindow.toISOString()}
    `) as unknown as Array<{ count: number }>

    if ((ipRows[0]?.count ?? 0) > maxPerIp) {
      return false
    }
  }

  return true
}
