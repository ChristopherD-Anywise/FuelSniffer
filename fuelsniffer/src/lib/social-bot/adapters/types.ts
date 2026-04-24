/**
 * SP-8: Social adapter interface.
 *
 * Each network (X, BlueSky, Mastodon) implements this interface.
 * Feature flags control which adapters are active.
 */
export interface SocialAdapter {
  readonly network: 'x' | 'bluesky' | 'mastodon'

  /**
   * Returns true if this adapter is enabled (feature flag + kill switch check).
   * Call before post() to avoid unnecessary auth.
   */
  isEnabled(): boolean

  /**
   * Post text + optional image to the network.
   * @param text - The post body (network-specific length already trimmed)
   * @param imageLocalPath - Path to a local PNG file, or null for text-only
   * @returns Network post id + raw response
   * @throws on auth errors, network errors, or timeout
   */
  post(params: {
    text: string
    imageLocalPath: string | null
  }): Promise<{ id: string; raw: unknown }>
}

/**
 * Feature flag env vars for each network.
 * All default to false (safe-by-default).
 */
export const NETWORK_FLAGS = {
  x:        'FILLIP_BOT_X_ENABLED',
  bluesky:  'FILLIP_BOT_BLUESKY_ENABLED',
  mastodon: 'FILLIP_BOT_MASTODON_ENABLED',
} as const

/**
 * Kill switch — overrides all per-network flags.
 */
export const KILL_SWITCH_ENV = 'SOCIAL_BOT_DISABLED'

/**
 * Check kill switch + per-network flag.
 */
export function isNetworkEnabled(network: 'x' | 'bluesky' | 'mastodon'): boolean {
  if (process.env[KILL_SWITCH_ENV] === 'true') return false
  return process.env[NETWORK_FLAGS[network]] === 'true'
}
