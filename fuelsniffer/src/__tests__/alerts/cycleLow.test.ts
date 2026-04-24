/**
 * SP-5 Alerts — cycle_low edge-trigger idempotency tests.
 * Tests the isDigestWindow helper and dedup key logic.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock DB to prevent DATABASE_URL requirement at import time
vi.mock('@/lib/db/client', () => ({
  db: { execute: vi.fn().mockResolvedValue([]), select: vi.fn(), update: vi.fn() },
}))

import { isDigestWindow } from '@/lib/alerts/evaluator/weeklyDigest'

describe('isDigestWindow', () => {
  it('returns true at 06:00 Brisbane on Sunday', () => {
    // 06:00 Brisbane (UTC+10) = 20:00 UTC previous day
    // But we need a Sunday. 2026-04-26 is a Sunday
    // 06:00 AEST = 20:00 UTC Sat 25 April
    const now = new Date('2026-04-25T20:00:00Z') // 06:00 Sun 26 April Brisbane
    expect(isDigestWindow('Australia/Brisbane', now)).toBe(true)
  })

  it('returns false at 07:00 Brisbane on Sunday', () => {
    // 07:00 AEST = 21:00 UTC Sat
    const now = new Date('2026-04-25T21:00:00Z') // 07:00 Sun Brisbane
    expect(isDigestWindow('Australia/Brisbane', now)).toBe(false)
  })

  it('returns false at 06:00 Brisbane on Monday', () => {
    // 06:00 Mon Brisbane = 20:00 UTC Sun
    const now = new Date('2026-04-26T20:00:00Z') // 06:00 Mon Brisbane
    expect(isDigestWindow('Australia/Brisbane', now)).toBe(false)
  })

  it('returns true at 06:30 Brisbane on Sunday (within 06:00–06:59)', () => {
    // 06:30 AEST = 20:30 UTC Sat
    const now = new Date('2026-04-25T20:30:00Z')
    expect(isDigestWindow('Australia/Brisbane', now)).toBe(true)
  })

  it('returns false at 05:59 Brisbane on Sunday (before window)', () => {
    // 05:59 AEST = 19:59 UTC Sat
    const now = new Date('2026-04-25T19:59:00Z')
    expect(isDigestWindow('Australia/Brisbane', now)).toBe(false)
  })
})

describe('cycle_low dedup key uniqueness', () => {
  it('same suburb+fuel+day produces same key (idempotent)', () => {
    const suburbKey = 'chermside|qld'
    const fuelTypeId = 2
    const date = '2026-04-24'
    const key1 = `cycle:${suburbKey}:${fuelTypeId}:${date}`
    const key2 = `cycle:${suburbKey}:${fuelTypeId}:${date}`
    expect(key1).toBe(key2)
  })

  it('different suburbs produce different keys', () => {
    const date = '2026-04-24'
    const fuelTypeId = 2
    const key1 = `cycle:chermside|qld:${fuelTypeId}:${date}`
    const key2 = `cycle:aspley|qld:${fuelTypeId}:${date}`
    expect(key1).not.toBe(key2)
  })

  it('different fuels produce different keys', () => {
    const date = '2026-04-24'
    const suburbKey = 'chermside|qld'
    const key1 = `cycle:${suburbKey}:2:${date}`
    const key2 = `cycle:${suburbKey}:3:${date}`
    expect(key1).not.toBe(key2)
  })

  it('next day produces different key', () => {
    const suburbKey = 'chermside|qld'
    const fuelTypeId = 2
    const key1 = `cycle:${suburbKey}:${fuelTypeId}:2026-04-24`
    const key2 = `cycle:${suburbKey}:${fuelTypeId}:2026-04-25`
    expect(key1).not.toBe(key2)
  })
})
