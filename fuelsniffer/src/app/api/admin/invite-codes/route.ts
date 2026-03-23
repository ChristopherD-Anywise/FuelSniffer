import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { inviteCodes } from '@/lib/db/schema'
import { decrypt } from '@/lib/session'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { z } from 'zod'

// Auth check helper — returns null if session is invalid
async function requireSession(req: NextRequest) {
  const cookie = req.cookies.get('session')?.value
  return decrypt(cookie)
}

/**
 * GET /api/admin/invite-codes
 * Returns all invite codes (for owner to see who has access).
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const codes = await db.select().from(inviteCodes).orderBy(inviteCodes.createdAt)
  return NextResponse.json(codes, { status: 200 })
}

const CreateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
})

/**
 * POST /api/admin/invite-codes
 * Body: { label?: string }
 * Creates a new invite code and returns it.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const code = randomBytes(4).toString('hex')  // 8-char hex e.g. "a3f82b9c"

  const [created] = await db
    .insert(inviteCodes)
    .values({ code, label: parsed.data.label ?? null })
    .returning()

  return NextResponse.json(created, { status: 201 })
}

const DeleteSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
})

/**
 * DELETE /api/admin/invite-codes?id=N
 * Soft-deletes (sets is_active=false) the specified code.
 * Per D-13: revocation must be per-code and non-destructive.
 */
export async function DELETE(req: NextRequest) {
  const session = await requireSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = DeleteSchema.safeParse({ id: req.nextUrl.searchParams.get('id') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'id query param is required and must be a positive integer' }, { status: 400 })
  }

  await db
    .update(inviteCodes)
    .set({ isActive: false })
    .where(eq(inviteCodes.id, parsed.data.id))

  return NextResponse.json({ ok: true }, { status: 200 })
}
