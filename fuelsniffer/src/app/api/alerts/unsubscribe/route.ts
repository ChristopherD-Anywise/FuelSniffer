/**
 * SP-5 Alerts — GET /api/alerts/unsubscribe?token=...
 * One-click unsubscribe (signed JWT, no auth required).
 * Spam Act 2003 AU compliance: no login needed.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAlertToken } from '@/lib/alerts/unsubscribe'
import { db } from '@/lib/db/client'
import { alerts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const successHtml = (action: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fillip — ${action === 'unsubscribe' ? 'Unsubscribed' : 'Alert Paused'}</title>
  <style>
    body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
    .card{background:#fff;border-radius:12px;padding:32px;max-width:400px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}
    h1{color:#0f172a;margin:0 0 8px;font-size:22px}
    p{color:#475569;margin:0 0 24px}
    a{color:#0ea5e9;text-decoration:none}
  </style>
</head>
<body>
  <div class="card">
    <h1>${action === 'unsubscribe' ? '✓ Unsubscribed' : '✓ Alert Paused'}</h1>
    <p>${action === 'unsubscribe'
      ? 'You have been unsubscribed from this alert. You will no longer receive notifications.'
      : 'This alert has been paused. You can re-enable it from your dashboard.'
    }</p>
    <a href="/dashboard/alerts">Manage all alerts</a>
  </div>
</body>
</html>`

const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fillip — Invalid link</title>
  <style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}.card{background:#fff;border-radius:12px;padding:32px;max-width:400px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}h1{color:#0f172a;margin:0 0 8px;font-size:22px}p{color:#475569;margin:0 0 24px}a{color:#0ea5e9;text-decoration:none}</style>
</head>
<body>
  <div class="card">
    <h1>Invalid or expired link</h1>
    <p>This link may have expired or is invalid. Please manage your alerts from your dashboard.</p>
    <a href="/dashboard/alerts">Manage alerts</a>
  </div>
</body>
</html>`

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return new NextResponse(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  const payload = await verifyAlertToken(token)
  if (!payload) {
    return new NextResponse(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  try {
    if (payload.action === 'unsubscribe') {
      await db.delete(alerts).where(eq(alerts.id, payload.alertId))
    } else if (payload.action === 'pause') {
      await db.update(alerts).set({ paused: true }).where(eq(alerts.id, payload.alertId))
    }
  } catch (err) {
    console.error('[unsubscribe] DB operation failed:', err)
    return new NextResponse(errorHtml, { status: 500, headers: { 'Content-Type': 'text/html' } })
  }

  return new NextResponse(successHtml(payload.action), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}
