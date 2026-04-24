/**
 * SP-5 Alerts — GET /api/alerts/pause?token=...
 * One-click pause toggle (signed JWT, no auth required).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAlertToken } from '@/lib/alerts/unsubscribe'
import { db } from '@/lib/db/client'
import { alerts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const html = (paused: boolean) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fillip — Alert ${paused ? 'Paused' : 'Resumed'}</title>
  <style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}.card{background:#fff;border-radius:12px;padding:32px;max-width:400px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}h1{color:#0f172a;margin:0 0 8px;font-size:22px}p{color:#475569;margin:0 0 24px}a{color:#0ea5e9;text-decoration:none}</style>
</head>
<body>
  <div class="card">
    <h1>✓ Alert ${paused ? 'Paused' : 'Resumed'}</h1>
    <p>This alert has been ${paused ? 'paused. You can re-enable it from your dashboard.' : 'resumed.'}</p>
    <a href="/dashboard/alerts">Manage all alerts</a>
  </div>
</body>
</html>`

const errorHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fillip — Invalid link</title></head><body><p>Invalid or expired link. <a href="/dashboard/alerts">Manage alerts</a></p></body></html>`

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return new NextResponse(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  const payload = await verifyAlertToken(token)
  if (!payload || payload.action !== 'pause') {
    return new NextResponse(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } })
  }

  // Toggle paused state
  const [existing] = await db.select({ paused: alerts.paused }).from(alerts).where(eq(alerts.id, payload.alertId))
  if (!existing) {
    return new NextResponse(errorHtml, { status: 404, headers: { 'Content-Type': 'text/html' } })
  }

  const newPaused = !existing.paused
  await db.update(alerts).set({ paused: newPaused }).where(eq(alerts.id, payload.alertId))

  return new NextResponse(html(newPaused), { status: 200, headers: { 'Content-Type': 'text/html' } })
}
