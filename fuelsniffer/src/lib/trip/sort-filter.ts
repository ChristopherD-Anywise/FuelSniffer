/**
 * SP-7 — Trip Planner sort and filter utilities.
 *
 * Pure functions — no side effects, easy to unit test.
 * All functions are safe to call with empty arrays.
 */

import type { CorridorStation } from './corridor-query'
import type { SignalState } from '@/lib/cycle/types'

export type TripSortKey = 'effective_price' | 'detour_minutes' | 'verdict'

export interface TripFilterState {
  brands: string[]         // empty = all brands
  verdict: SignalState | null  // null = any verdict
}

/** Map verdict state to a sort priority (lower = better). */
const VERDICT_PRIORITY: Record<string, number> = {
  FILL_NOW:      0,
  HOLD:          1,
  WAIT_FOR_DROP: 2,
  UNCERTAIN:     3,
}

function verdictPriority(state: string | undefined | null): number {
  if (state == null) return 4
  return VERDICT_PRIORITY[state] ?? 3
}

/** Effective price for sorting: falls back to pylon if no effective price. */
function effectivePrice(s: CorridorStation): number {
  return s.effectivePriceCents ?? s.priceCents
}

/**
 * Sort a copy of the stations array by the given sort key.
 * Ties in effective_price sort are broken by detour distance.
 * Does not mutate the input.
 */
export function sortStations(
  stations: CorridorStation[],
  sort: TripSortKey,
): CorridorStation[] {
  const copy = [...stations]
  switch (sort) {
    case 'effective_price':
      return copy.sort((a, b) => {
        const priceDiff = effectivePrice(a) - effectivePrice(b)
        if (priceDiff !== 0) return priceDiff
        return a.detourMeters - b.detourMeters
      })

    case 'detour_minutes':
      return copy.sort((a, b) => {
        const detourDiff = a.detourMeters - b.detourMeters
        if (detourDiff !== 0) return detourDiff
        return effectivePrice(a) - effectivePrice(b)
      })

    case 'verdict':
      return copy.sort((a, b) => {
        const vDiff = verdictPriority(a.verdict?.state) - verdictPriority(b.verdict?.state)
        if (vDiff !== 0) return vDiff
        return effectivePrice(a) - effectivePrice(b)
      })

    default:
      return copy
  }
}

/**
 * Filter stations by brand multi-select and verdict state.
 * Empty brands array = no brand filter (return all).
 * Null verdict = no verdict filter (return all).
 */
export function filterStations(
  stations: CorridorStation[],
  filters: TripFilterState,
): CorridorStation[] {
  return stations.filter(s => {
    if (filters.brands.length > 0) {
      const brand = s.brand ?? 'Independent'
      if (!filters.brands.includes(brand)) return false
    }
    if (filters.verdict !== null) {
      if (s.verdict?.state !== filters.verdict) return false
    }
    return true
  })
}

/**
 * Compute the "save $X" callout for a single station.
 *
 * @param stationEffective - effective price of this station (c/L)
 * @param worstEffective   - effective price of the most expensive station (c/L)
 * @param tankSizeLitres   - user's tank size preference
 * @returns saving in dollars, or null if saving < $0.50
 */
export function computeSaving(
  stationEffective: number,
  worstEffective: number,
  tankSizeLitres: number,
): number | null {
  const savingCents = (worstEffective - stationEffective) * tankSizeLitres
  const savingDollars = savingCents / 100
  return savingDollars >= 0.50 ? savingDollars : null
}

/**
 * Compute total trip fuel cost for a given station.
 *
 * @param tripDistanceKm  - distance of the trip
 * @param efficiencyL100  - vehicle fuel efficiency (L/100km)
 * @param tankSizeLitres  - tank size cap
 * @param effectiveCents  - effective price for this station (c/L)
 * @returns cost in dollars
 */
export function computeTripCost(
  tripDistanceKm: number,
  efficiencyL100: number,
  tankSizeLitres: number,
  effectiveCents: number,
): number {
  const fuelNeeded = Math.min(tripDistanceKm * efficiencyL100 / 100, tankSizeLitres)
  return (fuelNeeded * effectiveCents) / 100
}
