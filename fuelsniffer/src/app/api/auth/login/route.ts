import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { inviteCodes } from '@/lib/db/schema'
import { createSession } from '@/lib/session'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { z } from 'zod'

const LoginSchema = z.object({
  code: z.string().min(1),
})

const INVALID_CODE_MSG = "That code isn't valid. Check with the person who shared it."

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: INVALID_CODE_MSG }, { status: 401 })
  }

  const [match] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, parsed.data.code))

  if (!match || !match.isActive) {
    return NextResponse.json({ error: INVALID_CODE_MSG }, { status: 401 })
  }

  // Update lastUsedAt
  await db
    .update(inviteCodes)
    .set({ lastUsedAt: new Date() })
    .where(eq(inviteCodes.id, match.id))

  // Create session — userId is a random UUID (invite code ID is not a user ID)
  const userId = randomUUID()
  await createSession(userId)

  return NextResponse.json({ ok: true }, { status: 200 })
}
