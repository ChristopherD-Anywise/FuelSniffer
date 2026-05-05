import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { ResolvedIdentity } from '@/lib/auth/providers/types'

export interface FindOrCreateUserResult {
  userId: string
  isNew: boolean
}

/**
 * Find or create a user record based on the resolved identity from an auth provider.
 * Implements the §7 account-linking matrix from the SP-2 design spec.
 */
export async function findOrCreateUser(
  identity: ResolvedIdentity
): Promise<FindOrCreateUserResult> {
  return db.transaction(async (tx) => {
    if (identity.providerId === 'magic-link') {
      return handleMagicLink(tx, identity)
    }
    return handleOAuth(tx, identity)
  }) as Promise<FindOrCreateUserResult>
}

type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function handleMagicLink(
  tx: DrizzleTx,
  identity: ResolvedIdentity
): Promise<FindOrCreateUserResult> {
  const email = identity.email.toLowerCase().trim()

  const existing = await tx.execute(sql`
    SELECT id FROM users WHERE email = ${email}
  `) as unknown as Array<{ id: string }>

  if (existing.length > 0) {
    const userId = existing[0].id
    await tx.execute(sql`
      UPDATE users SET last_login_at = NOW(), email_verified = true WHERE id = ${userId}
    `)
    return { userId, isNew: false }
  }

  const displayName = identity.displayName ?? null
  const newUser = await tx.execute(sql`
    INSERT INTO users (email, email_verified, display_name)
    VALUES (${email}, true, ${displayName})
    RETURNING id
  `) as unknown as Array<{ id: string }>

  await tx.execute(sql`
    UPDATE users SET last_login_at = NOW() WHERE id = ${newUser[0].id}
  `)

  return { userId: newUser[0].id, isNew: true }
}

async function handleOAuth(
  tx: DrizzleTx,
  identity: ResolvedIdentity
): Promise<FindOrCreateUserResult> {
  const email = identity.email.toLowerCase().trim()

  // 1. Check oauth_identities
  const identityRow = await tx.execute(sql`
    SELECT user_id FROM oauth_identities
    WHERE provider = ${identity.providerId} AND provider_subject = ${identity.providerSubject}
  `) as unknown as Array<{ user_id: string }>

  if (identityRow.length > 0) {
    const userId = identityRow[0].user_id
    await tx.execute(sql`
      UPDATE users SET last_login_at = NOW() WHERE id = ${userId}
    `)
    return { userId, isNew: false }
  }

  // 2. Email-match auto-link (only if emailVerified=true)
  if (identity.emailVerified) {
    const emailMatch = await tx.execute(sql`
      SELECT id FROM users WHERE email = ${email}
    `) as unknown as Array<{ id: string }>

    if (emailMatch.length > 0) {
      const userId = emailMatch[0].id
      await tx.execute(sql`
        INSERT INTO oauth_identities (user_id, provider, provider_subject, email_at_link)
        VALUES (${userId}, ${identity.providerId}, ${identity.providerSubject}, ${email})
        ON CONFLICT (provider, provider_subject) DO NOTHING
      `)
      await tx.execute(sql`
        UPDATE users SET last_login_at = NOW() WHERE id = ${userId}
      `)
      return { userId, isNew: false }
    }
  }

  // 3. Create new user + identity
  const displayName = identity.displayName ?? null
  const newUser = await tx.execute(sql`
    INSERT INTO users (email, email_verified, display_name)
    VALUES (${email}, ${identity.emailVerified}, ${displayName})
    RETURNING id
  `) as unknown as Array<{ id: string }>

  const userId = newUser[0].id

  await tx.execute(sql`
    INSERT INTO oauth_identities (user_id, provider, provider_subject, email_at_link)
    VALUES (${userId}, ${identity.providerId}, ${identity.providerSubject}, ${email})
  `)

  await tx.execute(sql`
    UPDATE users SET last_login_at = NOW() WHERE id = ${userId}
  `)

  return { userId, isNew: true }
}
