/**
 * SP-5 Alerts — Push subscription management
 * GET /api/push/subscriptions (list active)
 * POST /api/push/subscriptions (register new)
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { webPushSubscriptions } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const subs = await db
    .select()
    .from(webPushSubscriptions)
    .where(
      and(
        eq(webPushSubscriptions.userId, session.userId),
        isNull(webPushSubscriptions.revokedAt)
      )
    )

  return NextResponse.json({ subscriptions: subs })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { endpoint, keys, ua } = body as {
    endpoint?: unknown
    keys?: { p256dh?: unknown; auth?: unknown }
    ua?: unknown
  }

  if (typeof endpoint !== 'string' || !endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
  }
  if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return NextResponse.json({ error: 'keys.p256dh and keys.auth are required' }, { status: 400 })
  }

  // Upsert: if endpoint already exists for this user, update keys + clear revoked_at
  const [row] = await db
    .insert(webPushSubscriptions)
    .values({
      userId: session.userId,
      endpoint,
      keysP256dh: keys.p256dh,
      keysAuth: keys.auth,
      ua: typeof ua === 'string' ? ua : null,
    })
    .onConflictDoUpdate({
      target: webPushSubscriptions.endpoint,
      set: {
        keysP256dh: keys.p256dh,
        keysAuth: keys.auth,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
    })
    .returning()

  return NextResponse.json({ subscription: row }, { status: 201 })
}
