import cron from 'node-cron'
import { registerProvider } from '@/lib/providers/fuel'
import { QldFuelProvider } from '@/lib/providers/fuel/qld'
import { NswFuelProvider } from '@/lib/providers/fuel/nsw/provider'
import { TasFuelProvider } from '@/lib/providers/fuel/tas/provider'
import { WaFuelProvider }  from '@/lib/providers/fuel/wa/provider'
import { NtFuelProvider }  from '@/lib/providers/fuel/nt/provider'
import { runProviderScrape } from './writer'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import type { FuelPriceProvider } from '@/lib/providers/fuel'

// ── Per-provider schedule declarations ────────────────────────────────────────

interface ProviderScheduleEntry {
  provider: FuelPriceProvider
  cron:     string
  tz:       string
}

/**
 * D-11 (locked): Each provider runs immediately on startup, then on its declared cadence.
 * WA runs twice daily (06:30 and 14:30 WST) to capture both the confirmed
 * effective prices and the day-ahead announced prices.
 *
 * node-cron v4 BREAKING CHANGES (v4.2.1 — do not use v3 patterns):
 * - 'scheduled' option is REMOVED — tasks start immediately when created
 * - 'runOnInit' option is REMOVED
 * - Use 'noOverlap: true' to prevent concurrent runs
 */
const PROVIDER_SCHEDULES: ProviderScheduleEntry[] = [
  { provider: new QldFuelProvider(), cron: '*/15 * * * *',   tz: 'Australia/Brisbane' },
  { provider: new NswFuelProvider(), cron: '*/15 * * * *',   tz: 'Australia/Sydney'   },
  { provider: new TasFuelProvider(), cron: '*/15 * * * *',   tz: 'Australia/Hobart'   },
  { provider: new NtFuelProvider(),  cron: '*/30 * * * *',   tz: 'Australia/Darwin'   },
  { provider: new WaFuelProvider(),  cron: '30 6,14 * * *',  tz: 'Australia/Perth'    },
]

/**
 * Start the scrape + maintenance schedulers.
 * Called once from src/instrumentation.ts when the Next.js server starts.
 */
export function startScheduler(): void {
  // Register all providers with the registry
  for (const { provider } of PROVIDER_SCHEDULES) {
    registerProvider(provider)
  }

  const providerIds = PROVIDER_SCHEDULES.map(p => p.provider.id).join(', ')
  console.log(`[scheduler] Registered ${PROVIDER_SCHEDULES.length} provider(s): ${providerIds}`)

  // D-11: Staggered immediate first execution — 30s apart per provider to avoid
  // hammering the DB connection pool and external APIs on cold boot.
  PROVIDER_SCHEDULES.forEach(({ provider }, idx) => {
    const delayMs = idx * 30_000
    setTimeout(() => {
      console.log(`[scheduler:${provider.id}] Startup scrape (D-11, delay=${delayMs}ms)`)
      runProviderScrape(provider).catch(err => {
        console.error(`[scheduler:${provider.id}] Startup scrape failed:`, err)
      })
    }, delayMs)
  })

  // Per-provider cron jobs
  for (const { provider, cron: cronExpr, tz } of PROVIDER_SCHEDULES) {
    cron.schedule(cronExpr, () => {
      runProviderScrape(provider).catch(err => {
        console.error(`[scheduler:${provider.id}] Scheduled scrape failed:`, err)
      })
    }, {
      timezone:  tz,
      noOverlap: true,
    })
  }

  // Job: Refresh hourly_prices materialized view every hour at :30
  cron.schedule('30 * * * *', () => {
    db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      .catch((err) => console.error('[scheduler] hourly_prices refresh failed:', err))
  }, {
    timezone:  'Australia/Brisbane',
    noOverlap: true,
  })

  // Job: Nightly maintenance at 2:00am Brisbane time.
  // ORDER IS CRITICAL:
  //   1. Refresh daily_prices FIRST — captures today's data before raw rows are deleted
  //   2. Delete raw rows older than 7 days (D-04 locked)
  //   3. Refresh hourly_prices — reflects post-delete state (now contains only last 7 days)
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[scheduler] Starting nightly maintenance...')

      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY daily_prices`)
      console.log('[scheduler] daily_prices refreshed (pre-delete)')

      await db.execute(sql`
        DELETE FROM price_readings
        WHERE recorded_at < NOW() - INTERVAL '7 days'
      `)
      console.log('[scheduler] Deleted raw rows older than 7 days')

      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      console.log('[scheduler] hourly_prices refreshed (post-delete)')

      await db.execute(sql`DELETE FROM route_cache WHERE expires_at < NOW()`)
      console.log('[scheduler] Expired route_cache entries deleted')

      console.log('[scheduler] Nightly maintenance complete')
    } catch (err) {
      console.error('[scheduler] Nightly maintenance failed:', err)
    }
  }, {
    timezone:  'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[scheduler] Running — per-provider cron schedules active, nightly maintenance at 02:00 Brisbane')
}
