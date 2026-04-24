import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export class CohortGateError extends Error {
  constructor(message = 'Invite code required for signup') {
    super(message)
    this.name = 'CohortGateError'
  }
}

export interface AssertAllowedOpts {
  userId: string
  isNew: boolean
  inviteCode?: string
}

/**
 * Enforce the cohort gating policy.
 * If gate is on and user is new, a valid invite code is required.
 */
export async function assertAllowed(opts: AssertAllowedOpts): Promise<void> {
  const { userId, isNew, inviteCode } = opts

  const rows = await db.execute(sql`
    SELECT key, value FROM app_settings WHERE key = 'require_invite_for_signup'
  `) as unknown as Array<{ key: string; value: boolean }>

  let gateEnabled = false
  if (rows.length > 0) {
    const val = rows[0].value
    gateEnabled = typeof val === 'boolean' ? val : Boolean(val)
  }

  if (!gateEnabled) return
  if (!isNew) return

  if (!inviteCode) {
    throw new CohortGateError()
  }

  await db.transaction(async (tx) => {
    const codes = await tx.execute(sql`
      SELECT id, code, is_active FROM invite_codes
      WHERE code = ${inviteCode} AND is_active = true
    `) as unknown as Array<{ id: number; code: string; is_active: boolean }>

    if (codes.length === 0) {
      throw new CohortGateError('Invalid or already-used invite code')
    }

    const codeId = codes[0].id

    await tx.execute(sql`
      UPDATE invite_codes SET last_used_at = NOW() WHERE id = ${codeId}
    `)

    await tx.execute(sql`
      UPDATE users SET legacy_invite_code = ${inviteCode} WHERE id = ${userId}
    `)
  })
}
