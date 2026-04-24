import { describe, it, expect } from 'vitest'
import { buildSecurityHeaders } from '@/lib/security/headers'

describe('buildSecurityHeaders', () => {
  const headers = buildSecurityHeaders()

  it('returns CSP in report-only mode', () => {
    expect(headers).toHaveProperty('Content-Security-Policy-Report-Only')
    expect(headers).not.toHaveProperty('Content-Security-Policy')
  })

  it('CSP includes self as default-src', () => {
    expect(headers['Content-Security-Policy-Report-Only']).toContain("default-src 'self'")
  })

  it('CSP includes Leaflet tile sources', () => {
    expect(headers['Content-Security-Policy-Report-Only']).toContain('tile.openstreetmap.org')
  })

  it('CSP includes report-uri', () => {
    expect(headers['Content-Security-Policy-Report-Only']).toContain('report-uri /api/csp-report')
  })

  it('sets X-Frame-Options DENY', () => {
    expect(headers['X-Frame-Options']).toBe('DENY')
  })

  it('sets X-Content-Type-Options nosniff', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('sets HSTS with preload', () => {
    expect(headers['Strict-Transport-Security']).toContain('preload')
  })

  it('sets restrictive Permissions-Policy', () => {
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(headers['Permissions-Policy']).toContain('geolocation=(self)')
  })
})
