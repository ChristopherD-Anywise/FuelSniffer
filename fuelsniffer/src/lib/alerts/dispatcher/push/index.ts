/**
 * SP-5 Alerts — WebPushProvider interface + web-push implementation.
 *
 * VAPID keys must be set in env:
 *   VAPID_PUBLIC_KEY  — also exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY — server-only, never returned by API
 *   VAPID_SUBJECT     — mailto: or https: URL
 *
 * Generate keys once with: npx web-push generate-vapid-keys
 */
import webpush from 'web-push'
import type { PushPayload } from '../../types'

export interface PushSubscriptionRecord {
  endpoint: string
  keysP256dh: string
  keysAuth: string
}

export type PushSendResult =
  | { success: true; statusCode: number }
  | { success: false; statusCode: number; revoke: boolean; error: string }

export interface WebPushProvider {
  send(
    subscription: PushSubscriptionRecord,
    payload: PushPayload
  ): Promise<PushSendResult>
}

/**
 * Production implementation using the `web-push` npm package.
 * VAPID keys are loaded from env at construction time.
 */
export class VapidWebPushProvider implements WebPushProvider {
  constructor() {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT

    if (!publicKey || !privateKey || !subject) {
      throw new Error(
        'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT environment variables are required. ' +
        'Generate keys with: npx web-push generate-vapid-keys'
      )
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)
  }

  async send(
    subscription: PushSubscriptionRecord,
    payload: PushPayload
  ): Promise<PushSendResult> {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keysP256dh,
        auth: subscription.keysAuth,
      },
    }

    try {
      const response = await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        { TTL: 4 * 60 * 60 } // 4 hours TTL
      )
      return { success: true, statusCode: response.statusCode }
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      const statusCode = e.statusCode ?? 500
      const message = e.message ?? String(err)

      // 404/410 means subscription is gone — caller should revoke
      const revoke = statusCode === 404 || statusCode === 410

      return {
        success: false,
        statusCode,
        revoke,
        error: message,
      }
    }
  }
}

/**
 * Memory implementation for tests.
 */
export class MemoryWebPushProvider implements WebPushProvider {
  public sent: Array<{ subscription: PushSubscriptionRecord; payload: PushPayload }> = []
  /** Override to simulate specific status codes */
  public mockStatusCode = 201

  async send(
    subscription: PushSubscriptionRecord,
    payload: PushPayload
  ): Promise<PushSendResult> {
    if (this.mockStatusCode === 404 || this.mockStatusCode === 410) {
      return {
        success: false,
        statusCode: this.mockStatusCode,
        revoke: true,
        error: `Mock ${this.mockStatusCode}`,
      }
    }
    this.sent.push({ subscription, payload })
    return { success: true, statusCode: this.mockStatusCode }
  }

  reset() {
    this.sent = []
    this.mockStatusCode = 201
  }
}
