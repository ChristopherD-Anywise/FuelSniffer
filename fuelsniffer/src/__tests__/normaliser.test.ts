/**
 * Stubs for DATA-04: price encoding and timezone correctness.
 * These tests are INTENTIONALLY FAILING until Plan 02/03 implements the normaliser.
 * Run: npx vitest run src/__tests__/normaliser.test.ts
 */
import { describe, it, expect } from 'vitest'

describe('rawToPrice', () => {
  it('converts QLD API integer 1459 to 145.9 cents per litre', () => {
    // Will import from '@/lib/scraper/normaliser' once Plan 03 implements it
    const rawToPrice = (raw: number) => { throw new Error('not implemented') }
    expect(rawToPrice(1459)).toBe(145.9)
  })

  it('converts 1000 to 100.0 cents per litre', () => {
    const rawToPrice = (raw: number) => { throw new Error('not implemented') }
    expect(rawToPrice(1000)).toBe(100.0)
  })

  it('throws for values outside the 50–400 c/L plausible range after conversion', () => {
    const rawToPrice = (raw: number) => { throw new Error('not implemented') }
    expect(() => rawToPrice(10)).toThrow()  // raw 10 → 1.0 c/L (impossible)
    expect(() => rawToPrice(9999)).toThrow() // raw 9999 → 999.9 c/L (impossible)
  })

  it('stores result as a number rounded to one decimal place', () => {
    const rawToPrice = (raw: number) => { throw new Error('not implemented') }
    expect(rawToPrice(1459)).toBeCloseTo(145.9, 1)
  })
})

describe('timezone: UTC storage and Australia/Brisbane display', () => {
  it('a UTC timestamp converts to the same Brisbane hour regardless of month (no DST shift)', () => {
    // Brisbane is always UTC+10. In October (when NSW enters DST), Brisbane stays UTC+10.
    // A UTC 00:00 timestamp must always display as 10:00 Brisbane — not 11:00.
    const toBrisbaneHour = (_utcIso: string): number => { throw new Error('not implemented') }

    // January (summer — NSW is UTC+11, QLD is UTC+10)
    expect(toBrisbaneHour('2026-01-15T00:00:00Z')).toBe(10)
    // July (winter — NSW is UTC+10, QLD is UTC+10 — same)
    expect(toBrisbaneHour('2026-07-15T00:00:00Z')).toBe(10)
    // October (NSW enters DST → UTC+11; QLD stays UTC+10)
    expect(toBrisbaneHour('2026-10-04T00:00:00Z')).toBe(10)
  })
})

describe('isWithinRadius', () => {
  it('accepts stations within 50km of North Lakes (-27.2353, 153.0189)', () => {
    const isWithinRadius = (_lat: number, _lng: number): boolean => { throw new Error('not implemented') }
    // North Lakes itself — distance 0km
    expect(isWithinRadius(-27.2353, 153.0189)).toBe(true)
    // Mango Hill — approx 2km from North Lakes
    expect(isWithinRadius(-27.2545, 153.0282)).toBe(true)
  })

  it('rejects stations beyond 50km of North Lakes', () => {
    const isWithinRadius = (_lat: number, _lng: number): boolean => { throw new Error('not implemented') }
    // Brisbane CBD — ~26km; should still be within 50km
    expect(isWithinRadius(-27.4698, 153.0251)).toBe(true)
    // Gold Coast — ~100km south; should be rejected
    expect(isWithinRadius(-28.0167, 153.4000)).toBe(false)
    // Sunshine Coast — ~90km north; should be rejected
    expect(isWithinRadius(-26.6500, 153.0667)).toBe(false)
  })
})
