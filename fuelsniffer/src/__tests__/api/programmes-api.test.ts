/**
 * SP-6 — API contract tests for programme endpoints.
 *
 * Tests are functional: they call route handlers directly without an HTTP server.
 * DB calls are mocked; session helpers are exercised via real JWT creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set up env before any module imports
process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-chars-long-enough'

import { GET as getProgrammesPublic } from '@/app/api/programmes/route'
import { GET as getMeProgrammes } from '@/app/api/me/programmes/route'
import { PUT as putMeProgramme } from '@/app/api/me/programmes/[programmeId]/route'
import { createSession } from '@/lib/session'
import { getRegistry } from '@/lib/discount/registry'

// Mock DB
vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}))

import { db } from '@/lib/db/client'
const mockDbExecute = vi.mocked(db.execute)

function makeRequest(path: string, options?: RequestInit): Request {
  return new Request(`http://localhost:4000${path}`, options)
}

async function makeAuthRequest(path: string, userId: string, options?: RequestInit): Promise<Request> {
  const cookieHeader = await createSession(userId)
  // Extract just the token from "fillip-session=TOKEN; Path=..."
  const tokenMatch = cookieHeader.match(/fillip-session=([^;]+)/)
  const token = tokenMatch![1]
  return new Request(`http://localhost:4000${path}`, {
    ...options,
    headers: {
      ...(options?.headers as Record<string, string> | undefined),
      cookie: `fillip-session=${token}`,
    },
  })
}

// ── GET /api/programmes (public) ──────────────────────────────────────────────

describe('GET /api/programmes', () => {
  it('returns 200 with programme list', async () => {
    const req = makeRequest('/api/programmes')
    const res = await getProgrammesPublic(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('programmes')
    expect(Array.isArray(body.programmes)).toBe(true)
  })

  it('returns all 12 v1 programmes', async () => {
    const req = makeRequest('/api/programmes')
    const res = await getProgrammesPublic(req)
    const body = await res.json()
    expect(body.programmes).toHaveLength(12)
  })

  it('omits the notes field from public response', async () => {
    const req = makeRequest('/api/programmes')
    const res = await getProgrammesPublic(req)
    const body = await res.json()
    for (const prog of body.programmes) {
      expect(prog).not.toHaveProperty('notes')
    }
  })

  it('includes expected fields on each programme', async () => {
    const req = makeRequest('/api/programmes')
    const res = await getProgrammesPublic(req)
    const body = await res.json()
    const prog = body.programmes[0]
    expect(prog).toHaveProperty('id')
    expect(prog).toHaveProperty('name')
    expect(prog).toHaveProperty('type')
    expect(prog).toHaveProperty('discount_cents_per_litre')
    expect(prog).toHaveProperty('eligible_brand_codes')
    expect(prog).toHaveProperty('conditions_text')
    expect(prog).toHaveProperty('source_url')
  })
})

// ── GET /api/me/programmes (authed) ───────────────────────────────────────────

describe('GET /api/me/programmes', () => {
  beforeEach(() => {
    mockDbExecute.mockResolvedValue([])  // no enrolled programmes
  })

  it('returns 401 when unauthenticated', async () => {
    const req = makeRequest('/api/me/programmes')
    const res = await getMeProgrammes(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 with merged programme list for authenticated user', async () => {
    const req = await makeAuthRequest('/api/me/programmes', 'user-123')
    const res = await getMeProgrammes(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('programmes')
    expect(body.programmes).toHaveLength(12)
  })

  it('returns enrolled:false for all programmes when user has no enrolments', async () => {
    mockDbExecute.mockResolvedValue([])
    const req = await makeAuthRequest('/api/me/programmes', 'user-123')
    const res = await getMeProgrammes(req)
    const body = await res.json()
    for (const prog of body.programmes) {
      expect(prog.enrolled).toBe(false)
      expect(prog.paused).toBe(false)
      expect(prog.paused_until).toBeNull()
    }
  })

  it('returns enrolled:true and paused state from DB for enrolled programmes', async () => {
    mockDbExecute.mockResolvedValue([
      { programme_id: 'racq', enabled_at: new Date().toISOString(), paused: false, paused_until: null },
    ])
    const req = await makeAuthRequest('/api/me/programmes', 'user-456')
    const res = await getMeProgrammes(req)
    const body = await res.json()
    const racq = body.programmes.find((p: { id: string }) => p.id === 'racq')
    expect(racq.enrolled).toBe(true)
    expect(racq.paused).toBe(false)
  })

  it('returns enrolled:false for programmes not in user_programmes', async () => {
    mockDbExecute.mockResolvedValue([
      { programme_id: 'racq', enabled_at: new Date().toISOString(), paused: false, paused_until: null },
    ])
    const req = await makeAuthRequest('/api/me/programmes', 'user-456')
    const res = await getMeProgrammes(req)
    const body = await res.json()
    const shell = body.programmes.find((p: { id: string }) => p.id === 'shell_vpower_rewards')
    expect(shell.enrolled).toBe(false)
  })
})

// ── PUT /api/me/programmes/:programmeId ──────────────────────────────────────

describe('PUT /api/me/programmes/:programmeId', () => {
  beforeEach(() => {
    mockDbExecute.mockResolvedValue([])
  })

  function makeContext(programmeId: string) {
    return { params: Promise.resolve({ programmeId }) }
  }

  it('returns 401 when unauthenticated', async () => {
    const req = new Request('http://localhost/api/me/programmes/racq', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    const res = await putMeProgramme(req, makeContext('racq'))
    expect(res.status).toBe(401)
  })

  it('returns 404 for unknown programme id', async () => {
    const req = await makeAuthRequest('/api/me/programmes/definitely_fake_programme', 'user-789', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    const res = await putMeProgramme(req, makeContext('definitely_fake_programme'))
    expect(res.status).toBe(404)
  })

  it('returns 200 when enabling a valid programme', async () => {
    const req = await makeAuthRequest('/api/me/programmes/racq', 'user-789', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    const res = await putMeProgramme(req, makeContext('racq'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enrolled).toBe(true)
    expect(body.id).toBe('racq')
  })

  it('returns enrolled:false when disabling', async () => {
    const req = await makeAuthRequest('/api/me/programmes/racq', 'user-789', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    const res = await putMeProgramme(req, makeContext('racq'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enrolled).toBe(false)
  })

  it('handles paused toggle for docket-type programmes', async () => {
    const req = await makeAuthRequest('/api/me/programmes/woolworths_docket', 'user-789', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, paused: true }),
    })
    const res = await putMeProgramme(req, makeContext('woolworths_docket'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.paused).toBe(true)
  })

  it('validates all 12 registry programme IDs are accepted', async () => {
    const registry = getRegistry()
    for (const prog of registry) {
      const req = await makeAuthRequest(`/api/me/programmes/${prog.id}`, 'user-check', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      const res = await putMeProgramme(req, makeContext(prog.id))
      expect(res.status, `Programme ${prog.id} should be accepted`).toBe(200)
    }
  })
})
