import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildSecurityHeaders } from '@/lib/security/headers'
import { checkRateLimit, getRateLimitConfig } from '@/lib/security/rate-limit'
import { createHash } from 'crypto'

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
