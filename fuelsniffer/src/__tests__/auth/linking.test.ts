import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Simple pass-through transaction mock
      const tx = {
        execute: vi.fn(),
      }
      return fn(tx)
    }),
  },
}))

import { findOrCreateUser } from '@/lib/auth/linking'
import { db } from '@/lib/db/client'
import type { ResolvedIdentity } from '@/lib/auth/providers/types'

const mockDb = vi.mocked(db)

function makeIdentity(overrides: Partial<ResolvedIdentity> = {}): ResolvedIdentity {
  return {
    providerId: 'google',
    providerSubject: 'google-sub-123',
    email: 'user@example.com',
    emailVerified: true,
    displayName: 'Test User',
    ...overrides,
  }
}

describe('findOrCreateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset transaction mock to pass-through
    mockDb.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { execute: vi.fn() }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction
  })

  it('returns existing user when oauth identity row exists', async () => {
    // Simulate: oauth_identities lookup finds existing user
    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // First call: look up oauth_identities by (provider, subject)
          .mockResolvedValueOnce([{ user_id: 'existing-user-uuid' }])
          // Second call: update last_login_at
          .mockResolvedValueOnce([]),
      }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    const result = await findOrCreateUser(makeIdentity())
    expect(result.userId).toBe('existing-user-uuid')
    expect(result.isNew).toBe(false)
  })

  it('auto-links OAuth to existing user when email matches and emailVerified=true', async () => {
    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. oauth_identities lookup → not found
          .mockResolvedValueOnce([])
          // 2. users lookup by email → found
          .mockResolvedValueOnce([{ id: 'email-matched-user-uuid' }])
          // 3. insert oauth_identities
          .mockResolvedValueOnce([])
          // 4. update last_login_at
          .mockResolvedValueOnce([]),
      }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    const result = await findOrCreateUser(makeIdentity({ emailVerified: true }))
    expect(result.userId).toBe('email-matched-user-uuid')
    expect(result.isNew).toBe(false)
  })

  it('does NOT auto-link when emailVerified=false', async () => {
    let insertedUser = ''
    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. oauth_identities lookup → not found
          .mockResolvedValueOnce([])
          // 2. users lookup by email → found BUT emailVerified=false means we skip
          // Actually we need to check: the implementation should NOT look up by email when emailVerified=false
          // The mock sequence: oauth → not found, then creates new user
          .mockResolvedValueOnce([{ id: 'new-user-uuid' }])  // INSERT users RETURNING id
          // 3. insert oauth_identities
          .mockResolvedValueOnce([])
          // 4. update last_login_at
          .mockResolvedValueOnce([]),
      }
      insertedUser = 'new-user-uuid'
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    const result = await findOrCreateUser(makeIdentity({ emailVerified: false }))
    expect(result.isNew).toBe(true)
  })

  it('creates a new user when no existing identity or email match', async () => {
    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. oauth_identities → not found
          .mockResolvedValueOnce([])
          // 2. users by email → not found
          .mockResolvedValueOnce([])
          // 3. INSERT users RETURNING id
          .mockResolvedValueOnce([{ id: 'brand-new-uuid' }])
          // 4. INSERT oauth_identities
          .mockResolvedValueOnce([])
          // 5. update last_login_at
          .mockResolvedValueOnce([]),
      }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    const result = await findOrCreateUser(makeIdentity())
    expect(result.userId).toBe('brand-new-uuid')
    expect(result.isNew).toBe(true)
  })

  it('handles magic-link provider (no oauth_identities row)', async () => {
    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. users lookup by email (magic-link skips oauth_identities)
          .mockResolvedValueOnce([{ id: 'magic-user-uuid' }])
          // 2. update last_login_at
          .mockResolvedValueOnce([]),
      }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    const identity = makeIdentity({ providerId: 'magic-link', emailVerified: true })
    const result = await findOrCreateUser(identity)
    expect(result.userId).toBe('magic-user-uuid')
    expect(result.isNew).toBe(false)
  })

  it('creates a new user for magic-link when email not found', async () => {
    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // 1. users lookup by email → not found
          .mockResolvedValueOnce([])
          // 2. INSERT users RETURNING id
          .mockResolvedValueOnce([{ id: 'new-magic-user-uuid' }])
          // 3. update last_login_at
          .mockResolvedValueOnce([]),
      }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    const identity = makeIdentity({ providerId: 'magic-link', emailVerified: true })
    const result = await findOrCreateUser(identity)
    expect(result.userId).toBe('new-magic-user-uuid')
    expect(result.isNew).toBe(true)
  })
})
