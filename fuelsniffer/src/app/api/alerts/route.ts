/**
 * SP-5 Alerts — GET /api/alerts (list), POST /api/alerts (create)
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { alerts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { validateCriteria } from '@/lib/alerts/criteria'
import type { AlertType } from '@/lib/alerts/types'

const VALID_ALERT_TYPES: AlertType[] = [
  'price_threshold', 'cycle_low', 'favourite_drop', 'weekly_digest',
]

const VALID_CHANNELS = new Set(['email', 'push'])

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.userId, session.userId))

  return NextResponse.json({ alerts: rows })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, criteria, channels, label } = body as {
    type?: unknown
    criteria?: unknown
    channels?: unknown
    label?: unknown
  }

  if (!type || !VALID_ALERT_TYPES.includes(type as AlertType)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_ALERT_TYPES.join(', ')}` }, { status: 400 })
  }

  const criteriaResult = validateCriteria(type as AlertType, criteria)
  if (!criteriaResult.success) {
    return NextResponse.json({ error: criteriaResult.error }, { status: 400 })
  }

  // Validate channels
  const channelList = Array.isArray(channels) ? channels : ['email', 'push']
  const invalidChannels = channelList.filter((c: unknown) => !VALID_CHANNELS.has(c as string))
  if (invalidChannels.length > 0) {
    return NextResponse.json({ error: `Invalid channels: ${invalidChannels.join(', ')}` }, { status: 400 })
  }
  if (channelList.length === 0) {
    return NextResponse.json({ error: 'At least one channel is required' }, { status: 400 })
  }

  const [row] = await db.insert(alerts).values({
    userId: session.userId,
    type: type as AlertType,
    criteriaJson: criteriaResult.data,
    channels: channelList,
    paused: false,
    label: typeof label === 'string' ? label : null,
  }).returning()

  return NextResponse.json({ alert: row }, { status: 201 })
}
