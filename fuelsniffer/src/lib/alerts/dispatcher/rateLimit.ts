/**
 * SP-5 Alerts — per-alert rate limit checker.
 *
 * Pure function — no DB access. Checks alert.last_fired_at against
 * the minimum interval for each alert type.
 */
import type { Alert, AlertType } from '../types'

/** Minimum interval between firings, in milliseconds, per alert type. */
export const MIN_INTERVAL_MS: Record<AlertType, number> = {
  price_threshold: 4 * 60 * 60 * 1000,   // 4 hours
  favourite_drop:  4 * 60 * 60 * 1000,   // 4 hours
  cycle_low:       24 * 60 * 60 * 1000,  // 24 hours
  weekly_digest:   7 * 24 * 60 * 60 * 1000, // 7 days
}

/**
 * Check whether an alert is within its rate-limit window.
 *
 * @returns `{ allowed: true }` if the alert can fire, or
 *          `{ allowed: false, reason }` if suppressed.
 */
export function checkRateLimit(
  alert: Alert,
  now: Date = new Date()
): { allowed: boolean; reason?: string } {
  if (!alert.lastFiredAt) {
    return { allowed: true }
  }

  const elapsed = now.getTime() - alert.lastFiredAt.getTime()
  const minInterval = MIN_INTERVAL_MS[alert.type]

  if (elapsed < minInterval) {
    const remainingMs = minInterval - elapsed
    const remainingMinutes = Math.ceil(remainingMs / 60_000)
    return {
      allowed: false,
      reason: `rate_limit: last fired ${Math.floor(elapsed / 60_000)}m ago, min interval ${Math.floor(minInterval / 60_000)}m, retry in ${remainingMinutes}m`,
    }
  }

  return { allowed: true }
}
