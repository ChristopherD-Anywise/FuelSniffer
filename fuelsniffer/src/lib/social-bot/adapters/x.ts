/**
 * SP-8: X (Twitter) adapter.
 *
 * Uses twitter-api-v2 with OAuth 1.0a user context (app + access token pair).
 * Image upload uses v1.1 media endpoint (still required even with v2 post API).
 *
 * Default: OFF. Enable with FILLIP_BOT_X_ENABLED=true.
 * Kill switch: SOCIAL_BOT_DISABLED=true disables all networks.
 *
 * Required env vars:
 * - SOCIAL_X_OAUTH_CLIENT_ID (app key)
 * - SOCIAL_X_OAUTH_CLIENT_SECRET (app secret)
 * - SOCIAL_X_ACCESS_TOKEN (user access token)
 * - SOCIAL_X_ACCESS_SECRET (user access secret)
 */
import type { SocialAdapter } from './types'
import { isNetworkEnabled } from './types'
import { TwitterApi } from 'twitter-api-v2'
import { readFile } from 'node:fs/promises'

export class XAdapter implements SocialAdapter {
  readonly network = 'x' as const

  isEnabled(): boolean {
    return isNetworkEnabled('x')
  }

  async post({ text, imageLocalPath }: { text: string; imageLocalPath: string | null }) {
    const clientId = process.env.SOCIAL_X_OAUTH_CLIENT_ID
    const clientSecret = process.env.SOCIAL_X_OAUTH_CLIENT_SECRET
    const accessToken = process.env.SOCIAL_X_ACCESS_TOKEN
    const accessSecret = process.env.SOCIAL_X_ACCESS_SECRET

    if (!clientId || !clientSecret || !accessToken || !accessSecret) {
      throw new Error('Missing X OAuth credentials (SOCIAL_X_OAUTH_CLIENT_ID, _SECRET, _ACCESS_TOKEN, _ACCESS_SECRET)')
    }

    const client = new TwitterApi({
      appKey: clientId,
      appSecret: clientSecret,
      accessToken,
      accessSecret,
    })

    let mediaId: string | undefined
    if (imageLocalPath) {
      const imageData = await readFile(imageLocalPath)
      mediaId = await client.v1.uploadMedia(imageData, { mimeType: 'image/png' })
    }

    const tweet = await client.v2.tweet(
      text,
      mediaId ? { media: { media_ids: [mediaId] } } : undefined
    )

    return { id: tweet.data.id, raw: tweet }
  }
}
