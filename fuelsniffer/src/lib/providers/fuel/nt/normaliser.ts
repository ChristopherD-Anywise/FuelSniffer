/**
 * NT MyFuel normalisation (best-guess, mirrors NSW/TAS shape).
 * Confirm against actual API response once Q4 is resolved.
 */
import { normaliseBrand } from '../brand-normaliser'
import type { NtSite, NtPrice } from './client'
import type { NormalisedStation, NormalisedPrice } from '../index'

// ── Fuel type mapping (NT best-guess codes → canonical IDs) ──────────────────

export const NT_FUEL_MAP: Record<string, number> = {
  'U91':            2,
  'Unleaded':       2,
  'U95':            5,
  'PULP':           5,
  'U98':            8,
  'Diesel':         3,
  'DL':             3,
  'LPG':            4,
  'Premium Diesel': 14,
  'PDL':            14,
  'E10':            12,
}

// ── Station normaliser ────────────────────────────────────────────────────────

export function normaliseNtStation(
  site: NtSite,
  idCounter: () => number
): NormalisedStation {
  return {
    id:             idCounter(),
    externalId:     String(site.siteId),
    sourceProvider: 'nt',
    name:           site.name,
    brand:          normaliseBrand(site.brand ?? null),
    address:        site.address ?? null,
    // SP-1 §0 amendment: suburb MUST be lower-case
    suburb:         site.suburb ? site.suburb.toLowerCase() : null,
    postcode:       site.postcode ?? null,
    latitude:       site.latitude  ?? 0,
    longitude:      site.longitude ?? 0,
    state:          'NT',
    jurisdiction:   'AU-NT',
    timezone:       'Australia/Darwin',
    region:         null,
    sourceMetadata: null,
  }
}

// ── Price normaliser ──────────────────────────────────────────────────────────

export function normaliseNtPrice(
  price: NtPrice,
  stationIdMap: Map<string, number>,
  recordedAt: Date
): NormalisedPrice | null {
  const stationId = stationIdMap.get(String(price.siteId))
  if (stationId === undefined) return null

  const fuelTypeId = NT_FUEL_MAP[price.fuelType]
  if (!fuelTypeId) return null

  if (price.price < 50 || price.price > 400) return null

  return {
    stationId,
    fuelTypeId,
    priceCents:     price.price.toFixed(1),
    recordedAt,
    sourceTs:       price.updatedAt ? new Date(price.updatedAt) : recordedAt,
    sourceProvider: 'nt',
  }
}
