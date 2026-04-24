/**
 * SP-8: Social bot scheduler.
 *
 * Registers a weekly cron job: Mon 07:00 AEST.
 * Called from src/instrumentation.ts alongside the scraper scheduler.
 *
 * Kill switch: SOCIAL_BOT_DISABLED=true prevents cron registration.
 * Dry run: SOCIAL_DRY_RUN=true (default in docker-compose) logs without posting.
 */
import cron from 'node-cron'
import { composeWeeklyPost } from './composer'
import { dispatchPosts } from './dispatch'

export const BOT_CRON_EXPRESSION = '0 7 * * 1'
export const BOT_CRON_TZ = 'Australia/Brisbane'

export function startBotScheduler(): void {
  if (process.env.SOCIAL_BOT_DISABLED === 'true') {
    console.log('[social-bot] SOCIAL_BOT_DISABLED=true — scheduler not registered')
    return
  }

  cron.schedule(
    BOT_CRON_EXPRESSION,
    async () => {
      console.log('[social-bot] Weekly post job starting...')
      try {
        const posts = await composeWeeklyPost('U91')
        await dispatchPosts(posts)
        console.log('[social-bot] Weekly post job complete')
      } catch (err) {
        console.error('[social-bot] Weekly post job failed:', err)
      }
    },
    {
      timezone: BOT_CRON_TZ,
      noOverlap: true,
    }
  )

  console.log(`[social-bot] Scheduler registered — ${BOT_CRON_EXPRESSION} ${BOT_CRON_TZ}`)
}
