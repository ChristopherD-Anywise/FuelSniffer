/**
 * Shared Zod validation schemas for API query parameters.
 *
 * All schemas use z.coerce so that string query params are coerced before
 * validation. Import these in API routes for consistent error messages and
 * boundary enforcement across the application.
 */
import { z } from 'zod'

/** Latitude: -90 to +90 */
export const latitudeSchema = z.coerce.number().min(-90).max(90)

/** Longitude: -180 to +180 */
export const longitudeSchema = z.coerce.number().min(-180).max(180)

/** Radius in km: 1–100, defaults to 10 */
export const radiusSchema = z.coerce.number().min(1).max(100).default(10)

/** Fuel type ID: integer 1–30 */
export const fuelTypeSchema = z.coerce.number().int().min(1).max(30)

/** Station ID: positive integer */
export const stationIdSchema = z.coerce.number().int().positive()

/** Search query string: 1–100 chars, trimmed. trim() runs first so min(1) validates the trimmed value. */
export const searchQuerySchema = z.string().trim().min(1).max(100)
