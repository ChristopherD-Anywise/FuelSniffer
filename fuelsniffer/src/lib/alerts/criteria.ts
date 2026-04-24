/**
 * SP-5 Alerts — Zod validation schemas for criteria_json shapes.
 *
 * Each alert type has a strict schema (no extra keys allowed).
 * Used at API create/update time and in the evaluator.
 */
import { z } from 'zod'

const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const PriceThresholdCriteria = z.object({
  fuel_type_id:    z.number().int().positive(),
  centre:          LatLng,
  radius_km:       z.number().positive().max(100),
  max_price_cents: z.number().positive(),
}).strict()

export const CycleLowCriteria = z.object({
  suburb_key:   z.string().min(1),   // lower(suburb)|lower(state) e.g. 'chermside|qld'
  fuel_type_id: z.number().int().positive(),
}).strict()

export const FavouriteDropCriteria = z.object({
  station_id:      z.number().int().positive(),
  fuel_type_id:    z.number().int().positive(),
  min_drop_cents:  z.number().positive(),
  window_minutes:  z.number().int().positive().max(1440), // max 24h window
}).strict()

export const WeeklyDigestCriteria = z.object({
  centre:       LatLng,
  radius_km:    z.number().positive().max(100),
  fuel_type_id: z.number().int().positive(),
}).strict()

export type PriceThresholdCriteria = z.infer<typeof PriceThresholdCriteria>
export type CycleLowCriteria       = z.infer<typeof CycleLowCriteria>
export type FavouriteDropCriteria  = z.infer<typeof FavouriteDropCriteria>
export type WeeklyDigestCriteria   = z.infer<typeof WeeklyDigestCriteria>

export type AnyCriteria =
  | PriceThresholdCriteria
  | CycleLowCriteria
  | FavouriteDropCriteria
  | WeeklyDigestCriteria

import type { AlertType } from './types'

const schemaByType = {
  price_threshold: PriceThresholdCriteria,
  cycle_low:       CycleLowCriteria,
  favourite_drop:  FavouriteDropCriteria,
  weekly_digest:   WeeklyDigestCriteria,
} as const

/**
 * Validate and parse criteria_json for the given alert type.
 * Returns { success, data } or { success: false, error }.
 */
export function validateCriteria(
  type: AlertType,
  raw: unknown
): { success: true; data: AnyCriteria } | { success: false; error: string } {
  const schema = schemaByType[type]
  if (!schema) {
    return { success: false, error: `Unknown alert type: ${type}` }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    return { success: false, error: result.error.message }
  }
  return { success: true, data: result.data as AnyCriteria }
}
