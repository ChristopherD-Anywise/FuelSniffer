/**
 * SP-5 Alerts — Main evaluator orchestrator.
 *
 * Runs post-scrape (called via queueMicrotask from scheduler).
 * Errors never propagate — scraper must not be affected.
 *
 * Feature flag: ALERTS_ENABLED_TYPES (comma-separated list of alert types).
 * Empty or unset = all types enabled.
 */
import { db } from '@/lib/db/client'
import { alerts as alertsTable } from '@/lib/db/schema'
import { sql, eq } from 'drizzle-orm'
import { dispatchAlert } from '../dispatcher/index'
import { ResendAlertEmailSender } from '../dispatcher/email/resend'
import { VapidWebPushProvider } from '../dispatcher/push/index'
import { evaluatePriceThreshold } from './priceThreshold'
import { evaluateFavouriteDrop } from './favouriteDrop'
import { evaluateCycleLow } from './cycleLow'
import type { Alert, DeliveryCandidate } from '../types'

export interface EvaluatorOpts {
  providerId: string
  sinceTs?: Date
}

export interface EvaluatorSummary {
  candidates: number
  sent: number
  suppressed_rate_limit: number
  suppressed_quiet_hours: number
  failed: number
  evaluator_ms: number
}

type UserRow = {
  id: string
  email: string
  display_name: string | null
  timezone: string
  quiet_hours_start: string
  quiet_hours_end: string
}

function getEnabledTypes(): Set<string> {
  const env = process.env.ALERTS_ENABLED_TYPES
  if (!env || env.trim() === '') {
    return new Set(['price_threshold', 'cycle_low', 'favourite_drop', 'weekly_digest'])
  }
  return new Set(env.split(',').map(t => t.trim()))
}

/**
 * Main entry point. Called post-scrape via queueMicrotask.
 * Never throws — errors are caught and logged.
 */
export async function runAlertsEvaluator(opts: EvaluatorOpts): Promise<void> {
  const start = Date.now()
  const sinceTs = opts.sinceTs ?? new Date(Date.now() - 30 * 60_000) // 30-min safety floor
  const enabledTypes = getEnabledTypes()

  const summary: EvaluatorSummary = {
    candidates: 0,
    sent: 0,
    suppressed_rate_limit: 0,
    suppressed_quiet_hours: 0,
    failed: 0,
    evaluator_ms: 0,
  }

  try {
    // Load all active (non-paused) alerts
    const allAlerts = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.paused, false)) as unknown as Alert[]

    if (allAlerts.length === 0) return

    // Filter by enabled types
    const filtered = allAlerts.filter(a => enabledTypes.has(a.type))
    if (filtered.length === 0) return

    // Group by type
    const byType = {
      price_threshold: filtered.filter(a => a.type === 'price_threshold'),
      favourite_drop:  filtered.filter(a => a.type === 'favourite_drop'),
      cycle_low:       filtered.filter(a => a.type === 'cycle_low'),
      weekly_digest:   filtered.filter(a => a.type === 'weekly_digest'),
    }

    // Collect all candidates from enabled evaluators
    const candidates: DeliveryCandidate[] = []

    if (enabledTypes.has('price_threshold') && byType.price_threshold.length > 0) {
      const c = await evaluatePriceThreshold(byType.price_threshold, sinceTs)
      candidates.push(...c)
    }

    if (enabledTypes.has('favourite_drop') && byType.favourite_drop.length > 0) {
      const c = await evaluateFavouriteDrop(byType.favourite_drop)
      candidates.push(...c)
    }

    if (enabledTypes.has('cycle_low') && byType.cycle_low.length > 0) {
      const c = await evaluateCycleLow(byType.cycle_low, sinceTs)
      candidates.push(...c)
    }

    // Note: weekly_digest is handled by its own cron in alerts/scheduler.ts
    // The post-scrape evaluator skips it.

    summary.candidates = candidates.length

    if (candidates.length === 0) {
      summary.evaluator_ms = Date.now() - start
      return
    }

    // Backpressure ceiling
    if (candidates.length > 5000) {
      console.warn(`[evaluator] ${candidates.length} candidates exceeds ceiling of 5000 — capping`)
      candidates.splice(5000)
    }

    // Load distinct user IDs needed
    const userIds = [...new Set(candidates.map(c => c.alert.userId))]

    const userRows = await db.execute(sql`
      SELECT id, email, display_name, timezone, quiet_hours_start, quiet_hours_end
      FROM users
      WHERE id = ANY(${userIds}::uuid[])
    `)
    const userMap = new Map<string, UserRow>()
    for (const u of userRows as unknown as UserRow[]) {
      userMap.set(u.id, u)
    }

    // Create dispatchers (lazy — throw if env vars missing in prod)
    let emailSender: InstanceType<typeof ResendAlertEmailSender> | null = null
    let pushProvider: InstanceType<typeof VapidWebPushProvider> | null = null

    try {
      emailSender = new ResendAlertEmailSender()
    } catch {
      console.warn('[evaluator] Email sender unavailable (RESEND_API_KEY/RESEND_FROM not set)')
    }

    try {
      pushProvider = new VapidWebPushProvider()
    } catch {
      console.warn('[evaluator] Push provider unavailable (VAPID keys not set)')
    }

    if (!emailSender && !pushProvider) {
      console.warn('[evaluator] No channels available — skipping dispatch')
      return
    }

    // Dispatch in batches of 200 (rate limit respect)
    const BATCH_SIZE = 200
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE)

      await Promise.allSettled(
        batch.map(async (candidate) => {
          const user = userMap.get(candidate.alert.userId)
          if (!user) return

          // Use email-only or push-only if one provider is unavailable
          const channels = candidate.alert.channels.filter(ch => {
            if (ch === 'email' && !emailSender) return false
            if (ch === 'push' && !pushProvider) return false
            return true
          })

          if (channels.length === 0) return

          const alertWithFilteredChannels = { ...candidate.alert, channels }

          try {
            const results = await dispatchAlert(
              { ...candidate, alert: alertWithFilteredChannels },
              {
                emailSender: emailSender!,
                pushProvider: pushProvider!,
                user: {
                  id: user.id,
                  email: user.email,
                  displayName: user.display_name,
                  timezone: user.timezone,
                  quiet_hours_start: user.quiet_hours_start as unknown as string,
                  quiet_hours_end: user.quiet_hours_end as unknown as string,
                },
              }
            )

            for (const r of results) {
              if (r.status === 'sent' || r.status === 'delivered') summary.sent++
              else if (r.status === 'suppressed_rate_limit') summary.suppressed_rate_limit++
              else if (r.status === 'suppressed_quiet_hours') summary.suppressed_quiet_hours++
              else if (r.status === 'failed' || r.status === 'bounced') summary.failed++
            }
          } catch (err) {
            summary.failed++
            console.error(`[evaluator] Dispatch failed for alert ${candidate.alert.id}:`, err)
          }
        })
      )
    }

    // Update last_evaluated_at for all processed alerts
    const processedIds = [...new Set(candidates.map(c => c.alert.id))]
    if (processedIds.length > 0) {
      await db.execute(sql`
        UPDATE alerts
        SET last_evaluated_at = NOW()
        WHERE id = ANY(${processedIds}::bigint[])
      `)
    }

  } catch (err) {
    console.error(`[evaluator:${opts.providerId}] Evaluator failed (non-fatal):`, err)
  } finally {
    summary.evaluator_ms = Date.now() - start
    console.log(
      `[evaluator:${opts.providerId}] candidates=${summary.candidates} sent=${summary.sent} ` +
      `suppressed_rl=${summary.suppressed_rate_limit} suppressed_qh=${summary.suppressed_quiet_hours} ` +
      `failed=${summary.failed} ms=${summary.evaluator_ms}`
    )
  }
}
