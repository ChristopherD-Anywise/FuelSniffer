/**
 * SP-8: Mastodon adapter.
 *
 * Uses plain fetch — no SDK needed for Mastodon's simple REST API.
 * Token is long-lived; rotation is manual (revoke + recreate via Mastodon UI).
 *
 * Default: OFF. Enable with FILLIP_BOT_MASTODON_ENABLED=true.
 * Kill switch: SOCIAL_BOT_DISABLED=true disables all networks.
 *
 * Required env vars:
 * - SOCIAL_MASTODON_INSTANCE_URL (e.g. https://aus.social)
 * - SOCIAL_MASTODON_ACCESS_TOKEN (from Account Settings > Development)
 */
import type { SocialAdapter } from './types'
import { isNetworkEnabled } from './types'
import { readFile } from 'node:fs/promises'

const TIMEOUT_MS = 30_000

export class MastodonAdapter implements SocialAdapter {
  readonly network = 'mastodon' as const

  isEnabled(): boolean {
    return isNetworkEnabled('mastodon')
  }

  async post({ text, imageLocalPath }: { text: string; imageLocalPath: string | null }) {
    const instanceUrl = (process.env.SOCIAL_MASTODON_INSTANCE_URL ?? 'https://aus.social').replace(/\/$/, '')
    const token = process.env.SOCIAL_MASTODON_ACCESS_TOKEN

    if (!token) {
      throw new Error('Missing Mastodon credentials (SOCIAL_MASTODON_ACCESS_TOKEN)')
    }

    let mediaId: string | undefined

    if (imageLocalPath) {
      const imageData = await readFile(imageLocalPath)
      const formData = new FormData()
      formData.append('file', new Blob([imageData], { type: 'image/png' }), 'fillip.png')
      formData.append('description', 'Fillip fuel price card')

      const mediaRes = await fetch(`${instanceUrl}/api/v2/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (mediaRes.status === 401) {
        throw new Error('Mastodon: unauthorized (401) — check SOCIAL_MASTODON_ACCESS_TOKEN')
      }
      if (!mediaRes.ok) {
        const errText = await mediaRes.text().catch(() => '')
        throw new Error(`Mastodon media upload failed: ${mediaRes.status} ${errText}`)
      }

      const mediaData = await mediaRes.json()
      mediaId = mediaData.id as string
    }

    const body: Record<string, unknown> = { status: text }
    if (mediaId) body.media_ids = [mediaId]

    const statusRes = await fetch(`${instanceUrl}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `fillip-${Date.now()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (statusRes.status === 401) {
      throw new Error('Mastodon: unauthorized (401) — check SOCIAL_MASTODON_ACCESS_TOKEN')
    }
    if (!statusRes.ok) {
      const errText = await statusRes.text().catch(() => '')
      throw new Error(`Mastodon post failed: ${statusRes.status} ${errText}`)
    }

    const data = await statusRes.json()
    return { id: data.id as string, raw: data }
  }
}
