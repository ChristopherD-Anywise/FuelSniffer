import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { scrapeHealth } from '@/lib/db/schema'
import { desc, sql } from 'drizzle-orm'

// ── Legacy response shape (preserved for backward compat) ─────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded'
  last_scrape_at: string | null  // ISO UTC string
  minutes_ago: number | null
  prices_last_run: number | null
}

/**
 * Build a single-provider health response from a scrape_health row.
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

// ── SP-1 per-provider response shape ──────────────────────────────────────────

export interface ProviderHealthEntry {
  status: 'ok' | 'degraded' | 'down'
  lastSuccessAt: string | null
  lastError: string | null
  rowsLastRun: number
}

export interface NationalHealthResponse {
  providers: Record<string, ProviderHealthEntry>
  overall: 'ok' | 'degraded'
}

type ScrapeHealthRow = {
  provider: string
  scrapedAt: Date | string
  pricesUpserted: number
  error: string | null
}

/**
 * Build the per-provider national health response.
 * Exported for unit testing.
 */
export function buildNationalHealthResponse(
  rows: ScrapeHealthRow[]
): NationalHealthResponse {
  const providers: Record<string, ProviderHealthEntry> = {}

  for (const row of rows) {
    const isOk = row.error === null
    providers[row.provider] = {
      status:        isOk ? 'ok' : 'degraded',
      lastSuccessAt: isOk ? new Date(row.scrapedAt).toISOString() : null,
      lastError:     row.error,
      rowsLastRun:   row.pricesUpserted,
    }
  }

  const overall = Object.values(providers).every(p => p.status === 'ok') ? 'ok' : 'degraded'

  return { providers, overall }
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/health
 *
 * Returns per-provider scrape health status (SP-1) plus legacy single-provider fields.
 *
 * Response shape:
 * {
 *   providers: {
 *     qld: { status, lastSuccessAt, lastError, rowsLastRun },
 *     nsw: { ... },
 *     wa:  { ... },
 *     ...
 *   },
 *   overall: 'ok' | 'degraded',
 *   // Legacy fields (based on most recent row across all providers):
 *   status: 'ok' | 'degraded',
 *   last_scrape_at: ISO string | null,
 *   minutes_ago: number | null,
 *   prices_last_run: number | null,
 * }
 */
export async function GET() {
  try {
    // Query latest row per provider
    const perProviderRows = await db.execute(sql`
      SELECT DISTINCT ON (provider)
        provider, scraped_at, prices_upserted, error
      FROM scrape_health
      ORDER BY provider, scraped_at DESC
    `) as unknown as Array<{
      provider: string
      scraped_at: Date | string
      prices_upserted: number
      error: string | null
    }>

    const rows: ScrapeHealthRow[] = perProviderRows.map(r => ({
      provider:       r.provider,
      scrapedAt:      r.scraped_at,
      pricesUpserted: r.prices_upserted,
      error:          r.error,
    }))

    const national = buildNationalHealthResponse(rows)

    // Fetch the most-recent row overall for legacy field backward compat
    const [latest] = await db
      .select()
      .from(scrapeHealth)
      .orderBy(desc(scrapeHealth.scrapedAt))
      .limit(1)

    const legacy = buildHealthResponse(latest ?? null)

    const response = {
      ...national,
      // Legacy fields
      status:          legacy.status,
      last_scrape_at:  legacy.last_scrape_at,
      minutes_ago:     legacy.minutes_ago,
      prices_last_run: legacy.prices_last_run,
    }

    const httpStatus = national.overall === 'ok' ? 200 : 503

    return NextResponse.json(response, { status: httpStatus })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
