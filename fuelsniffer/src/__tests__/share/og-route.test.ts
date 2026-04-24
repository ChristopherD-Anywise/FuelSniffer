/**
 * Tests for /api/og/fill route.
 *
 * The route requires a valid HMAC sig.
 * We test: valid sig → 200 PNG, bad sig → 400, missing params → 400, unknown station → 404.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signParams } from '@/lib/share/sign'
import { NextRequest } from 'next/server'

// Mock the DB and renderer
vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}))

vi.mock('@/lib/share/render-node', () => ({
  renderCardPng: vi.fn().mockResolvedValue(
    // PNG magic bytes + minimal padding
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)])
  ),
}))

import { db } from '@/lib/db/client'

const TEST_SECRET = 'test-og-route-secret'

describe('/api/og/fill', () => {
  beforeEach(() => {
    process.env.SHARE_SIGNING_SECRET = TEST_SECRET
    // Mock station lookup returns a station
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{ name: 'Shell Chermside', brand: 'Shell' }] as never)
      // Fuel type lookup
      .mockResolvedValueOnce([{ code: 'U91' }] as never)
      // Cache upsert (non-fatal)
      .mockResolvedValueOnce([] as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.SHARE_SIGNING_SECRET
  })

  async function buildRequest(overrides: Record<string, string> = {}) {
    const base = { s: '1', f: '2', p: '174', v: 'default' }
    const params = { ...base, ...overrides }
    const sig = signParams(
      Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'sig'))
    )
    const url = new URL(`http://localhost:4000/api/og/fill`)
    Object.entries({ ...params, sig }).forEach(([k, v]) => url.searchParams.set(k, v))
    return new NextRequest(url)
  }

  it('returns 200 + PNG content-type for valid signed request', async () => {
    const req = await buildRequest()
    const { GET } = await import('@/app/api/og/fill/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('cache-control')).toContain('max-age=3600')
    expect(res.headers.get('x-card-hash')).toBeTruthy()
  })

  it('returns 400 for missing params', async () => {
    const url = new URL('http://localhost:4000/api/og/fill?s=1')
    const req = new NextRequest(url)
    const { GET } = await import('@/app/api/og/fill/route')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid signature', async () => {
    const req = await buildRequest()
    // Tamper the sig
    const url = req.nextUrl
    url.searchParams.set('sig', 'invalidsig1234567890ab')
    const tamperedReq = new NextRequest(url)
    const { GET } = await import('@/app/api/og/fill/route')
    const res = await GET(tamperedReq)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing signature', async () => {
    const url = new URL('http://localhost:4000/api/og/fill?s=1&f=2&p=174&v=default')
    const req = new NextRequest(url)
    const { GET } = await import('@/app/api/og/fill/route')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown station', async () => {
    // Override mock to return empty station
    vi.mocked(db.execute)
      .mockReset()
      .mockResolvedValueOnce([] as never) // no station
    const req = await buildRequest({ s: '99999' })
    const { GET } = await import('@/app/api/og/fill/route')
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it('includes ETag header matching the card hash', async () => {
    const req = await buildRequest()
    const { GET } = await import('@/app/api/og/fill/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
  })
})
