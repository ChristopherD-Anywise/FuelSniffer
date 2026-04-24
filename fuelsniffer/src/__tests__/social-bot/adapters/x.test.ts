/**
 * Tests for X (Twitter) adapter.
 * Mocks twitter-api-v2 to avoid real API calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockUploadMedia = vi.fn().mockResolvedValue('media_id_123')
const mockTweet = vi.fn().mockResolvedValue({ data: { id: 'tweet_id_456' } })

vi.mock('twitter-api-v2', () => {
  return {
    TwitterApi: class MockTwitterApi {
      v1 = { uploadMedia: mockUploadMedia }
      v2 = { tweet: mockTweet }
    },
  }
})

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
}))

describe('XAdapter', () => {
  const creds = {
    SOCIAL_X_OAUTH_CLIENT_ID: 'client_id',
    SOCIAL_X_OAUTH_CLIENT_SECRET: 'client_secret',
    SOCIAL_X_ACCESS_TOKEN: 'access_token',
    SOCIAL_X_ACCESS_SECRET: 'access_secret',
  }

  beforeEach(() => {
    Object.assign(process.env, creds)
    delete process.env.SOCIAL_BOT_DISABLED
    delete process.env.FILLIP_BOT_X_ENABLED
  })

  afterEach(() => {
    for (const key of Object.keys(creds)) delete process.env[key]
    vi.clearAllMocks()
  })

  describe('isEnabled()', () => {
    it('returns false when FILLIP_BOT_X_ENABLED is not set', async () => {
      const { XAdapter } = await import('@/lib/social-bot/adapters/x')
      expect(new XAdapter().isEnabled()).toBe(false)
    })

    it('returns true when FILLIP_BOT_X_ENABLED=true', async () => {
      process.env.FILLIP_BOT_X_ENABLED = 'true'
      const { XAdapter } = await import('@/lib/social-bot/adapters/x')
      expect(new XAdapter().isEnabled()).toBe(true)
    })

    it('returns false when SOCIAL_BOT_DISABLED=true even if per-network flag is on', async () => {
      process.env.FILLIP_BOT_X_ENABLED = 'true'
      process.env.SOCIAL_BOT_DISABLED = 'true'
      const { XAdapter } = await import('@/lib/social-bot/adapters/x')
      expect(new XAdapter().isEnabled()).toBe(false)
    })
  })

  describe('post()', () => {
    it('happy path: posts text and returns id', async () => {
      const { XAdapter } = await import('@/lib/social-bot/adapters/x')
      const adapter = new XAdapter()
      const result = await adapter.post({ text: 'Test post', imageLocalPath: null })
      expect(result.id).toBe('tweet_id_456')
    })

    it('uploads media when imageLocalPath is provided', async () => {
      const { XAdapter } = await import('@/lib/social-bot/adapters/x')
      const adapter = new XAdapter()
      await adapter.post({ text: 'Test post', imageLocalPath: '/tmp/test.png' })
      expect(mockUploadMedia).toHaveBeenCalled()
      expect(mockTweet).toHaveBeenCalledWith(
        'Test post',
        { media: { media_ids: ['media_id_123'] } }
      )
    })

    it('throws when credentials are missing', async () => {
      delete process.env.SOCIAL_X_OAUTH_CLIENT_ID
      const { XAdapter } = await import('@/lib/social-bot/adapters/x')
      const adapter = new XAdapter()
      await expect(adapter.post({ text: 'test', imageLocalPath: null }))
        .rejects.toThrow('Missing X OAuth credentials')
    })
  })
})
