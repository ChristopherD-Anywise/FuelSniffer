import data from './qld-postcodes.json'

const lookup = data as Record<string, string>

/**
 * Return the primary suburb name for a QLD postcode, or null if unknown.
 * Data sourced from Australia Post's public postcode dataset (QLD subset).
 */
export function postcodeToSuburb(postcode: string | null): string | null {
  if (!postcode) return null
  return lookup[postcode] ?? null
}
