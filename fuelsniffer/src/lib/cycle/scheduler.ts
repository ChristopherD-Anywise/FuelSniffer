/**
 * SP-4 Cycle Engine — compute scheduler.
 *
 * Two jobs:
 * 1. Nightly 03:30 AEST — full recompute of all (suburb, fuel) pairs.
 * 2. Post-scrape intraday refresh — recompute touched suburbs only (called externally).
 *
 * node-cron v4 conventions (same as scraper/scheduler.ts):
 * - 'scheduled' option removed; tasks start immediately when created.
 * - Use 'noOverlap: true' to prevent concurrent runs.
 */

import cron from 'node-cron'
import { runNightlyCompute } from './compute'

/**
 * Start the nightly cycle compute scheduler.
 * Called from src/instrumentation.ts alongside the scraper scheduler.
 */
export function startCycleScheduler(): void {
  // Nightly 03:30 AEST — full recompute
  // 03:30 chosen: previous calendar day is fully captured by scraper (~23:55 last scrape)
  cron.schedule('30 3 * * *', async () => {
    console.log('[cycle-scheduler] Starting nightly full recompute...')
    const health = await runNightlyCompute()
    console.log(
      `[cycle-scheduler] Nightly complete: ${health.rowsWritten} rows, ` +
      `${health.uncertainCount} UNCERTAIN, ${health.durationMs}ms`
    )
    if (health.error) {
      console.error('[cycle-scheduler] Nightly compute error:', health.error)
    }
  }, {
    timezone:  'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[cycle-scheduler] Nightly compute scheduled at 03:30 Brisbane')
}
