import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { storeToken, checkMagicLinkRateLimit } from '@/lib/auth/tokens'
import { getEmailSender } from '@/lib/email/factory'
import { renderMagicLinkEmail } from '@/lib/auth/email/magic-link'
import { getDefaultSender } from '@/lib/email/sender'

const RequestSchema = z.object({
  email: z.string().email().max(254),
})

function hashForRateLimit(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex')
}

function getPublicUrl(): string {
  return process.env.APP_PUBLIC_URL ?? 'http://localhost:4000'
}

function getTtlMinutes(): number {
  return parseInt(process.env.MAGIC_LINK_TTL_MINUTES ?? '15', 10)
}

export async function POST(req: Request): Promise<NextResponse> {
  // CSRF: Origin header must match our host
  const publicUrl = getPublicUrl()
  const expectedOrigin = new URL(publicUrl).origin
  const origin = req.headers.get('origin') ?? ''
  if (origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const email = parsed.data.email.toLowerCase().trim()
  const emailHash = hashForRateLimit(email)

  // Extract IP for rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined
  const ipHash = ip ? hashForRateLimit(ip) : undefined

  // Rate limit check
  const allowed = await checkMagicLinkRateLimit({ emailHash, ipHash })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Fire-and-forget the actual token creation + send
  // Always return ok:true to the client (enumeration defence)
  void (async () => {
    try {
      const rawToken = await storeToken({
        email,
        ip,
        ua: req.headers.get('user-agent') ?? undefined,
      })

      const ttlMinutes = getTtlMinutes()
      const magicLinkUrl = `${publicUrl}/api/auth/magic-link/callback?token=${rawToken}`

      const sender = getDefaultSender()
      const emailContent = renderMagicLinkEmail({
        email,
        magicLinkUrl,
        ttlMinutes,
        appName: process.env.APP_NAME ?? 'Fillip',
        supportEmail: sender.address,
      })

      await getEmailSender().send({
        to: email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      })
    } catch (err) {
      // Log internally — never surface to client
      console.error('[magic-link] Failed to send magic link email:', err)
    }
  })()

  return NextResponse.json({ ok: true }, { status: 200 })
}
