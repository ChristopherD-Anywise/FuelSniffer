/**
 * Shared FuelCheck normalisation helpers.
 * Both NSW and TAS adapters use these, passing state-specific overrides.
 */
import { normaliseBrand } from '../brand-normaliser'
import type { FuelCheckSite, FuelCheckPrice } from './client'
import type { NormalisedStation, NormalisedPrice } from '../index'
import type { Jurisdiction } from '../types'

// ── Fuel type mapping ─────────────────────────────────────────────────────────

/**
 * FuelCheck string code → canonical fuel_type_id
 * Canonical IDs defined in migration 0013.
 */
export const FUELCHECK_FUEL_MAP: Record<string, number> = {
  'U91':   2,
  'ULP':   2,    // WA alias for U91
  'DL':    3,
  'LPG':   4,
  'P95':   5,
  'PULP':  5,    // WA "Premium Unleaded"
  'P98':   8,
  '98RON': 8,    // WA alias
  'E10':   12,
  'PDL':   14,   // Premium Diesel
  'B20':   20,
  'E85':   19,
  // EV intentionally omitted for v1
}

// ── ACT postcode classification ────────────────────────────────────────────────

/**
 * Classify a station as ACT by postcode when the API state field is absent or ambiguous.
 * ACT postcode ranges: 0200-0299 (ANU area), 2600-2620 (inner Canberra), 2900-2920 (Tuggeranong).
 */
export function classifyActByPostcode(postcode: string | undefined): boolean {
  if (!postcode) return false
  const n = parseInt(postcode, 10)
  if (isNaN(n)) return false
  return (n >= 200 && n <= 299) || (n >= 2600 && n <= 2620) || (n >= 2900 && n <= 2920)
}

export function resolveState(
  apiState: string | undefined,
  postcode: string | undefined,
  defaultState: string
): { state: string; jurisdiction: Jurisdiction; timezone: string } {
  const st = (apiState ?? '').toUpperCase().trim()

  if (st === 'ACT' || (!st && classifyActByPostcode(postcode))) {
    return { state: 'ACT', jurisdiction: 'AU-ACT', timezone: 'Australia/Sydney' }
  }
  if (st === 'NSW' || defaultState === 'NSW') {
    return { state: 'NSW', jurisdiction: 'AU-NSW', timezone: 'Australia/Sydney' }
  }
  if (st === 'TAS' || defaultState === 'TAS') {
    return { state: 'TAS', jurisdiction: 'AU-TAS', timezone: 'Australia/Hobart' }
  }
  // Fallback — use the caller's default
  return {
    state:        defaultState,
    jurisdiction: `AU-${defaultState}` as Jurisdiction,
    timezone:     'Australia/Brisbane',
  }
}

// ── Station normaliser ────────────────────────────────────────────────────────

export function normaliseFuelCheckStation(
  site: FuelCheckSite,
  sourceProvider: string,
  defaultState: string,
  idCounter: () => number
): NormalisedStation {
  const { state, jurisdiction, timezone } = resolveState(site.state, site.postcode, defaultState)

  return {
    id:             idCounter(),
    externalId:     site.stationCode,
    sourceProvider,
    name:           site.serviceStationName,
    brand:          normaliseBrand(site.brand ?? null),
    address:        site.address ?? null,
    // SP-1 §0 amendment: suburb MUST be lower-case
    suburb:         site.suburb ? site.suburb.toLowerCase() : null,
    postcode:       site.postcode ?? null,
    latitude:       site.latitude,
    longitude:      site.longitude,
    state,
    jurisdiction,
    timezone,
    region:         null,
    sourceMetadata: null,
  }
}

// ── Price normaliser ──────────────────────────────────────────────────────────

export function normaliseFuelCheckPrice(
  price: FuelCheckPrice,
  stationIdMap: Map<string, number>,
  recordedAt: Date,
  sourceProvider: string
): NormalisedPrice | null {
  const stationId = stationIdMap.get(price.stationCode)
  if (stationId === undefined) return null

  const fuelTypeId = FUELCHECK_FUEL_MAP[price.fuelType]
  if (!fuelTypeId) return null

  // Validate price range 50–400 c/L
  if (price.price < 50 || price.price > 400) {
    console.warn(
      `[_fuelcheck] Price out of range: stationCode=${price.stationCode} ` +
      `fuelType=${price.fuelType} price=${price.price}`
    )
    return null
  }

  const tsRaw  = price.transactionDateutc ?? price.lastupdated
  const sourceTs = tsRaw ? new Date(tsRaw) : recordedAt

  return {
    stationId,
    fuelTypeId,
    priceCents:     price.price.toFixed(1),
    recordedAt,
    sourceTs,
    sourceProvider,
  }
}
