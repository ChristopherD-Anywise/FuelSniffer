import cron from 'node-cron'
import { runScrapeJob } from './writer'

/**
 * Start the 15-minute scrape scheduler.
 * Called once from src/instrumentation.ts when the Next.js server starts.
 *
 * node-cron v4 BREAKING CHANGES (v4.2.1 — do not use v3 patterns):
 * - 'scheduled' option is REMOVED — tasks start immediately when created
 * - 'runOnInit' option is REMOVED
 * - Use 'noOverlap: true' to prevent concurrent scrape runs
 *
 * D-11 (locked): Run immediately on startup, then every 15 minutes.
 */
export function startScheduler(): void {
  // D-11: Immediate first execution (before the cron schedule fires)
  console.log('[scheduler] Starting — running immediate scrape on startup (D-11)')
  runScrapeJob().catch((err) => {
    console.error('[scheduler] Immediate startup scrape failed:', err)
  })

  // Schedule: every 15 minutes, every hour, every day
  // noOverlap: skip this cycle if the previous is still running
  // timezone: Australia/Brisbane — used for cron expression evaluation
  cron.schedule('*/15 * * * *', () => {
    runScrapeJob().catch((err) => {
      console.error('[scheduler] Scheduled scrape failed:', err)
    })
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[scheduler] Running — scraping every 15 minutes (Australia/Brisbane timezone)')
}
