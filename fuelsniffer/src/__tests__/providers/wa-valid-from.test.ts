/**
 * WA T+1 valid_from semantic tests.
 * Verifies the time-zone-correct UTC conversion and temporal semantics.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { waDateToValidFrom } from '@/lib/providers/fuel/wa/normaliser'

afterEach(() => {
  vi.useRealTimers()
})

describe('WA T+1 valid_from — UTC conversion', () => {
  it('2026-04-25 → 2026-04-24T22:00:00.000Z (06:00 WST = UTC+8)', () => {
    const result = waDateToValidFrom('2026-04-25')
    expect(result.toISOString()).toBe('2026-04-24T22:00:00.000Z')
  })

  it('2026-04-24 → 2026-04-23T22:00:00.000Z', () => {
    const result = waDateToValidFrom('2026-04-24')
    expect(result.toISOString()).toBe('2026-04-23T22:00:00.000Z')
  })

  it('month boundary: 2026-05-01 → 2026-04-30T22:00:00.000Z', () => {
    const result = waDateToValidFrom('2026-05-01')
    expect(result.toISOString()).toBe('2026-04-30T22:00:00.000Z')
  })
})

describe('WA T+1 valid_from — temporal semantics', () => {
  it('announced price (date=tomorrow) has validFrom > now (fetched at 14:00 WST = 06:00 UTC)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T06:00:00Z'))  // 14:00 WST

    const tomorrowValidFrom = waDateToValidFrom('2026-04-25')
    expect(tomorrowValidFrom.getTime()).toBeGreaterThan(Date.now())
  })

  it('current price (date=today) has validFrom <= now (fetched at 14:00 WST)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T06:00:00Z'))  // 14:00 WST

    // 2026-04-24 effective since 22:00 UTC on 2026-04-23, which is past
    const todayValidFrom = waDateToValidFrom('2026-04-24')
    expect(todayValidFrom.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('what was "tomorrow" becomes "current" after 22:00 UTC (06:00 WST next day)', () => {
    vi.useFakeTimers()

    // Just before 22:00 UTC — April 25 is still "future"
    vi.setSystemTime(new Date('2026-04-24T21:59:00Z'))
    const validFrom = waDateToValidFrom('2026-04-25')
    expect(validFrom.getTime()).toBeGreaterThan(Date.now())

    // Just after 22:00 UTC — April 25 is now "current"
    vi.setSystemTime(new Date('2026-04-24T22:01:00Z'))
    expect(validFrom.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('confirmed price (morning 06:30 WST fetch, date=today) is current', () => {
    vi.useFakeTimers()
    // 06:30 WST = 22:30 UTC previous day
    vi.setSystemTime(new Date('2026-04-23T22:30:00Z'))  // 06:30 WST April 24

    const todayValidFrom = waDateToValidFrom('2026-04-24')
    // 2026-04-24 valid_from = 2026-04-23T22:00:00Z which is <= 22:30Z
    expect(todayValidFrom.getTime()).toBeLessThanOrEqual(Date.now())
  })
})
