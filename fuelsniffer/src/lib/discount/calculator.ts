/**
 * SP-6 True-Cost Prices — Pure-function price calculator.
 *
 * computeEffective() is a pure function: no DB access, no side effects.
 * Callers are responsible for:
 *  - resolving the brand code (via resolveBrandCode())
 *  - providing enrolled programme IDs (from user_programmes table)
 *  - logging unknown brands to unknown_brand_log
 *
 * Stacking (§6.5): configurable via programme.stackable. All v1 programmes
 * have stackable:false. The mechanism is implemented and tested for future use.
 */

import { getRegistry, type Programme } from './registry'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EffectiveResult {
  /** Effective price in the same unit as pylonCents (e.g. cents/litre as a decimal). */
  effective_price_cents: number | null
  /** ID of the programme applied, or null if none. */
  applied_programme_id: string | null
  /** Display name of the programme applied, or null if none. */
  applied_programme_name: string | null
  /** Discount applied in cents/litre (0 when no programme applied). */
  applied_discount_cents: number
  /** All programme IDs that could apply (enrolled + eligible). */
  considered_programme_ids: string[]
}

// ── Tie-breaking helpers ──────────────────────────────────────────────────────

/**
 * Compare two candidate programmes to pick the better one.
 * Returns negative if a is better, positive if b is better, 0 if equal.
 *
 * Tie-breaking order (spec §6.4):
 *  1. Higher discount wins
 *  2. Fewer eligible_brand_codes = more specific (lower count wins)
 *  3. Non-docket preferred over docket
 *  4. Lexicographic on id (deterministic)
 */
function compareProgrammes(a: Programme, b: Programme): number {
  // 1. Higher discount is better
  const discountDiff = b.discount_cents_per_litre - a.discount_cents_per_litre
  if (discountDiff !== 0) return discountDiff

  // 2. Higher specificity (fewer brand codes) is better
  const specificityDiff = a.eligible_brand_codes.length - b.eligible_brand_codes.length
  if (specificityDiff !== 0) return specificityDiff

  // 3. Non-docket > docket
  const aDocket = a.type === 'docket' ? 1 : 0
  const bDocket = b.type === 'docket' ? 1 : 0
  const docketDiff = aDocket - bDocket
  if (docketDiff !== 0) return docketDiff

  // 4. Lexicographic on id
  return a.id.localeCompare(b.id)
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the effective price for a station given the user's enrolled programmes.
 *
 * @param pylonCents - The pylon (sign) price in cents/litre. May be null if stale.
 * @param brandCode  - Canonical brand code (from resolveBrandCode). "unknown" = no discount.
 * @param fuelTypeId - Fuel type identifier (e.g. "U91", "E10", or numeric ID as string/number).
 *                     Programmes with eligible_fuel_types: ["*"] match any fuel type.
 * @param enrolledIds - Array of programme IDs the user is enrolled in (not paused).
 *                      Pass [] for unauthenticated / no programmes.
 * @returns EffectiveResult with the best applicable discount applied.
 */
export function computeEffective(
  pylonCents: number | null,
  brandCode: string,
  fuelTypeId: string | number,
  enrolledIds: string[]
): EffectiveResult {
  const noDiscount: EffectiveResult = {
    effective_price_cents: pylonCents,
    applied_programme_id: null,
    applied_programme_name: null,
    applied_discount_cents: 0,
    considered_programme_ids: [],
  }

  // Edge case: null pylon
  if (pylonCents === null) {
    return {
      effective_price_cents: null,
      applied_programme_id: null,
      applied_programme_name: null,
      applied_discount_cents: 0,
      considered_programme_ids: [],
    }
  }

  // Edge case: no enrolled programmes
  if (enrolledIds.length === 0) return noDiscount

  // Edge case: unknown brand — no discount, but still return valid object
  if (brandCode === 'unknown') return noDiscount

  const fuelId = String(fuelTypeId)
  const registry = getRegistry()
  const enrolledSet = new Set(enrolledIds)

  // Filter: enrolled ∩ eligible_brand_codes ∩ eligible_fuel_types
  const candidates: Programme[] = registry.filter(p => {
    if (!enrolledSet.has(p.id)) return false
    if (!p.eligible_brand_codes.includes(brandCode)) return false
    if (
      !p.eligible_fuel_types.includes('*') &&
      !p.eligible_fuel_types.includes(fuelId)
    ) return false
    return true
  })

  if (candidates.length === 0) return noDiscount

  const consideredIds = candidates.map(c => c.id)

  // Separate stackable and non-stackable candidates
  const nonStackable = candidates.filter(p => !p.stackable)
  const stackable = candidates.filter(p => p.stackable)

  // Pick the best non-stackable programme (highest discount, tie-broken per spec §6.4)
  let totalDiscount = 0
  let appliedProgramme: Programme | null = null

  if (nonStackable.length > 0) {
    const best = nonStackable.sort(compareProgrammes)[0]
    totalDiscount += best.discount_cents_per_litre
    appliedProgramme = best
  }

  // Add stackable discounts on top (spec §6.5)
  for (const prog of stackable) {
    totalDiscount += prog.discount_cents_per_litre
  }

  // Edge case: discount > pylon — clamp to 0 (defensive per spec §6.6)
  if (totalDiscount > pylonCents) {
    console.warn(
      `[SP-6 calculator] Discount ${totalDiscount}¢ > pylon ${pylonCents}¢ for brand "${brandCode}" ` +
      `fuel "${fuelId}" programme "${appliedProgramme?.id}". Clamping to 0.`
    )
    totalDiscount = 0
    appliedProgramme = null
  }

  const effective = pylonCents - totalDiscount

  return {
    effective_price_cents: effective,
    applied_programme_id: appliedProgramme?.id ?? null,
    applied_programme_name: appliedProgramme?.name ?? null,
    applied_discount_cents: totalDiscount,
    considered_programme_ids: consideredIds,
  }
}
