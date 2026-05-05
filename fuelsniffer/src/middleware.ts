import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildSecurityHeaders } from '@/lib/security/headers'
import { checkRateLimit, getRateLimitConfig } from '@/lib/security/rate-limit'
import { getSession } from '@/lib/session'

/**
 * Simple non-cryptographic hash for IP rate limiting keys.
 * Edge runtime doesn't support Node.js crypto module.
 * This is NOT for security — just for bucketing IPs in the rate limiter.
 */
function hashIp(ip: string): string {
  let hash = 0
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Session gate for /dashboard routes ────────────────────────────────────
  // Auth API routes handle their own auth state; skip them.
  if (pathname.startsWith('/dashboard') && !pathname.startsWith('/api/auth')) {
    const session = await getSession(request)
    if (!session) {
      const loginUrl = new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url)
      return NextResponse.redirect(loginUrl, { status: 302 })
    }
  }

  // Rate limiting (API routes only, skip /api/health for monitoring probes)
  const rateLimitConfig = getRateLimitConfig(pathname)
  if (rateLimitConfig && pathname !== '/api/health') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? '0.0.0.0'
    const ipHash = hashIp(ip)
    const result = checkRateLimit(ipHash, pathname, rateLimitConfig)

    if (!result.allowed) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
          },
        }
      )
    }
  }

  // Security headers on all responses
  const response = NextResponse.next()
  const headers = buildSecurityHeaders()
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }

  return response
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
