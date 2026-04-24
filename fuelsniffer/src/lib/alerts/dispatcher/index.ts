/**
 * SP-5 Alerts — Dispatcher.
 *
 * Takes a DeliveryCandidate and fans it out to all enabled channels
 * (email + push). Handles:
 * - Rate limiting (per-alert min interval)
 * - Quiet hours (push only)
 * - Retry on 5xx (up to 3 attempts, exponential backoff)
 * - Dedup via DB UNIQUE constraint on (alert_id, channel, dedup_key)
 * - Push subscription revocation on 404/410
 * - Logging (never logs payload body, only hashes)
 */
import { createHash } from 'crypto'
import { db } from '@/lib/db/client'
import { alertDeliveries, alerts, webPushSubscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { checkRateLimit } from './rateLimit'
import { isInQuietHours } from './quietHours'
import { buildPushPayload } from './templates/push'
import { renderPriceThresholdEmail } from './templates/email/priceThreshold'
import { renderCycleLowEmail } from './templates/email/cycleLow'
import { renderFavouriteDropEmail } from './templates/email/favouriteDrop'
import { renderWeeklyDigestEmail } from './templates/email/weeklyDigest'
import type { DeliveryCandidate, DispatchResult } from '../types'
import type { AlertEmailSender } from './email/index'
import type { WebPushProvider } from './push/index'

export interface DispatchOptions {
  emailSender: AlertEmailSender
  pushProvider: WebPushProvider
  /** User record for quiet hours + email address */
  user: {
    id: string
    email: string
    displayName: string | null
    timezone: string
    quiet_hours_start: string
    quiet_hours_end: string
  }
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Render the email template for the given candidate.
 */
async function renderEmail(
  candidate: DeliveryCandidate,
  userEmail: string,
): Promise<{ subject: string; html: string; text: string } | null> {
  const { alert, context } = candidate
  const baseData = {
    alertId: alert.id,
    userEmail,
    alertLabel: alert.label,
  }

  try {
    switch (alert.type) {
      case 'price_threshold':
        return renderPriceThresholdEmail({
          ...baseData,
          fuelName:      context.fuelName ?? 'Fuel',
          stationName:   context.stationName ?? 'Station',
          stationId:     context.stationId ?? 0,
          priceCents:    context.priceCents ?? 0,
          maxPriceCents: (candidate.payloadData.maxPriceCents as number | undefined) ?? 0,
          distanceKm:    context.distanceKm ?? 0,
          suburbDisplay: context.suburbDisplay,
        })

      case 'cycle_low':
        return renderCycleLowEmail({
          ...baseData,
          fuelName:      context.fuelName ?? 'Fuel',
          suburbDisplay: context.suburbDisplay ?? 'your area',
          topStations:   context.topStations ?? [],
        })

      case 'favourite_drop':
        return renderFavouriteDropEmail({
          ...baseData,
          fuelName:    context.fuelName ?? 'Fuel',
          stationName: context.stationName ?? 'Station',
          stationId:   context.stationId ?? 0,
          priceCents:  context.priceCents ?? 0,
          dropCents:   context.dropCents ?? 0,
        })

      case 'weekly_digest':
        return renderWeeklyDigestEmail({
          ...baseData,
          fuelName:      context.fuelName ?? 'Fuel',
          suburbDisplay: context.suburbDisplay ?? 'your area',
          bestDayToFill: context.bestDayToFill ?? 'Unknown',
          signalState:   context.signalState ?? 'UNCERTAIN',
          signalLabel:   (candidate.payloadData.signalLabel as string | undefined) ?? 'Check prices',
          topStations:   context.topStations ?? [],
        })
    }
  } catch (err) {
    console.error(`[dispatcher] Template render failed for ${alert.type}:`, err)
    return null
  }
}

/**
 * Send email with up to 3 retries (exponential backoff).
 */
async function sendEmailWithRetry(
  sender: AlertEmailSender,
  opts: { to: string; subject: string; html: string; text: string }
): Promise<{ id?: string }> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await sender.send(opts)
    } catch (err) {
      lastErr = err
      if (attempt < 2) await sleep(1000 * Math.pow(2, attempt))
    }
  }
  throw lastErr
}

/**
 * Dispatch a delivery candidate to all enabled channels.
 * Returns per-channel results.
 */
export async function dispatchAlert(
  candidate: DeliveryCandidate,
  opts: DispatchOptions
): Promise<DispatchResult[]> {
  const { alert, dedupKey, context } = candidate
  const { emailSender, pushProvider, user } = opts
  const results: DispatchResult[] = []

  // Rate limit check (applies to all channels)
  const rateLimitResult = checkRateLimit(alert)
  if (!rateLimitResult.allowed) {
    for (const channel of alert.channels) {
      await writeDelivery(alert.id, channel, dedupKey, candidate.payloadData, 'suppressed_rate_limit', undefined, rateLimitResult.reason)
      results.push({ channel, status: 'suppressed_rate_limit', error: rateLimitResult.reason })
    }
    return results
  }

  let anyChannelSucceeded = false

  for (const channel of alert.channels) {
    if (channel === 'push') {
      // Quiet hours check for push
      if (isInQuietHours({ timezone: user.timezone, quiet_hours_start: user.quiet_hours_start, quiet_hours_end: user.quiet_hours_end })) {
        await writeDelivery(alert.id, 'push', dedupKey, candidate.payloadData, 'suppressed_quiet_hours', undefined, 'quiet hours')
        results.push({ channel: 'push', status: 'suppressed_quiet_hours' })
        continue
      }

      // Fetch active push subscriptions for this user
      const subs = await db
        .select()
        .from(webPushSubscriptions)
        .where(
          sql`user_id = ${user.id}::uuid AND revoked_at IS NULL`
        )

      if (subs.length === 0) {
        results.push({ channel: 'push', status: 'suppressed_rate_limit', error: 'no active push subscriptions' })
        continue
      }

      const payload = buildPushPayload(alert.id, alert.type, context)
      const payloadStr = JSON.stringify(payload)
      const hash = sha256(payloadStr)

      for (const sub of subs) {
        let status: DispatchResult['status'] = 'failed'
        let messageId: string | undefined
        let errorMsg: string | undefined

        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await pushProvider.send(
            { endpoint: sub.endpoint, keysP256dh: sub.keysP256dh, keysAuth: sub.keysAuth },
            payload
          )

          if (result.success) {
            status = 'sent'
            // Update last_seen_at
            await db
              .update(webPushSubscriptions)
              .set({ lastSeenAt: new Date() })
              .where(eq(webPushSubscriptions.id, sub.id))
            break
          }

          if (result.revoke) {
            // 404/410 — subscription gone
            await db
              .update(webPushSubscriptions)
              .set({ revokedAt: new Date() })
              .where(eq(webPushSubscriptions.id, sub.id))
            status = 'failed'
            errorMsg = `Subscription revoked: ${result.error}`
            break
          }

          // 5xx or other — retry with backoff
          errorMsg = result.error
          if (attempt < 2) await sleep(1000 * Math.pow(2, attempt))
        }

        await writeDelivery(alert.id, 'push', dedupKey, candidate.payloadData, status, messageId, errorMsg, hash)
        if (status === 'sent') anyChannelSucceeded = true
        results.push({ channel: 'push', status, providerMessageId: messageId, error: errorMsg })
      }

    } else if (channel === 'email') {
      const emailContent = await renderEmail(candidate, user.email)
      if (!emailContent) {
        await writeDelivery(alert.id, 'email', dedupKey, candidate.payloadData, 'failed', undefined, 'template render failed')
        results.push({ channel: 'email', status: 'failed', error: 'template render failed' })
        continue
      }

      const hash = sha256(emailContent.html)
      let status: DispatchResult['status'] = 'failed'
      let messageId: string | undefined
      let errorMsg: string | undefined

      try {
        const result = await sendEmailWithRetry(emailSender, {
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        })
        status = 'sent'
        messageId = result.id
        anyChannelSucceeded = true
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[dispatcher] Email send failed for alert ${alert.id}:`, errorMsg)
      }

      await writeDelivery(alert.id, 'email', dedupKey, candidate.payloadData, status, messageId, errorMsg, hash)
      results.push({ channel: 'email', status, providerMessageId: messageId, error: errorMsg })
    }
  }

  // Update last_fired_at if at least one channel succeeded
  if (anyChannelSucceeded) {
    await db
      .update(alerts)
      .set({ lastFiredAt: new Date() })
      .where(eq(alerts.id, alert.id))
  }

  return results
}

/**
 * Write a delivery record to the DB.
 * Silently ignores UNIQUE constraint violations (dedup).
 */
async function writeDelivery(
  alertId: number,
  channel: string,
  dedupKey: string,
  payloadData: Record<string, unknown>,
  status: DispatchResult['status'],
  providerMessageId?: string,
  error?: string,
  payloadHash?: string
): Promise<void> {
  const hash = payloadHash ?? sha256(JSON.stringify(payloadData))

  try {
    await db.insert(alertDeliveries).values({
      alertId,
      channel,
      payloadHash: hash,
      dedupKey,
      status,
      providerMessageId: providerMessageId ?? null,
      error: error ?? null,
      retryCount: 0,
    }).onConflictDoNothing()
  } catch (err) {
    // Swallow silently — UNIQUE violation means already delivered
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('unique') && !msg.includes('duplicate')) {
      console.error('[dispatcher] Failed to write delivery record:', msg)
    }
  }
}
