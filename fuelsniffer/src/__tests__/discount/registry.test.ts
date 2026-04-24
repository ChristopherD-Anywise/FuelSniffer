/**
 * SP-6 — Registry validation tests.
 *
 * Validates the static JSON files against structural invariants.
 * These tests fail CI if the registry is malformed.
 */

import { describe, it, expect } from 'vitest'
import { getRegistry, getCanonicalCodes, resolveBrandCode, ProgrammeSchema } from '@/lib/discount/registry'
import programmesRaw from '@/lib/discount/programmes.json'
import brandAliasesRaw from '@/lib/discount/brand-aliases.json'
import { z } from 'zod'

// ── Schema validation ─────────────────────────────────────────────────────────

describe('programmes.json — Zod schema', () => {
  it('has schema_version: 1', () => {
    expect(programmesRaw.schema_version).toBe(1)
  })

  it('every programme passes the ProgrammeSchema', () => {
    for (const prog of programmesRaw.programmes) {
      const result = ProgrammeSchema.safeParse(prog)
      if (!result.success) {
        throw new Error(`Programme "${prog.id}" failed schema: ${result.error.message}`)
      }
    }
  })
})

// ── ID uniqueness ─────────────────────────────────────────────────────────────

describe('programmes.json — id uniqueness', () => {
  it('all programme ids are unique', () => {
    const ids = programmesRaw.programmes.map(p => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})

// ── Required fields ───────────────────────────────────────────────────────────

describe('programmes.json — required fields', () => {
  for (const prog of programmesRaw.programmes) {
    it(`"${prog.id}" has source_url`, () => {
      expect(prog.source_url).toBeTruthy()
      expect(prog.source_url.startsWith('http')).toBe(true)
    })

    it(`"${prog.id}" has last_verified_at (YYYY-MM-DD)`, () => {
      expect(prog.last_verified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it(`"${prog.id}" has conditions_text`, () => {
      expect(prog.conditions_text.length).toBeGreaterThan(10)
    })
  }
})

// ── Brand code integrity ──────────────────────────────────────────────────────

describe('programmes.json — eligible_brand_codes integrity', () => {
  it('all eligible_brand_codes reference known canonical codes', () => {
    const canonicalCodes = getCanonicalCodes()
    for (const prog of programmesRaw.programmes) {
      for (const code of prog.eligible_brand_codes) {
        expect(
          canonicalCodes.has(code),
          `Programme "${prog.id}" references unknown brand code "${code}"`
        ).toBe(true)
      }
    }
  })
})

// ── Discount sanity ───────────────────────────────────────────────────────────

describe('programmes.json — discount sanity', () => {
  it('all discount_cents_per_litre are positive integers ≤ 50', () => {
    for (const prog of programmesRaw.programmes) {
      expect(Number.isInteger(prog.discount_cents_per_litre)).toBe(true)
      expect(prog.discount_cents_per_litre).toBeGreaterThan(0)
      expect(prog.discount_cents_per_litre).toBeLessThanOrEqual(50)
    }
  })

  it('all v1 programmes have stackable: false', () => {
    for (const prog of programmesRaw.programmes) {
      expect(prog.stackable, `Programme "${prog.id}" should have stackable: false in v1`).toBe(false)
    }
  })
})

// ── brand-aliases.json validation ─────────────────────────────────────────────

describe('brand-aliases.json — structure', () => {
  it('has schema_version: 1', () => {
    expect(brandAliasesRaw.schema_version).toBe(1)
  })

  it('all canonical codes are non-empty strings', () => {
    for (const brand of brandAliasesRaw.canonical_brands) {
      expect(brand.code).toBeTruthy()
      expect(brand.code).not.toContain(' ')  // codes should be snake_case, no spaces
    }
  })

  it('all aliases are lowercased', () => {
    for (const brand of brandAliasesRaw.canonical_brands) {
      for (const alias of brand.aliases) {
        expect(alias, `Alias "${alias}" should be lowercase`).toBe(alias.toLowerCase())
      }
    }
  })

  it('no duplicate aliases across all brands', () => {
    const seen = new Map<string, string>()
    for (const brand of brandAliasesRaw.canonical_brands) {
      for (const alias of brand.aliases) {
        expect(
          seen.has(alias),
          `Alias "${alias}" appears in both "${seen.get(alias)}" and "${brand.code}"`
        ).toBe(false)
        seen.set(alias, brand.code)
      }
    }
  })
})

// ── getRegistry ───────────────────────────────────────────────────────────────

describe('getRegistry()', () => {
  it('returns all 12 v1 programmes', () => {
    const progs = getRegistry()
    expect(progs.length).toBe(12)
  })

  it('returns programmes with the expected IDs', () => {
    const ids = getRegistry().map(p => p.id)
    const expectedIds = [
      'seven_eleven_fuel_app',
      'racq', 'nrma', 'racv', 'raa', 'rac_wa', 'ract',
      'woolworths_docket', 'coles_docket',
      'shell_vpower_rewards', 'eg_ampolcash', 'united_convenience',
    ]
    for (const id of expectedIds) {
      expect(ids, `Expected programme id "${id}" in registry`).toContain(id)
    }
  })
})
