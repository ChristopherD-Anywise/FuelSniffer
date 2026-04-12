/**
 * In-process in-memory token bucket rate limiter.
 *
 * Design rationale: Postgres-backed would create lock contention on
 * concurrent requests from the same IP. In-memory is correct and
 * sufficient for V1's single-process Next.js server. If we ever
 * horizontally scale, this must swap to Redis or Cloudflare rules.
 */

export interface RateLimitConfig {
  maxRequests: number   // tokens per window
  windowMs: number      // window duration in milliseconds
}

interface Bucket {
  tokens: number
  windowStart: number   // timestamp (ms) when this window opened
  windowMs: number      // window duration — stored so eviction can check expiry
}

const store = new Map<string, Bucket>()
const MAX_ENTRIES = 100_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function checkRateLimit(
  ipHash: string,
  bucketName: string,
  config: RateLimitConfig
): RateLimitResult {
  const key = `${ipHash}:${bucketName}`
  const now = Date.now()

  let bucket = store.get(key)

  // If no bucket or window has expired, start a fresh window
  if (!bucket || (now - bucket.windowStart) >= config.windowMs) {
    bucket = { tokens: config.maxRequests - 1, windowStart: now, windowMs: config.windowMs }
    store.set(key, bucket)
    evictIfNeeded()
    return { allowed: true, remaining: bucket.tokens, retryAfterMs: 0 }
  }

  // Window is still active — decrement
  if (bucket.tokens > 0) {
    bucket.tokens--
    return { allowed: true, remaining: bucket.tokens, retryAfterMs: 0 }
  }

  // Out of tokens
  const retryAfterMs = config.windowMs - (now - bucket.windowStart)
  return { allowed: false, remaining: 0, retryAfterMs }
}

/** Evict expired then oldest entries when store exceeds cap */
function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return

  const now = Date.now()

  // First pass: remove expired windows (windowStart + windowMs < now)
  for (const [key, bucket] of store.entries()) {
    if (store.size <= MAX_ENTRIES) break
    if (bucket.windowStart + bucket.windowMs < now) {
      store.delete(key)
    }
  }

  // Second pass: if still over limit, evict oldest entries by insertion order
  if (store.size > MAX_ENTRIES) {
    const deleteCount = Math.floor(MAX_ENTRIES * 0.1)
    let deleted = 0
    for (const key of store.keys()) {
      if (deleted >= deleteCount) break
      store.delete(key)
      deleted++
    }
  }
}

/** Reset all rate limit state — only for tests */
export function resetRateLimits(): void {
  store.clear()
}

// ── Endpoint configs ────────────────────────────────────────────────────────

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/prices': { maxRequests: 120, windowMs: 60_000 },
  '/api/prices/history': { maxRequests: 30, windowMs: 60_000 },
  '/api/search': { maxRequests: 60, windowMs: 60_000 },
  '/api/health': { maxRequests: 30, windowMs: 60_000 },
  '/api/csp-report': { maxRequests: 10, windowMs: 60_000 },
}

/**
 * Find the rate limit config for a given pathname.
 * Returns undefined if no rate limit applies.
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig | undefined {
  // Exact match first
  if (RATE_LIMITS[pathname]) return RATE_LIMITS[pathname]
  // Prefix match for nested routes
  for (const [prefix, config] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(prefix + '/')) return config
  }
  return undefined
}
