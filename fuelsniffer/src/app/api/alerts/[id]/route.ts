/**
 * SP-5 Alerts — PATCH /api/alerts/:id, DELETE /api/alerts/:id
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { alerts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { validateCriteria } from '@/lib/alerts/criteria'
import type { AlertType } from '@/lib/alerts/types'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const alertId = parseInt(id, 10)
  if (isNaN(alertId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  const { paused, channels, criteria, label, type } = body as Record<string, unknown>

  if (typeof paused === 'boolean') update.paused = paused
  if (typeof label === 'string') update.label = label
  if (typeof label === 'object' && label === null) update.label = null

  if (Array.isArray(channels)) {
    if (channels.length === 0) {
      return NextResponse.json({ error: 'At least one channel is required' }, { status: 400 })
    }
    update.channels = channels
  }

  if (criteria !== undefined && type !== undefined) {
    const criteriaResult = validateCriteria(type as AlertType, criteria)
    if (!criteriaResult.success) {
      return NextResponse.json({ error: criteriaResult.error }, { status: 400 })
    }
    update.criteriaJson = criteriaResult.data
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [row] = await db
    .update(alerts)
    .set(update)
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, session.userId)))
    .returning()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ alert: row })
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const alertId = parseInt(id, 10)
  if (isNaN(alertId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [deleted] = await db
    .delete(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, session.userId)))
    .returning({ id: alerts.id })

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ deleted: true })
}
