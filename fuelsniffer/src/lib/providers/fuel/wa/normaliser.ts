/**
 * WA FuelWatch normalisation.
 *
 * Key concern: T+1 valid_from computation.
 * Under the WA Petroleum Products Pricing Amendment Act 2007, retailers notify
 * FuelWatch of tomorrow's prices by 14:00 WST. Prices become effective at 06:00 WST
 * the following day.
 *
 * valid_from is UTC: 06:00 WST = UTC+8, so 06:00 WST = 22:00 UTC of the preceding day.
 * Example: date='2026-04-25' → valid_from = 2026-04-24T22:00:00.000Z
 */
import { normaliseBrand } from '../brand-normaliser'
import type { FuelWatchSite, FuelWatchPrice } from './client'
import type { NormalisedStation, NormalisedPrice } from '../index'

// ── Fuel type mapping (WA codes → canonical IDs) ──────────────────────────────

export const WA_FUEL_MAP: Record<string, number> = {
  'ULP':          2,   // Unleaded — WA name for U91
  'PULP':         5,   // Premium Unleaded — WA name for P95
  '98RON':        8,
  'Diesel':       3,
  'LPG':          4,
  'B20':          20,
  'E85':          19,
  'Brand diesel': 14,  // Brand/Premium Diesel
  'PDL':          14,
}

// ── T+1 valid_from computation ─────────────────────────────────────────────────

/**
 * Convert a WA effective date string (YYYY-MM-DD) to the UTC timestamp when
 * prices for that date become effective: 06:00 WST = 22:00 UTC of the preceding day.
 *
 * Example: '2026-04-25' → 2026-04-24T22:00:00.000Z
 */
export function waDateToValidFrom(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  // 06:00 WST (UTC+8) on `dateStr` = 22:00 UTC on the day before
  return new Date(Date.UTC(year, month - 1, day - 1, 22, 0, 0))
}

// ── Station normaliser ────────────────────────────────────────────────────────

export function normaliseWaStation(
  site: FuelWatchSite,
  idCounter: () => number
): NormalisedStation {
  const lat = typeof site.latitude  === 'string' ? parseFloat(site.latitude)  : (site.latitude  ?? 0)
  const lng = typeof site.longitude === 'string' ? parseFloat(site.longitude) : (site.longitude ?? 0)

  return {
    id:             idCounter(),
    externalId:     String(site.site_id),
    sourceProvider: 'wa',
    name:           site.name,
    brand:          normaliseBrand(site.brand ?? null),
    address:        site.address ?? null,
    // SP-1 §0 amendment: suburb MUST be lower-case
    suburb:         site.suburb ? site.suburb.toLowerCase() : null,
    postcode:       site.postcode ?? null,
    latitude:       lat,
    longitude:      lng,
    state:          'WA',
    jurisdiction:   'AU-WA',
    timezone:       'Australia/Perth',
    region:         null,
    sourceMetadata: null,
  }
}

// ── Price normaliser ──────────────────────────────────────────────────────────

export function normaliseWaPrice(
  price: FuelWatchPrice,
  stationIdMap: Map<string, number>,
  recordedAt: Date
): NormalisedPrice | null {
  const stationId = stationIdMap.get(String(price.site_id))
  if (stationId === undefined) return null

  const fuelTypeId = WA_FUEL_MAP[price.fuel_type]
  if (!fuelTypeId) return null

  const rawPrice = typeof price.price === 'string' ? parseFloat(price.price) : price.price
  if (isNaN(rawPrice) || rawPrice < 50 || rawPrice > 400) return null

  // T+1: if the price has a date field, compute valid_from as 06:00 WST of that date
  const validFrom = price.date ? waDateToValidFrom(price.date) : recordedAt

  return {
    stationId,
    fuelTypeId,
    priceCents:     rawPrice.toFixed(1),
    recordedAt,
    sourceTs:       recordedAt,
    sourceProvider: 'wa',
    validFrom,
  }
}
