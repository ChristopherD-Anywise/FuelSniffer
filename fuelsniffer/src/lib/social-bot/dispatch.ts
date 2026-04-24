/**
 * SP-8: Social post dispatcher.
 *
 * Inserts social_posts rows BEFORE dispatching (so admin can inspect/cancel).
 * Runs all network adapters in parallel via Promise.allSettled.
 * Dry-run mode: logs but doesn't actually post.
 */
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { ComposedPost } from './composer'
import { isNetworkEnabled } from './adapters/types'
import { XAdapter } from './adapters/x'
import { BlueSkyAdapter } from './adapters/bluesky'
import { MastodonAdapter } from './adapters/mastodon'
import type { SocialAdapter } from './adapters/types'

function getAdapters(): SocialAdapter[] {
  return [new XAdapter(), new BlueSkyAdapter(), new MastodonAdapter()]
}

const DRY_RUN = () => process.env.SOCIAL_DRY_RUN === 'true'

type InsertedRow = { id: number }

async function insertRow(post: ComposedPost): Promise<number | null> {
  try {
    const rows = await db.execute(sql`
      INSERT INTO social_posts (
        network, kind, content_text, content_image_url, deep_link, status, dry_run
      ) VALUES (
        ${post.network},
        'weekly_cheapest_postcode',
        ${post.contentText},
        ${post.contentImageUrl},
        ${post.deepLink},
        ${post.status},
        ${DRY_RUN()}
      )
      RETURNING id
    `) as unknown as InsertedRow[]
    return rows[0]?.id ?? null
  } catch (err) {
    console.error(`[social-bot:dispatch] Failed to insert row for ${post.network}:`, err)
    return null
  }
}

export async function dispatchPosts(posts: ComposedPost[]): Promise<void> {
  const adapters = getAdapters()

  await Promise.allSettled(
    posts.map(async (post) => {
      const rowId = await insertRow(post)

      if (post.status === 'cancelled') {
        if (rowId !== null) {
          await db.execute(sql`
            UPDATE social_posts SET error_text = ${post.errorText ?? null} WHERE id = ${rowId}
          `).catch(() => {})
        }
        return
      }

      const adapter = adapters.find(a => a.network === post.network)

      if (!adapter || !isNetworkEnabled(post.network)) {
        console.log(`[social-bot] ${post.network} disabled — skipping dispatch`)
        if (rowId !== null) {
          await db.execute(sql`
            UPDATE social_posts
            SET status = 'cancelled', error_text = 'adapter_disabled'
            WHERE id = ${rowId}
          `).catch(() => {})
        }
        return
      }

      if (DRY_RUN()) {
        console.log(`[social-bot:dry-run] ${post.network}: ${post.contentText.slice(0, 80)}...`)
        if (rowId !== null) {
          await db.execute(sql`
            UPDATE social_posts
            SET status = 'posted', posted_at = NOW(),
                response_json = '{"dry_run":true,"id":"dry-run-id"}'::jsonb
            WHERE id = ${rowId}
          `).catch(() => {})
        }
        return
      }

      try {
        const result = await adapter.post({
          text: post.contentText,
          imageLocalPath: post.contentImageUrl,
        })

        if (rowId !== null) {
          await db.execute(sql`
            UPDATE social_posts
            SET status = 'posted', posted_at = NOW(),
                response_json = ${JSON.stringify(result.raw)}::jsonb
            WHERE id = ${rowId}
          `).catch(() => {})
        }

        console.log(`[social-bot] ${post.network} posted successfully: ${result.id}`)
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err)
        console.error(`[social-bot] ${post.network} post failed:`, errorText)

        if (rowId !== null) {
          await db.execute(sql`
            UPDATE social_posts
            SET status = 'failed', error_text = ${errorText}
            WHERE id = ${rowId}
          `).catch(() => {})
        }
      }
    })
  )
}
