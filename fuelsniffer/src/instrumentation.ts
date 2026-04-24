/**
 * Next.js instrumentation hook.
 * Runs once when the Next.js server process starts.
 * This is the correct place to start the scheduler — do NOT start it in:
 * - API route files (may be executed multiple times or in Edge runtime)
 * - Middleware (Edge runtime, no Node.js APIs)
 * - page.tsx server components (executed per request)
 *
 * instrumentationHook is stable in Next.js 16 — no experimental flag required.
 */
export async function register() {
  // Only run in the Node.js runtime, not the Edge runtime
  // The scheduler uses node-cron which requires Node.js APIs
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scraper/scheduler')
    startScheduler()

    // SP-4: Start cycle engine compute scheduler (nightly 03:30 AEST)
    const { startCycleScheduler } = await import('./lib/cycle/scheduler')
    startCycleScheduler()
  }
}
