/**
 * Tests for POST /api/share/sign route.
 *
 * Auth gate: unauthenticated requests → 401.
 * Authenticated requests with valid body → 200 with ogUrl, deepLink, hash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const TEST_SECRET = 'test-sign-route-secret'
const TEST_SESSION_SECRET = 'test-session-secret'

// Mock session module — default to no session (unauthenticated)
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))

import { getSession } from '@/lib/session'

describe('POST /api/share/sign', () => {
  beforeEach(() => {
    process.env.SHARE_SIGNING_SECRET = TEST_SECRET
    process.env.SESSION_SECRET = TEST_SESSION_SECRET
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.SHARE_SIGNING_SECRET
    delete process.env.SESSION_SECRET
  })

  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost:4000/api/share/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 401 when no session is present', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    const { POST } = await import('@/app/api/share/sign/route')
    const req = makeRequest({ station_id: 1, fuel_type_id: 2, price_cents: 174 })
    const res = await POST(req)

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('unauthorized')
  })

  it('returns 200 with ogUrl, deepLink, hash when authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: 'user-abc' })

    const { POST } = await import('@/app/api/share/sign/route')
    const req = makeRequest({ station_id: 1, fuel_type_id: 2, price_cents: 174 })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(typeof json.ogUrl).toBe('string')
    expect(json.ogUrl).toContain('/api/og/fill')
    expect(typeof json.deepLink).toBe('string')
    expect(json.deepLink).toContain('/share/s/')
    expect(typeof json.hash).toBe('string')
    expect(json.hash).toHaveLength(64)
  })

  it('returns 400 when required fields are missing (authenticated)', async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: 'user-abc' })

    const { POST } = await import('@/app/api/share/sign/route')
    const req = makeRequest({ station_id: 1 })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })
})
