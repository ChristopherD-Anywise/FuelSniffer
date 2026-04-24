/**
 * SP-5 Alerts — POST /api/alerts/:id/test
 * Send a one-off test delivery. Rate-limited to 1 per hour per user.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db/client'
import { alerts } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import type { Alert } from '@/lib/alerts/types'

type Params = { params: Promise<{ id: string }> }

// In-memory rate limit: 1 test/hr per user (dev/QA only)
const testRateLimit = new Map<string, number>()

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Rate limit: 1/hr per user
  const now = Date.now()
  const lastTest = testRateLimit.get(session.userId) ?? 0
  if (now - lastTest < 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Rate limited: 1 test delivery per hour' }, { status: 429 })
  }

  const { id } = await params
  const alertId = parseInt(id, 10)
  if (isNaN(alertId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [alert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, session.userId)))

  if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  testRateLimit.set(session.userId, now)

  // Fire test delivery (no dedup, no quiet hours for test)
  try {
    const { dispatchAlert } = await import('@/lib/alerts/dispatcher/index')
    const { ResendAlertEmailSender } = await import('@/lib/alerts/dispatcher/email/resend')
    const { VapidWebPushProvider } = await import('@/lib/alerts/dispatcher/push/index')

    // Fetch user
    const userRows = await db.execute(sql`
      SELECT id, email, display_name, timezone, quiet_hours_start, quiet_hours_end
      FROM users WHERE id = ${session.userId}::uuid LIMIT 1
    `)
    const user = (userRows as unknown as Array<{
      id: string; email: string; display_name: string | null
      timezone: string; quiet_hours_start: string; quiet_hours_end: string
    }>)[0]
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 })

    const emailSender = new ResendAlertEmailSender()
    const pushProvider = new VapidWebPushProvider()

    const testAlert = { ...alert as unknown as Alert, lastFiredAt: null } // bypass rate limit

    const results = await dispatchAlert(
      {
        alert: testAlert,
        dedupKey: `test:${alertId}:${now}`, // unique per test call
        payloadData: { test: true },
        context: {
          fuelName: 'U91',
          stationName: 'Test Station',
          stationId: 0,
          priceCents: 17490,
          distanceKm: 1.2,
          suburbDisplay: 'Test Suburb',
          signalState: 'FILL_NOW',
          bestDayToFill: 'Wednesday',
          topStations: [{ name: 'Test Station', priceCents: 17490, distanceKm: 1.2 }],
        },
      },
      {
        emailSender,
        pushProvider,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          timezone: user.timezone,
          quiet_hours_start: user.quiet_hours_start,
          quiet_hours_end: user.quiet_hours_end,
        },
      }
    )

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Test dispatch failed',
    }, { status: 500 })
  }
}
