/**
 * SP-8: BlueSky adapter.
 *
 * Uses @atproto/api with app password auth (handle + app-specific password).
 * Simplest auth of the three — no OAuth dance.
 *
 * Default: OFF. Enable with FILLIP_BOT_BLUESKY_ENABLED=true.
 * Kill switch: SOCIAL_BOT_DISABLED=true disables all networks.
 *
 * Required env vars:
 * - SOCIAL_BLUESKY_HANDLE (e.g. fillip.bsky.social)
 * - SOCIAL_BLUESKY_APP_PASSWORD (from Settings > App Passwords)
 */
import type { SocialAdapter } from './types'
import { isNetworkEnabled } from './types'
import { BskyAgent } from '@atproto/api'
import { readFile } from 'node:fs/promises'

export class BlueSkyAdapter implements SocialAdapter {
  readonly network = 'bluesky' as const

  isEnabled(): boolean {
    return isNetworkEnabled('bluesky')
  }

  async post({ text, imageLocalPath }: { text: string; imageLocalPath: string | null }) {
    const handle = process.env.SOCIAL_BLUESKY_HANDLE
    const appPassword = process.env.SOCIAL_BLUESKY_APP_PASSWORD

    if (!handle || !appPassword) {
      throw new Error('Missing BlueSky credentials (SOCIAL_BLUESKY_HANDLE, SOCIAL_BLUESKY_APP_PASSWORD)')
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' })
    await agent.login({ identifier: handle, password: appPassword })

    let embed: Record<string, unknown> | undefined

    if (imageLocalPath) {
      const imageData = await readFile(imageLocalPath)
      const uploaded = await agent.uploadBlob(imageData, { encoding: 'image/png' })
      embed = {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: uploaded.data.blob,
            alt: 'Fillip fuel price card',
          },
        ],
      }
    }

    // agent.post type is flexible — cast to avoid strict type errors
    const postData: Parameters<typeof agent.post>[0] = { text }
    if (embed) (postData as Record<string, unknown>).embed = embed

    const result = await agent.post(postData)

    return { id: result.uri, raw: result }
  }
}
