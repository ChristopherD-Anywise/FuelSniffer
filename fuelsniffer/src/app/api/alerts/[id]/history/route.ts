/**
 * SP-5 Alerts — GET /api/alerts/:id/history
 * Returns last 50 deliveries for an alert.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { alerts, alertDeliveries } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const alertId = parseInt(id, 10)
  if (isNaN(alertId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Verify ownership
  const [alert] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, session.userId)))

  if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const deliveries = await db
    .select()
    .from(alertDeliveries)
    .where(eq(alertDeliveries.alertId, alertId))
    .orderBy(desc(alertDeliveries.firedAt))
    .limit(50)

  return NextResponse.json({ deliveries })
}
