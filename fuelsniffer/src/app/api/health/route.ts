import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { scrapeHealth } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

// ── Response builder (exported for unit testing without HTTP layer) ────────────

export interface HealthResponse {
  status: 'ok' | 'degraded'
  last_scrape_at: string | null  // ISO UTC string
  minutes_ago: number | null
  prices_last_run: number | null
}

/**
 * Build the health response JSON from a scrape_health row.
 * Exported for use in unit tests — the GET handler calls this directly.
 */
export function buildHealthResponse(
  row: { scrapedAt: Date | string; pricesUpserted: number; error: string | null } | null
): HealthResponse {
  if (!row || row.error !== null) {
    return {
      status: 'degraded',
      last_scrape_at: row ? new Date(row.scrapedAt).toISOString() : null,
      minutes_ago: null,
      prices_last_run: row ? row.pricesUpserted : null,
    }
  }

  const scrapedAtDate = new Date(row.scrapedAt)
  const minutesAgo = Math.round((Date.now() - scrapedAtDate.getTime()) / 60_000)

  return {
    status: 'ok',
    last_scrape_at: scrapedAtDate.toISOString(),
    minutes_ago: minutesAgo,
    prices_last_run: row.pricesUpserted,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/health
 *
 * Returns the status of the most recent scrape cycle.
 * Used by healthchecks.io, dashboard freshness indicators, and monitoring.
 *
 * Response shape:
 * {
 *   status: 'ok' | 'degraded',
 *   last_scrape_at: ISO UTC string | null,
 *   minutes_ago: number | null,
 *   prices_last_run: number | null,
 * }
 */
export async function GET() {
  const [latest] = await db
    .select()
    .from(scrapeHealth)
    .orderBy(desc(scrapeHealth.scrapedAt))
    .limit(1)

  const response = buildHealthResponse(latest ?? null)

  // Use 503 status for degraded to help uptime monitors detect failures
  const httpStatus = response.status === 'ok' ? 200 : 503

  return NextResponse.json(response, { status: httpStatus })
}
