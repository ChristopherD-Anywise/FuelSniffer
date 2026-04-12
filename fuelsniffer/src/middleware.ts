import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildSecurityHeaders } from '@/lib/security/headers'

export function middleware(request: NextRequest) {
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
