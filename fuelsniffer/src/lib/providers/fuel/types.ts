/**
 * SP-1 extended provider types.
 *
 * These additions extend the base FuelPriceProvider contract for national
 * adapters. All new fields are optional so existing QLD code compiles unchanged.
 */

/** Canonical jurisdiction codes used across all providers. */
export type Jurisdiction =
  | 'AU-QLD'
  | 'AU-NSW'
  | 'AU-WA'
  | 'AU-NT'
  | 'AU-TAS'
  | 'AU-ACT'

/**
 * Extended NormalisedStation fields added in SP-1.
 * The base `NormalisedStation` in index.ts keeps `state` and `suburb`
 * as plain strings. These optional additions carry SP-1 metadata.
 */
export interface StationJurisdictionFields {
  /** Two/three-letter state code: QLD, NSW, WA, NT, TAS, ACT */
  state?: string
  /** LGA / district where the source provides one */
  region?: string | null
  /** Canonical jurisdiction code, e.g. AU-NSW */
  jurisdiction?: Jurisdiction
  /** IANA timezone string, e.g. Australia/Sydney */
  timezone?: string
  /** Raw provider blob for debugging / future enrichment */
  sourceMetadata?: Record<string, unknown> | null
}

/**
 * WA T+1 extension for NormalisedPrice.
 * For all non-WA providers: validFrom = sourceTs = recordedAt (effectively).
 * For WA: validFrom = upstream "PriceUpdatedFrom" (06:00 WST of effective day).
 */
export interface PriceValidFromField {
  /** When this price becomes (or became) effective. Defaults to recordedAt if omitted. */
  validFrom?: Date
}

/**
 * Per-provider schedule declaration.
 * The scheduler uses this to register a separate cron.schedule() per provider.
 */
export interface ProviderSchedule {
  /** node-cron cron expression */
  cron: string
  /** IANA timezone for the cron expression */
  timezone: string
}

/**
 * Canonical fuel type vocabulary.
 * Maps provider-specific codes to Fillip's canonical IDs.
 * QLD uses integer FuelId codes; NSW/WA/NT/TAS use string codes.
 */
export interface CanonicalFuelType {
  id: number
  code: string
  displayName: string
}

/**
 * Fuel type mapping for a provider.
 * Each provider supplies a map from its upstream code/id to a canonical FuelType id.
 */
export type FuelTypeMap = Map<string | number, number>
