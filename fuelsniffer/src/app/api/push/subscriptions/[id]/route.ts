/**
 * SP-5 Alerts — DELETE /api/push/subscriptions/:id (revoke)
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { webPushSubscriptions } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const subId = parseInt(id, 10)
  if (isNaN(subId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [row] = await db
    .update(webPushSubscriptions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(webPushSubscriptions.id, subId),
        eq(webPushSubscriptions.userId, session.userId)
      )
    )
    .returning({ id: webPushSubscriptions.id })

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ revoked: true })
}
