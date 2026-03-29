import cron from 'node-cron'
import { runScrapeJob } from './writer'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

/**
 * Start the scrape + maintenance schedulers.
 * Called once from src/instrumentation.ts when the Next.js server starts.
 *
 * node-cron v4 BREAKING CHANGES (v4.2.1 — do not use v3 patterns):
 * - 'scheduled' option is REMOVED — tasks start immediately when created
 * - 'runOnInit' option is REMOVED
 * - Use 'noOverlap: true' to prevent concurrent runs
 *
 * D-11 (locked): Run immediately on startup, then every 15 minutes.
 */
export function startScheduler(): void {
  // D-11: Immediate first execution (before the cron schedule fires)
  console.log('[scheduler] Starting — running immediate scrape on startup (D-11)')
  runScrapeJob().catch((err) => {
    console.error('[scheduler] Immediate startup scrape failed:', err)
  })

  // Job 1: Scrape every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runScrapeJob().catch((err) => {
      console.error('[scheduler] Scheduled scrape failed:', err)
    })
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  // Job 2: Refresh hourly_prices materialized view every hour at :30
  // CONCURRENT refresh allows read queries to continue during refresh.
  cron.schedule('30 * * * *', () => {
    db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      .catch((err) => console.error('[scheduler] hourly_prices refresh failed:', err))
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  // Job 3: Nightly maintenance at 2:00am Brisbane time.
  // ORDER IS CRITICAL:
  //   1. Refresh daily_prices FIRST — captures today's data before raw rows are deleted
  //   2. Delete raw rows older than 7 days (D-04 locked)
  //   3. Refresh hourly_prices — reflects post-delete state (now contains only last 7 days)
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[scheduler] Starting nightly maintenance...')

      // Step 1: Capture current data into daily_prices BEFORE deleting raw rows.
      // This preserves historical daily min/max even after raw data expires.
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY daily_prices`)
      console.log('[scheduler] daily_prices refreshed (pre-delete)')

      // Step 2: Delete raw readings older than 7 days (D-04 locked)
      await db.execute(sql`
        DELETE FROM price_readings
        WHERE recorded_at < NOW() - INTERVAL '7 days'
      `)
      console.log('[scheduler] Deleted raw rows older than 7 days')

      // Step 3: Refresh hourly_prices to reflect post-delete state
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      console.log('[scheduler] hourly_prices refreshed (post-delete)')

      console.log('[scheduler] Nightly maintenance complete')
    } catch (err) {
      console.error('[scheduler] Nightly maintenance failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[scheduler] Running — scraping every 15 min, hourly view refresh, nightly cleanup (Australia/Brisbane)')
}
