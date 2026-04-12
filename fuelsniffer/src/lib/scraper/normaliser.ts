import type { SiteDetails, SitePrice } from './client'
import type { NewPriceReading, NewStation } from '@/lib/db/schema'

// ── Price encoding ────────────────────────────────────────────────────────────

/**
 * Convert raw QLD API price integer to cents per litre.
 * QLD API returns integers where value/10 = cents per litre.
 * e.g. rawToPrice(1459) → 145.9 c/L
 *
 * CRITICAL CORRECTNESS TRAP: Never inline `raw / 10` — always use this function.
 * The range assertion catches encoding bugs before data reaches the database.
 */
export function rawToPrice(raw: number): number {
  const converted = raw / 10
  if (converted < 50 || converted > 400) {
    throw new Error(
      `rawToPrice: value ${converted} outside expected range 50–400 c/L (raw: ${raw}). ` +
      `Check QLD API price encoding. Expected raw values in range 500–4000.`
    )
  }
  return converted
}

// ── Timezone conversion ───────────────────────────────────────────────────────

/**
 * Convert a UTC ISO timestamp to Brisbane local hour (0–23).
 * Brisbane is permanently UTC+10 (Australia/Brisbane — no DST).
 * NEVER use Australia/Sydney — Sydney observes DST and shifts to UTC+11 in summer.
 *
 * Uses Intl.DateTimeFormat with explicit timeZone: 'Australia/Brisbane'.
 * This is correct regardless of the host server's TZ setting.
 */
export function toBrisbaneHour(utcIso: string): number {
  const date = new Date(utcIso)
  const hour = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    hour: 'numeric',
    hour12: false,
  }).format(date)
  return parseInt(hour, 10)
}

/**
 * Convert a UTC Date or ISO string to a Date anchored at the Brisbane wall-clock time.
 * Use this when constructing `recorded_at` timestamps that will display in local time.
 */
export function toUtcDate(isoString: string): Date {
  return new Date(isoString)
}

// ── API response normalisation ────────────────────────────────────────────────

/**
 * Extract suburb from a QLD API address string.
 * The Direct API has no suburb field, but the address usually ends with
 * "SUBURB_NAME QLD POSTCODE" or "SUBURB_NAME, QLD POSTCODE".
 * We extract the suburb by taking the token(s) before "QLD" if present,
 * otherwise fall back to the second-to-last comma-delimited segment.
 */
export function extractSuburb(address: string | null): string | null {
  if (!address) return null
  // Match "... SUBURB QLD POSTCODE" or "... SUBURB, QLD POSTCODE"
  const m = address.match(/,\s*([^,]+?)\s*,?\s*QLD\b/i)
  if (m) return m[1].trim()
  // Fallback: second segment of comma-split (e.g. "123 Main St, NORTH LAKES, 4509")
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2] || null
  return null
}

/**
 * Convert a normalised SiteDetails record to a NewStation domain object.
 * Suburb is extracted from the address string since the Direct API has no suburb field.
 */
export function normaliseStation(site: SiteDetails): NewStation {
  return {
    id:         site.SiteId,
    name:       site.Name,
    brand:      site.Brand ?? null,
    address:    site.Address ?? null,
    suburb:     extractSuburb(site.Address ?? null),
    postcode:   site.Postcode ?? null,
    latitude:   site.Lat,
    longitude:  site.Lng,
    isActive:   true,
    lastSeenAt: new Date(),
  }
}

/**
 * Convert a raw QLD API SitePrice record to a NewPriceReading domain object.
 * Returns null if the price encoding is invalid (rawToPrice throws).
 *
 * D-09 (locked): Caller is responsible for always inserting a row — this function
 * does not check whether the price changed. The row is always returned.
 */
export function normalisePrice(
  sitePrice: SitePrice,
  recordedAt: Date
): NewPriceReading | null {
  try {
    const priceCents = rawToPrice(sitePrice.Price).toFixed(1)
    return {
      recordedAt,
      stationId:   sitePrice.SiteId,
      fuelTypeId:  sitePrice.FuelId,
      priceCents:  priceCents,
      sourceTs:    new Date(sitePrice.TransactionDateUtc),
    }
  } catch (err) {
    console.error(
      `[normaliser] Skipping invalid price: SiteId=${sitePrice.SiteId} ` +
      `FuelId=${sitePrice.FuelId} Price=${sitePrice.Price}`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}
