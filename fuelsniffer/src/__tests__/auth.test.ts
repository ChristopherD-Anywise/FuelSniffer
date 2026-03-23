/**
 * Tests for ACCS-01: invite code validation and session management.
 * Run: npx vitest run src/__tests__/auth.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}))

describe('validateInviteCode()', () => {
  it.todo('returns the code row when code exists and is_active=true')
  it.todo('returns null when code does not exist')
  it.todo('returns null when code exists but is_active=false')
})

describe('encrypt / decrypt session', () => {
  it.todo('round-trips a payload through encrypt then decrypt')
  it.todo('decrypt returns null for a tampered token')
})
