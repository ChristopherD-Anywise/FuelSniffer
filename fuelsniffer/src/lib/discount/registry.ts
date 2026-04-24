/**
 * SP-6 True-Cost Prices — Programme registry loader and brand resolver.
 *
 * Loads programmes.json and brand-aliases.json at module init.
 * Hard-fails on schema validation error (no silent fallback).
 *
 * All exports are synchronous after module load.
 * The registry is read-only; changes require a redeploy.
 */

import { z } from 'zod'
import programmesRaw from './programmes.json'
import brandAliasesRaw from './brand-aliases.json'

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ProgrammeTypeSchema = z.enum(['membership', 'docket', 'rewards'])

export const ProgrammeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ProgrammeTypeSchema,
  eligible_brand_codes: z.array(z.string().min(1)),
  eligible_fuel_types: z.array(z.string().min(1)),
  discount_cents_per_litre: z.number().int().positive(),
  stackable: z.boolean(),
  conditions_text: z.string().min(1),
  source_url: z.string().url(),
  last_verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  verified_by: z.string().min(1),
  notes: z.string().nullable().optional(),
})

export type Programme = z.infer<typeof ProgrammeSchema>
export type ProgrammeType = z.infer<typeof ProgrammeTypeSchema>

const ProgrammesRegistrySchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string(),
  description: z.string().optional(),
  programmes: z.array(ProgrammeSchema),
})

const CanonicalBrandSchema = z.object({
  code: z.string().min(1),
  display: z.string().min(1),
  aliases: z.array(z.string().min(1)),
})

const BrandAliasesSchema = z.object({
  schema_version: z.literal(1),
  description: z.string().optional(),
  canonical_brands: z.array(CanonicalBrandSchema),
})

// ── Load + validate at module init ────────────────────────────────────────────

let _programmes: Programme[] | null = null
let _aliasMap: Map<string, string> | null = null  // normalised-alias → canonical-code
let _canonicalCodes: Set<string> | null = null

function normalise(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    // collapse multiple spaces / tabs to single space
    .replace(/\s+/g, ' ')
    // strip common punctuation that varies in brand names
    .replace(/[.,\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function initRegistry(): void {
  // Validate programmes.json
  const programmesResult = ProgrammesRegistrySchema.safeParse(programmesRaw)
  if (!programmesResult.success) {
    throw new Error(
      `[SP-6] programmes.json failed Zod validation:\n${programmesResult.error.message}`
    )
  }

  // Check id uniqueness
  const ids = programmesResult.data.programmes.map(p => p.id)
  const idSet = new Set(ids)
  if (idSet.size !== ids.length) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    throw new Error(`[SP-6] programmes.json has duplicate ids: ${dupes.join(', ')}`)
  }

  // Validate brand-aliases.json
  const aliasesResult = BrandAliasesSchema.safeParse(brandAliasesRaw)
  if (!aliasesResult.success) {
    throw new Error(
      `[SP-6] brand-aliases.json failed Zod validation:\n${aliasesResult.error.message}`
    )
  }

  // Build alias → canonical-code map
  const aliasMap = new Map<string, string>()
  const canonicalCodes = new Set<string>()

  for (const brand of aliasesResult.data.canonical_brands) {
    canonicalCodes.add(brand.code)
    for (const alias of brand.aliases) {
      const normalised = normalise(alias)
      if (aliasMap.has(normalised)) {
        throw new Error(
          `[SP-6] brand-aliases.json: duplicate alias "${alias}" (normalised: "${normalised}") for brand "${brand.code}"`
        )
      }
      aliasMap.set(normalised, brand.code)
    }
  }

  // Validate that all eligible_brand_codes in programmes exist as canonical codes
  for (const prog of programmesResult.data.programmes) {
    for (const code of prog.eligible_brand_codes) {
      if (!canonicalCodes.has(code)) {
        throw new Error(
          `[SP-6] programmes.json: programme "${prog.id}" references unknown brand code "${code}". ` +
          `Add it to brand-aliases.json canonical_brands first.`
        )
      }
    }
  }

  _programmes = programmesResult.data.programmes
  _aliasMap = aliasMap
  _canonicalCodes = canonicalCodes
}

// Eagerly initialise — throw at startup, not at first request.
try {
  initRegistry()
} catch (err) {
  // In test environments, rethrow so tests can catch it.
  // In production, this kills the server at boot — intentional.
  throw err
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the list of all programmes in the registry.
 * Throws if the registry failed to load (should have thrown at module init).
 */
export function getRegistry(): Programme[] {
  if (!_programmes) throw new Error('[SP-6] Registry not initialised')
  return _programmes
}

/**
 * Returns the set of all canonical brand codes.
 */
export function getCanonicalCodes(): Set<string> {
  if (!_canonicalCodes) throw new Error('[SP-6] Registry not initialised')
  return _canonicalCodes
}

/**
 * Resolve a raw brand string (from stations.brand) to a canonical brand code.
 *
 * Algorithm:
 *  1. Normalise: trim, lowercase, collapse whitespace, strip punctuation
 *  2. Exact match against alias map
 *  3. Prefix match: try each known alias as prefix (longest match wins)
 *  4. On miss: return "unknown"
 *     Callers are responsible for logging to unknown_brand_log if desired.
 *
 * @param rawBrand - The raw brand string from the stations table. May be null.
 * @returns canonical brand code, or "unknown" if unmatched.
 */
export function resolveBrandCode(rawBrand: string | null | undefined): string {
  if (!rawBrand) return 'unknown'
  if (!_aliasMap) throw new Error('[SP-6] Registry not initialised')

  const norm = normalise(rawBrand)
  if (!norm) return 'unknown'

  // Exact match
  const exact = _aliasMap.get(norm)
  if (exact) return exact

  // Prefix match — find longest alias that is a prefix of the normalised brand
  let bestMatch: string | null = null
  let bestLength = 0
  for (const [alias, code] of _aliasMap.entries()) {
    if (norm.startsWith(alias) && alias.length > bestLength) {
      bestMatch = code
      bestLength = alias.length
    }
  }
  if (bestMatch) return bestMatch

  return 'unknown'
}
