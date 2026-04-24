/**
 * T-TEST-3 — Total trip cost computation.
 *
 * Tests the computeTripCost utility and the "save ≥ $0.50" threshold rule.
 */

import { describe, it, expect } from 'vitest'
import { computeSaving, computeTripCost } from '@/lib/trip/sort-filter'

describe('computeTripCost', () => {
  it('142km trip × 8.0L/100km = 11.36L fuel needed', () => {
    const fuelNeeded = 142 * 8.0 / 100
    expect(fuelNeeded).toBeCloseTo(11.36, 1)
  })

  it('returns correct cost for cheapest option', () => {
    // 142km, 8L/100km = 11.36L, at 179.9¢/L
    const cost = computeTripCost(142, 8.0, 60, 179.9)
    expect(cost).toBeCloseTo(11.36 * 179.9 / 100, 0)
  })

  it('capped at tank size: 500km at 8L/100km = 40L > 35L tank', () => {
    const cost = computeTripCost(500, 8, 35, 200.0)
    // 500*8/100=40 > 35 → capped at 35
    expect(cost).toBeCloseTo(35 * 200.0 / 100)
  })

  it('zero distance = zero fuel needed = zero cost', () => {
    expect(computeTripCost(0, 8, 50, 200.0)).toBeCloseTo(0)
  })
})

describe('computeSaving — $0.50 threshold rule', () => {
  it('saving exactly $0.50 — shown', () => {
    // (worstEffective - thisEffective) * tank / 100 >= 0.50
    // (200.0 - 199.0) * 50 / 100 = 1.0 * 50 / 100 = $0.50 exactly
    const result = computeSaving(199.0, 200.0, 50)
    expect(result).toBeCloseTo(0.50)
    expect(result).not.toBeNull()
  })

  it('saving below $0.50 — hidden (returns null)', () => {
    // (200.0 - 199.5) * 50 / 100 = 0.5 * 50 / 100 = $0.25
    const result = computeSaving(199.5, 200.0, 50)
    expect(result).toBeNull()
  })

  it('saving well above $0.50 — shown with correct value', () => {
    // (210.0 - 190.0) * 60 / 100 = 20 * 60 / 100 = $12
    const result = computeSaving(190.0, 210.0, 60)
    expect(result).toBeCloseTo(12)
  })

  it('same price for both stations — returns null (no saving)', () => {
    expect(computeSaving(200.0, 200.0, 50)).toBeNull()
  })

  it('worst is cheaper than current — saving is negative → returns null', () => {
    // Edge case: station is MORE expensive than "worst" (shouldn't happen in practice)
    expect(computeSaving(210.0, 200.0, 50)).toBeNull()
  })
})
