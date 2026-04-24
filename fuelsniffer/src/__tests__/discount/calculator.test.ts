/**
 * SP-6 — Calculator golden test matrix.
 *
 * Each fixture covers a defined scenario from spec §13.1.
 * Tests are purely functional: no DB, no network, no side effects.
 */

import { describe, it, expect, vi } from 'vitest'

// We need to control the registry for some tests (stackable scenario),
// so we mock it partially.
vi.mock('@/lib/discount/registry', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/discount/registry')>()
  return real  // use real module by default; individual tests can vi.spyOn(registry, 'getRegistry')
})

import { computeEffective } from '@/lib/discount/calculator'
import * as registry from '@/lib/discount/registry'
import type { Programme } from '@/lib/discount/registry'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProgram(overrides: Partial<Programme> & { id: string; type: Programme['type'] }): Programme {
  return {
    name: overrides.id,
    eligible_brand_codes: ['ampol'],
    eligible_fuel_types: ['U91'],
    discount_cents_per_litre: 4,
    stackable: false,
    conditions_text: 'Test conditions',
    source_url: 'https://example.com',
    last_verified_at: '2026-04-24',
    verified_by: 'test',
    notes: null,
    ...overrides,
  }
}

function spyRegistry(programmes: Programme[]) {
  return vi.spyOn(registry, 'getRegistry').mockReturnValue(programmes)
}

// ── Golden fixtures: one per v1 programme ─────────────────────────────────────

describe('computeEffective — one programme applies (happy path per programme)', () => {
  const realRegistry = registry.getRegistry()

  const fixtures = [
    { programmeId: 'seven_eleven_fuel_app', brand: 'seven_eleven', fuel: 'U91', expectedDiscount: 4 },
    { programmeId: 'racq',                 brand: 'ampol',         fuel: 'U91', expectedDiscount: 4 },
    { programmeId: 'nrma',                 brand: 'ampol',         fuel: 'U95', expectedDiscount: 4 },
    { programmeId: 'racv',                 brand: 'eg_ampol',      fuel: 'U98', expectedDiscount: 4 },
    { programmeId: 'raa',                  brand: 'ampol',         fuel: 'DSL', expectedDiscount: 4 },
    { programmeId: 'rac_wa',               brand: 'eg_ampol',      fuel: 'PDL', expectedDiscount: 4 },
    { programmeId: 'ract',                 brand: 'ampol',         fuel: 'E10', expectedDiscount: 4 },
    { programmeId: 'woolworths_docket',    brand: 'eg_ampol',      fuel: 'U91', expectedDiscount: 4 },
    { programmeId: 'coles_docket',         brand: 'shell_coles_express', fuel: 'U91', expectedDiscount: 4 },
    { programmeId: 'shell_vpower_rewards', brand: 'shell',         fuel: 'U91', expectedDiscount: 4 },
    { programmeId: 'eg_ampolcash',         brand: 'eg_ampol',      fuel: 'U91', expectedDiscount: 6 },
    { programmeId: 'united_convenience',   brand: 'united',        fuel: 'U91', expectedDiscount: 5 },
  ]

  for (const { programmeId, brand, fuel, expectedDiscount } of fixtures) {
    it(`${programmeId} at ${brand} ${fuel}`, () => {
      const prog = realRegistry.find(p => p.id === programmeId)
      expect(prog, `Programme "${programmeId}" not found in registry`).toBeTruthy()

      const pylon = 188
      const result = computeEffective(pylon, brand, fuel, [programmeId])

      expect(result.effective_price_cents).toBe(pylon - expectedDiscount)
      expect(result.applied_programme_id).toBe(programmeId)
      expect(result.applied_discount_cents).toBe(expectedDiscount)
      expect(result.considered_programme_ids).toContain(programmeId)
    })
  }
})

// ── No programmes apply ───────────────────────────────────────────────────────

describe('computeEffective — zero programmes apply', () => {
  it('returns pylon unchanged when no enrolled programmes', () => {
    const result = computeEffective(188, 'ampol', 'U91', [])
    expect(result.effective_price_cents).toBe(188)
    expect(result.applied_programme_id).toBeNull()
    expect(result.applied_discount_cents).toBe(0)
    expect(result.considered_programme_ids).toHaveLength(0)
  })

  it('returns pylon unchanged when enrolled programmes do not match the brand', () => {
    const result = computeEffective(188, 'bp', 'U91', ['racq'])
    expect(result.effective_price_cents).toBe(188)
    expect(result.applied_programme_id).toBeNull()
    expect(result.applied_discount_cents).toBe(0)
  })

  it('returns pylon unchanged when enrolled programmes do not match the fuel type', () => {
    // RACQ only applies to standard fuels; use a custom registry entry with restricted fuels
    const prog = makeProgram({ id: 'test_prog', type: 'membership', eligible_fuel_types: ['U91'], eligible_brand_codes: ['ampol'] })
    const spy = spyRegistry([prog])
    const result = computeEffective(188, 'ampol', 'LPG', ['test_prog'])
    expect(result.effective_price_cents).toBe(188)
    expect(result.applied_programme_id).toBeNull()
    spy.mockRestore()
  })
})

// ── Brand unknown ─────────────────────────────────────────────────────────────

describe('computeEffective — brand "unknown"', () => {
  it('returns pylon unchanged, no programme applied', () => {
    const result = computeEffective(188, 'unknown', 'U91', ['racq'])
    expect(result.effective_price_cents).toBe(188)
    expect(result.applied_programme_id).toBeNull()
    expect(result.considered_programme_ids).toHaveLength(0)
  })
})

// ── Null pylon ────────────────────────────────────────────────────────────────

describe('computeEffective — null pylon', () => {
  it('returns null effective when pylon is null', () => {
    const result = computeEffective(null, 'ampol', 'U91', ['racq'])
    expect(result.effective_price_cents).toBeNull()
    expect(result.applied_programme_id).toBeNull()
    expect(result.applied_discount_cents).toBe(0)
  })
})

// ── Two programmes, different discounts ──────────────────────────────────────

describe('computeEffective — two programmes, different discounts', () => {
  it('picks the higher-discount programme', () => {
    const prog4 = makeProgram({ id: 'prog_4c', type: 'membership', discount_cents_per_litre: 4, eligible_brand_codes: ['eg_ampol'] })
    const prog6 = makeProgram({ id: 'prog_6c', type: 'rewards', discount_cents_per_litre: 6, eligible_brand_codes: ['eg_ampol'] })
    const spy = spyRegistry([prog4, prog6])

    const result = computeEffective(188, 'eg_ampol', 'U91', ['prog_4c', 'prog_6c'])
    expect(result.effective_price_cents).toBe(182)  // 188 - 6
    expect(result.applied_programme_id).toBe('prog_6c')
    expect(result.applied_discount_cents).toBe(6)
    expect(result.considered_programme_ids).toHaveLength(2)
    spy.mockRestore()
  })
})

// ── Tie-breaking: same discount, different specificity ───────────────────────

describe('computeEffective — tie-breaking by specificity', () => {
  it('picks the programme with fewer eligible brands (more specific)', () => {
    // broad: applies to 3 brands (less specific)
    const broad = makeProgram({
      id: 'broad_prog',
      type: 'membership',
      discount_cents_per_litre: 4,
      eligible_brand_codes: ['ampol', 'shell', 'bp'],
    })
    // narrow: applies to 1 brand (more specific)
    const narrow = makeProgram({
      id: 'narrow_prog',
      type: 'membership',
      discount_cents_per_litre: 4,
      eligible_brand_codes: ['ampol'],
    })
    const spy = spyRegistry([broad, narrow])

    const result = computeEffective(188, 'ampol', 'U91', ['broad_prog', 'narrow_prog'])
    expect(result.applied_programme_id).toBe('narrow_prog')
    spy.mockRestore()
  })
})

// ── Tie-breaking: same discount + same specificity → non-docket preferred ────

describe('computeEffective — tie-breaking: non-docket preferred over docket', () => {
  it('picks membership over docket when discount and specificity are equal', () => {
    const membership = makeProgram({
      id: 'test_membership',
      type: 'membership',
      discount_cents_per_litre: 4,
      eligible_brand_codes: ['eg_ampol'],
    })
    const docket = makeProgram({
      id: 'test_docket',
      type: 'docket',
      discount_cents_per_litre: 4,
      eligible_brand_codes: ['eg_ampol'],
    })
    const spy = spyRegistry([membership, docket])

    const result = computeEffective(188, 'eg_ampol', 'U91', ['test_membership', 'test_docket'])
    expect(result.applied_programme_id).toBe('test_membership')
    spy.mockRestore()
  })
})

// ── Tie-breaking: all else equal → lex order ────────────────────────────────

describe('computeEffective — tie-breaking: lexicographic on id', () => {
  it('picks the lexicographically first id when everything else is equal', () => {
    const aaa = makeProgram({ id: 'aaa_prog', type: 'rewards', discount_cents_per_litre: 4, eligible_brand_codes: ['shell'] })
    const zzz = makeProgram({ id: 'zzz_prog', type: 'rewards', discount_cents_per_litre: 4, eligible_brand_codes: ['shell'] })
    const spy = spyRegistry([zzz, aaa])  // deliberately shuffled order

    const result = computeEffective(188, 'shell', 'U91', ['aaa_prog', 'zzz_prog'])
    expect(result.applied_programme_id).toBe('aaa_prog')
    spy.mockRestore()
  })
})

// ── Stackable programmes ──────────────────────────────────────────────────────

describe('computeEffective — stackable + non-stackable', () => {
  it('adds stackable discount on top of best non-stackable', () => {
    const base = makeProgram({
      id: 'base_prog',
      type: 'membership',
      discount_cents_per_litre: 4,
      stackable: false,
      eligible_brand_codes: ['eg_ampol'],
    })
    const bonus = makeProgram({
      id: 'bonus_prog',
      type: 'rewards',
      discount_cents_per_litre: 2,
      stackable: true,  // override for this test
      eligible_brand_codes: ['eg_ampol'],
    })
    const spy = spyRegistry([base, bonus])

    const result = computeEffective(188, 'eg_ampol', 'U91', ['base_prog', 'bonus_prog'])
    // 188 - 4 (non-stack best) - 2 (stack bonus) = 182
    expect(result.effective_price_cents).toBe(182)
    expect(result.applied_discount_cents).toBe(6)
    // applied_programme_id is the non-stackable winner
    expect(result.applied_programme_id).toBe('base_prog')
    spy.mockRestore()
  })

  it('applies stackable-only discount when no non-stackable candidate exists', () => {
    const stackOnly = makeProgram({
      id: 'stack_only',
      type: 'rewards',
      discount_cents_per_litre: 3,
      stackable: true,
      eligible_brand_codes: ['bp'],
    })
    const spy = spyRegistry([stackOnly])

    const result = computeEffective(188, 'bp', 'U91', ['stack_only'])
    expect(result.effective_price_cents).toBe(185)
    expect(result.applied_discount_cents).toBe(3)
    spy.mockRestore()
  })
})

// ── Discount > pylon edge case ───────────────────────────────────────────────

describe('computeEffective — discount exceeds pylon', () => {
  it('clamps effective to zero and returns zero applied discount', () => {
    const bigDiscount = makeProgram({
      id: 'huge_discount',
      type: 'membership',
      discount_cents_per_litre: 500,  // absurd value
      eligible_brand_codes: ['ampol'],
    })
    const spy = spyRegistry([bigDiscount])

    const result = computeEffective(100, 'ampol', 'U91', ['huge_discount'])
    expect(result.effective_price_cents).toBe(100)  // clamped — no discount applied
    expect(result.applied_discount_cents).toBe(0)
    expect(result.applied_programme_id).toBeNull()
    spy.mockRestore()
  })
})

// ── Wildcard fuel type ────────────────────────────────────────────────────────

describe('computeEffective — wildcard fuel type "*"', () => {
  it('applies programme when eligible_fuel_types is ["*"]', () => {
    const wildcardProg = makeProgram({
      id: 'wildcard_prog',
      type: 'rewards',
      eligible_fuel_types: ['*'],
      eligible_brand_codes: ['ampol'],
    })
    const spy = spyRegistry([wildcardProg])

    const result = computeEffective(188, 'ampol', 'LPG', ['wildcard_prog'])
    expect(result.effective_price_cents).toBe(184)
    expect(result.applied_programme_id).toBe('wildcard_prog')
    spy.mockRestore()
  })

  it('applies programme for any numeric fuel type ID with wildcard', () => {
    const wildcardProg = makeProgram({
      id: 'wildcard_prog2',
      type: 'rewards',
      eligible_fuel_types: ['*'],
      eligible_brand_codes: ['shell'],
    })
    const spy = spyRegistry([wildcardProg])

    const result = computeEffective(200, 'shell', 52, ['wildcard_prog2'])
    expect(result.effective_price_cents).toBe(196)
    spy.mockRestore()
  })
})

// ── Fuel type excluded ────────────────────────────────────────────────────────

describe('computeEffective — fuel type excluded from programme', () => {
  it('does not apply when fuel type is not in eligible_fuel_types', () => {
    const result = computeEffective(188, 'seven_eleven', 'LPG', ['seven_eleven_fuel_app'])
    expect(result.effective_price_cents).toBe(188)
    expect(result.applied_programme_id).toBeNull()
  })
})

// ── considered_programme_ids includes all eligible ───────────────────────────

describe('computeEffective — considered_programme_ids', () => {
  it('includes all candidates regardless of which was applied', () => {
    const p1 = makeProgram({ id: 'prog_a', type: 'membership', discount_cents_per_litre: 6, eligible_brand_codes: ['ampol'] })
    const p2 = makeProgram({ id: 'prog_b', type: 'membership', discount_cents_per_litre: 4, eligible_brand_codes: ['ampol'] })
    const spy = spyRegistry([p1, p2])

    const result = computeEffective(188, 'ampol', 'U91', ['prog_a', 'prog_b'])
    expect(result.considered_programme_ids).toContain('prog_a')
    expect(result.considered_programme_ids).toContain('prog_b')
    expect(result.applied_programme_id).toBe('prog_a')
    spy.mockRestore()
  })

  it('is empty when no programmes are enrolled', () => {
    const result = computeEffective(188, 'ampol', 'U91', [])
    expect(result.considered_programme_ids).toHaveLength(0)
  })
})
