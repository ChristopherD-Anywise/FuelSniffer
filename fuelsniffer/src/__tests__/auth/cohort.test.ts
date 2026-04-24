import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { execute: vi.fn() }
      return fn(tx)
    }),
  },
}))

import { assertAllowed, CohortGateError } from '@/lib/auth/cohort'
import { db } from '@/lib/db/client'

const mockDb = vi.mocked(db)

describe('assertAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows when cohort gate is off, regardless of user status', async () => {
    // app_settings returns require_invite_for_signup = false
    mockDb.execute = vi.fn().mockResolvedValueOnce([
      { key: 'require_invite_for_signup', value: false },
    ])

    await expect(
      assertAllowed({ userId: 'user-1', isNew: true })
    ).resolves.toBeUndefined()
  })

  it('allows existing users when gate is on', async () => {
    mockDb.execute = vi.fn().mockResolvedValueOnce([
      { key: 'require_invite_for_signup', value: true },
    ])

    // isNew=false means existing user → always allowed
    await expect(
      assertAllowed({ userId: 'user-1', isNew: false })
    ).resolves.toBeUndefined()
  })

  it('throws CohortGateError for new user without invite when gate is on', async () => {
    mockDb.execute = vi.fn().mockResolvedValueOnce([
      { key: 'require_invite_for_signup', value: true },
    ])

    await expect(
      assertAllowed({ userId: 'new-user', isNew: true })
    ).rejects.toThrow(CohortGateError)
  })

  it('throws CohortGateError for new user with invalid invite code', async () => {
    mockDb.execute = vi.fn()
      // app_settings
      .mockResolvedValueOnce([{ key: 'require_invite_for_signup', value: true }])

    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // invite_codes lookup → not found / not active
          .mockResolvedValueOnce([]),
      }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    await expect(
      assertAllowed({ userId: 'new-user', isNew: true, inviteCode: 'INVALID' })
    ).rejects.toThrow(CohortGateError)
  })

  it('allows new user with valid invite code, marks code consumed', async () => {
    mockDb.execute = vi.fn()
      .mockResolvedValueOnce([{ key: 'require_invite_for_signup', value: true }])

    let markedConsumed = false
    mockDb.transaction = vi.fn(async (fn: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn()
          // invite_codes lookup → found and active
          .mockResolvedValueOnce([{ id: 42, code: 'VALIDCODE', is_active: true }])
          // mark last_used_at → success (simulating consumed)
          .mockImplementationOnce(() => {
            markedConsumed = true
            return Promise.resolve([])
          }),
      }
      return fn(tx)
    }) as unknown as typeof mockDb.transaction

    await expect(
      assertAllowed({ userId: 'new-user', isNew: true, inviteCode: 'VALIDCODE' })
    ).resolves.toBeUndefined()

    expect(markedConsumed).toBe(true)
  })

  it('allows when gate setting is missing (defaults to open)', async () => {
    // app_settings row not found → default open
    mockDb.execute = vi.fn().mockResolvedValueOnce([])

    await expect(
      assertAllowed({ userId: 'new-user', isNew: true })
    ).resolves.toBeUndefined()
  })
})
