/**
 * PUT /api/me/programmes/:programmeId
 * DELETE /api/me/programmes/:programmeId
 *
 * Toggle a programme's enrolment state for the authenticated user.
 *
 * PUT body: { enabled: boolean, paused?: boolean, paused_until?: string | null }
 * DELETE: semantically equivalent to PUT { enabled: false }
 *
 * Returns 404 for unknown programme IDs (validated against registry).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { getRegistry } from '@/lib/discount/registry'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

const PutBodySchema = z.object({
  enabled: z.boolean(),
  paused: z.boolean().optional().default(false),
  paused_until: z.string().nullable().optional().default(null),
})

interface RouteContext {
  params: Promise<{ programmeId: string }>
}

export async function PUT(req: Request, context: RouteContext): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { programmeId } = await context.params

  // Validate programme exists in registry
  const registry = getRegistry()
  const programme = registry.find(p => p.id === programmeId)
  if (!programme) {
    return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = PutBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { enabled, paused, paused_until } = parsed.data

  try {
    if (!enabled) {
      // Delete the row — unenrolled users don't need a row
      await db.execute(sql`
        DELETE FROM user_programmes
        WHERE user_id = ${session.userId}
          AND programme_id = ${programmeId}
      `)
    } else {
      // Upsert enrolment
      await db.execute(sql`
        INSERT INTO user_programmes (user_id, programme_id, enabled_at, paused, paused_until)
        VALUES (
          ${session.userId},
          ${programmeId},
          now(),
          ${paused},
          ${paused_until}::timestamptz
        )
        ON CONFLICT (user_id, programme_id) DO UPDATE
          SET paused = EXCLUDED.paused,
              paused_until = EXCLUDED.paused_until
      `)
    }

    return NextResponse.json({
      id: programme.id,
      enrolled: enabled,
      paused: enabled ? paused : false,
      paused_until: enabled ? paused_until : null,
    })
  } catch (err) {
    console.error(`[/api/me/programmes/${programmeId}] Error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, context: RouteContext): Promise<NextResponse> {
  // Delegate to PUT with enabled: false
  const { programmeId } = await context.params
  const fakeBody = JSON.stringify({ enabled: false })
  const fakeReq = new Request(req.url, {
    method: 'PUT',
    headers: req.headers,
    body: fakeBody,
  })
  return PUT(fakeReq, { params: Promise.resolve({ programmeId }) })
}
