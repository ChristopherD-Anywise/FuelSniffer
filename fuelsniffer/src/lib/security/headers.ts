/**
 * Security header builder for Next.js middleware.
 *
 * CSP is in report-only mode for Phase 1 — it does not block anything.
 * Enforcement comes in Phase 3 after a soak period confirms no
 * legitimate traffic triggers violations.
 */

export interface SecurityHeaders {
  'Content-Security-Policy-Report-Only': string
  'Strict-Transport-Security': string
  'X-Frame-Options': string
  'X-Content-Type-Options': string
  'Referrer-Policy': string
  'Permissions-Policy': string
}

export function buildSecurityHeaders(): SecurityHeaders {
  const cspDirectives = [
    "default-src 'self'",
    // Leaflet tiles
    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com blob:",
    // Leaflet + Recharts inline styles
    "style-src 'self' 'unsafe-inline'",
    // Scripts — unsafe-inline needed until nonce support in Phase 3
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Font loading
    "font-src 'self' https://fonts.gstatic.com",
    // API calls
    "connect-src 'self'",
    // Frames — none needed
    "frame-src 'none'",
    // CSP violation reports
    "report-uri /api/csp-report",
  ]

  return {
    'Content-Security-Policy-Report-Only': cspDirectives.join('; '),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  }
}
