/**
 * SP-5 Alerts — quiet hours predicate TZ-aware tests.
 */
import { describe, it, expect } from 'vitest'
import { isInQuietHours } from '@/lib/alerts/dispatcher/quietHours'

const BRISBANE = { timezone: 'Australia/Brisbane', quiet_hours_start: '21:00', quiet_hours_end: '07:00' }
const SYDNEY = { timezone: 'Australia/Sydney', quiet_hours_start: '21:00', quiet_hours_end: '07:00' }

describe('isInQuietHours', () => {
  // Brisbane is UTC+10, no DST

  it('is quiet at 22:00 Brisbane (21:00 UTC+10 = 12:00 UTC)', () => {
    // 22:00 Brisbane = 12:00 UTC
    const now = new Date('2026-04-24T12:00:00Z')
    expect(isInQuietHours(BRISBANE, now)).toBe(true)
  })

  it('is active at 08:00 Brisbane (well outside quiet window)', () => {
    // 08:00 Brisbane = 22:00 UTC (previous day)
    const now = new Date('2026-04-23T22:00:00Z')
    expect(isInQuietHours(BRISBANE, now)).toBe(false)
  })

  it('is active at 14:00 Brisbane', () => {
    // 14:00 Brisbane = 04:00 UTC
    const now = new Date('2026-04-24T04:00:00Z')
    expect(isInQuietHours(BRISBANE, now)).toBe(false)
  })

  it('is quiet at 06:30 Brisbane (just before end)', () => {
    // 06:30 Brisbane = 20:30 UTC (previous day)
    const now = new Date('2026-04-23T20:30:00Z')
    expect(isInQuietHours(BRISBANE, now)).toBe(true)
  })

  it('is active at 07:00 Brisbane (exactly at end)', () => {
    // 07:00 Brisbane = 21:00 UTC (previous day)
    const now = new Date('2026-04-23T21:00:00Z')
    expect(isInQuietHours(BRISBANE, now)).toBe(false)
  })

  it('is quiet at 21:00 Brisbane (exactly at start)', () => {
    // 21:00 Brisbane = 11:00 UTC
    const now = new Date('2026-04-24T11:00:00Z')
    expect(isInQuietHours(BRISBANE, now)).toBe(true)
  })

  // Sydney has DST. In April (AEDT = UTC+11), midnight Brisbane (UTC+10) = 01:00 AEDT
  it('handles Sydney timezone (with DST) correctly at 22:00 Sydney AEDT', () => {
    // April in Sydney = AEDT (UTC+11)
    // 22:00 AEDT = 11:00 UTC
    const now = new Date('2026-04-24T11:00:00Z')
    expect(isInQuietHours(SYDNEY, now)).toBe(true)
  })

  it('handles daytime Sydney correctly', () => {
    // 12:00 AEDT = 01:00 UTC
    const now = new Date('2026-04-24T01:00:00Z')
    expect(isInQuietHours(SYDNEY, now)).toBe(false)
  })

  // Non-overnight window test
  it('handles non-overnight window (09:00-17:00)', () => {
    const config = { timezone: 'Australia/Brisbane', quiet_hours_start: '09:00', quiet_hours_end: '17:00' }
    // 10:00 Brisbane = 00:00 UTC
    const inside = new Date('2026-04-24T00:00:00Z')
    expect(isInQuietHours(config, inside)).toBe(true)

    // 18:00 Brisbane = 08:00 UTC
    const outside = new Date('2026-04-24T08:00:00Z')
    expect(isInQuietHours(config, outside)).toBe(false)
  })
})
