/**
 * HMAC signing + content-addressed hash for SP-8 share cards.
 *
 * signParams:      HMAC-SHA256 over canonical sorted query params
 * verifyParams:    constant-time comparison to prevent timing attacks
 * computeCardHash: sha256 cache key for a rendered card
 *
 * Uses SHARE_SIGNING_SECRET env var. Falls back to empty string (dev only —
 * will produce deterministic but effectively unsigned URLs).
 */
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

function getSecret(): string {
  return process.env.SHARE_SIGNING_SECRET ?? ''
}

/**
 * Sign a set of query params with HMAC-SHA256.
 * Returns 22-char base64url string (16 bytes of sig).
 * Params are sorted canonically so order doesn't matter.
 */
export function signParams(params: Record<string, string>): string {
  const canonical = new URLSearchParams(
    Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
  ).toString()
  return createHmac('sha256', getSecret())
    .update(canonical)
    .digest('base64url')
    .slice(0, 22)
}

/**
 * Verify HMAC sig against params. Returns false if sig is invalid.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyParams(params: Record<string, string>, sig: string): boolean {
  if (!sig) return false
  const expected = signParams(params)
  if (expected.length !== sig.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

/**
 * Content-addressed cache key for a card render.
 * hash = sha256(station_id|fuel_type_id|price_cents|radius_km|variant)
 * Excludes sig (signatures rotate; cards do not).
 */
export function computeCardHash(
  stationId: number,
  fuelTypeId: number,
  priceCents: number,
  radiusKm?: number,
  variant = 'default'
): string {
  return createHash('sha256')
    .update(`${stationId}|${fuelTypeId}|${priceCents}|${radiusKm ?? ''}|${variant}`)
    .digest('hex')
}
