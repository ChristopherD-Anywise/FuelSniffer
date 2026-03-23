/**
 * Tests for DASH-04: map pin colour generation from price data.
 * Run: npx vitest run src/__tests__/map.test.ts
 */
import { describe, it, expect } from 'vitest'
import { getPinColour } from '@/lib/map-utils'

describe('getPinColour()', () => {
  it('returns green for cheapest station', () => {
    expect(getPinColour(140, 140, 160)).toBe('hsl(120,70%,35%)')
  })
  it('returns red for most expensive station', () => {
    expect(getPinColour(160, 140, 160)).toBe('hsl(0,75%,45%)')
  })
  it('returns hue near 60 for median price', () => {
    const colour = getPinColour(150, 140, 160)
    const hue = parseInt(colour.replace('hsl(', '').split(',')[0])
    expect(hue).toBeGreaterThan(50)
    expect(hue).toBeLessThan(70)
  })
  it('handles single station (min === max) without division by zero', () => {
    expect(getPinColour(145, 145, 145)).toBe('hsl(120,70%,35%)')
  })
})
