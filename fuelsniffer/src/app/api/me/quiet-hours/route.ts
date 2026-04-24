/**
 * SP-5 Alerts — PATCH /api/me/quiet-hours
 * Update user timezone and quiet hours window.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

const TIME_RE = /^\d{2}:\d{2}$/

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { timezone, quiet_hours_start, quiet_hours_end } = body as Record<string, unknown>
  const updates: string[] = []

  if (timezone !== undefined) {
    if (typeof timezone !== 'string') {
      return NextResponse.json({ error: 'timezone must be a string' }, { status: 400 })
    }
    // Validate timezone by trying to format with it
    try {
      new Intl.DateTimeFormat('en-AU', { timeZone: timezone })
    } catch {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
    }
    updates.push(`timezone = '${timezone.replace(/'/g, "''")}'`)
  }

  if (quiet_hours_start !== undefined) {
    if (typeof quiet_hours_start !== 'string' || !TIME_RE.test(quiet_hours_start)) {
      return NextResponse.json({ error: 'quiet_hours_start must be HH:MM' }, { status: 400 })
    }
    updates.push(`quiet_hours_start = '${quiet_hours_start}'`)
  }

  if (quiet_hours_end !== undefined) {
    if (typeof quiet_hours_end !== 'string' || !TIME_RE.test(quiet_hours_end)) {
      return NextResponse.json({ error: 'quiet_hours_end must be HH:MM' }, { status: 400 })
    }
    updates.push(`quiet_hours_end = '${quiet_hours_end}'`)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  await db.execute(sql.raw(`
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = '${session.userId}'
  `))

  return NextResponse.json({ updated: true })
}
