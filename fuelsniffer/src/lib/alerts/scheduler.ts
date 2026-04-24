/**
 * SP-5 Alerts — Supplementary scheduler.
 *
 * Registers two additional cron jobs alongside the scraper scheduler:
 * 1. Weekly digest checker — fires every hour on Sundays; evaluates per-user
 *    whether the user is in their 06:00–06:59 window.
 * 2. Nightly subscription cleanup + delivery retention (3am Brisbane).
 *
 * Called once from src/instrumentation.ts.
 */
import cron from 'node-cron'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import axios from 'axios'

export function startAlertsScheduler(): void {
  // ── Weekly digest: every hour on Sundays ──────────────────────────────────
  // We check each user's local time rather than running at a fixed UTC time,
  // so users in different timezones all get the digest at their local 06:00.
  cron.schedule('0 * * * 0', async () => {
    try {
      const now = new Date()
      console.log('[alerts:digest] Checking weekly digest window...')

      // Load all active weekly_digest alerts
      const alertRows = await db.execute(sql`
        SELECT
          a.id, a.user_id, a.criteria_json, a.channels, a.last_fired_at,
          u.email, u.display_name, u.timezone, u.quiet_hours_start, u.quiet_hours_end
        FROM alerts a
        JOIN users u ON u.id = a.user_id
        WHERE a.type = 'weekly_digest' AND a.paused = false
      `)

      type AlertUserRow = {
        id: number
        user_id: string
        criteria_json: unknown
        channels: string[]
        last_fired_at: Date | null
        email: string
        display_name: string | null
        timezone: string
        quiet_hours_start: string
        quiet_hours_end: string
      }

      const alertUsers = alertRows as unknown as AlertUserRow[]

      for (const row of alertUsers) {
        const { evaluateWeeklyDigest } = await import('./evaluator/weeklyDigest')
        const { dispatchAlert } = await import('./dispatcher/index')

        const alert = {
          id: row.id,
          userId: row.user_id,
          type: 'weekly_digest' as const,
          criteriaJson: row.criteria_json,
          channels: row.channels,
          paused: false,
          createdAt: new Date(),
          lastFiredAt: row.last_fired_at,
          lastEvaluatedAt: null,
          label: null,
        }

        const candidates = await evaluateWeeklyDigest([alert], row.timezone, now)
        if (candidates.length === 0) continue

        // Dispatch
        try {
          const { ResendAlertEmailSender } = await import('./dispatcher/email/resend')
          const { VapidWebPushProvider } = await import('./dispatcher/push/index')

          const emailSender = new ResendAlertEmailSender()
          const pushProvider = new VapidWebPushProvider()

          for (const candidate of candidates) {
            await dispatchAlert(candidate, {
              emailSender,
              pushProvider,
              user: {
                id: row.user_id,
                email: row.email,
                displayName: row.display_name,
                timezone: row.timezone,
                quiet_hours_start: row.quiet_hours_start,
                quiet_hours_end: row.quiet_hours_end,
              },
            })
          }
        } catch (err) {
          console.error(`[alerts:digest] Dispatch failed for user ${row.user_id}:`, err)
        }
      }

      // Ping healthchecks if configured
      const pingUrl = process.env.HEALTHCHECKS_DIGEST_PING_URL
      if (pingUrl) {
        try { await axios.get(pingUrl, { timeout: 5000 }) } catch { /* non-fatal */ }
      }

      console.log('[alerts:digest] Weekly digest check complete')
    } catch (err) {
      console.error('[alerts:digest] Weekly digest cron failed:', err)
    }
  }, {
    timezone: 'UTC', // fire every hour globally; per-user TZ check is inside
    noOverlap: true,
  })

  // ── Nightly: subscription cleanup + delivery retention ───────────────────
  cron.schedule('0 3 * * *', async () => {
    try {
      console.log('[alerts:cleanup] Starting nightly cleanup...')

      // Mark push subscriptions revoked if endpoint consistently fails
      // (In practice, revocation is done inline at send time; this catches any stragglers)
      await db.execute(sql`
        UPDATE web_push_subscriptions
        SET revoked_at = NOW()
        WHERE revoked_at IS NULL
          AND last_seen_at < NOW() - INTERVAL '30 days'
      `)
      console.log(`[alerts:cleanup] Marked stale subscriptions (last_seen > 30d): done`)

      // Delete alert_deliveries older than 90 days (PII retention policy)
      await db.execute(sql`
        DELETE FROM alert_deliveries
        WHERE fired_at < NOW() - INTERVAL '90 days'
      `)
      console.log('[alerts:cleanup] Deleted alert_deliveries > 90 days')

      console.log('[alerts:cleanup] Nightly cleanup complete')
    } catch (err) {
      console.error('[alerts:cleanup] Nightly cleanup failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[alerts:scheduler] Running — weekly digest (Sun hourly), nightly cleanup (03:00 Brisbane)')
}
