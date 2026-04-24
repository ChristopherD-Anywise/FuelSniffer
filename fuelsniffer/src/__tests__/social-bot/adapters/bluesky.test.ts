/**
 * Tests for BlueSky adapter.
 * Mocks @atproto/api to avoid real API calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockLogin = vi.fn().mockResolvedValue(undefined)
const mockUploadBlob = vi.fn().mockResolvedValue({ data: { blob: { ref: { $link: 'blob_link' } } } })
const mockPost = vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.post/abc123', cid: 'cid' })

vi.mock('@atproto/api', () => {
  return {
    BskyAgent: class MockBskyAgent {
      login = mockLogin
      uploadBlob = mockUploadBlob
      post = mockPost
    },
  }
})

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
}))

describe('BlueSkyAdapter', () => {
  const creds = {
    SOCIAL_BLUESKY_HANDLE: 'fillip.bsky.social',
    SOCIAL_BLUESKY_APP_PASSWORD: 'app-password-123',
  }

  beforeEach(() => {
    Object.assign(process.env, creds)
    delete process.env.SOCIAL_BOT_DISABLED
    delete process.env.FILLIP_BOT_BLUESKY_ENABLED
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const key of Object.keys(creds)) delete process.env[key]
  })

  describe('isEnabled()', () => {
    it('returns false when FILLIP_BOT_BLUESKY_ENABLED is not set', async () => {
      const { BlueSkyAdapter } = await import('@/lib/social-bot/adapters/bluesky')
      expect(new BlueSkyAdapter().isEnabled()).toBe(false)
    })

    it('returns true when FILLIP_BOT_BLUESKY_ENABLED=true', async () => {
      process.env.FILLIP_BOT_BLUESKY_ENABLED = 'true'
      const { BlueSkyAdapter } = await import('@/lib/social-bot/adapters/bluesky')
      expect(new BlueSkyAdapter().isEnabled()).toBe(true)
    })

    it('returns false when kill switch is on', async () => {
      process.env.FILLIP_BOT_BLUESKY_ENABLED = 'true'
      process.env.SOCIAL_BOT_DISABLED = 'true'
      const { BlueSkyAdapter } = await import('@/lib/social-bot/adapters/bluesky')
      expect(new BlueSkyAdapter().isEnabled()).toBe(false)
    })
  })

  describe('post()', () => {
    it('happy path: authenticates and posts, returns URI as id', async () => {
      const { BlueSkyAdapter } = await import('@/lib/social-bot/adapters/bluesky')
      const adapter = new BlueSkyAdapter()
      const result = await adapter.post({ text: 'Test post', imageLocalPath: null })
      expect(mockLogin).toHaveBeenCalledWith({ identifier: 'fillip.bsky.social', password: 'app-password-123' })
      expect(mockPost).toHaveBeenCalled()
      expect(result.id).toContain('at://')
    })

    it('uploads blob when imageLocalPath is provided', async () => {
      const { BlueSkyAdapter } = await import('@/lib/social-bot/adapters/bluesky')
      const adapter = new BlueSkyAdapter()
      await adapter.post({ text: 'Test post', imageLocalPath: '/tmp/test.png' })
      expect(mockUploadBlob).toHaveBeenCalled()
      const postCall = mockPost.mock.calls[0][0]
      expect(postCall).toHaveProperty('embed')
      expect(postCall.embed.$type).toBe('app.bsky.embed.images')
    })

    it('skips embed when no imageLocalPath', async () => {
      const { BlueSkyAdapter } = await import('@/lib/social-bot/adapters/bluesky')
      const adapter = new BlueSkyAdapter()
      await adapter.post({ text: 'No image', imageLocalPath: null })
      expect(mockUploadBlob).not.toHaveBeenCalled()
      const postCall = mockPost.mock.calls[0][0]
      expect(postCall).not.toHaveProperty('embed')
    })

    it('throws when credentials are missing', async () => {
      delete process.env.SOCIAL_BLUESKY_HANDLE
      const { BlueSkyAdapter } = await import('@/lib/social-bot/adapters/bluesky')
      const adapter = new BlueSkyAdapter()
      await expect(adapter.post({ text: 'test', imageLocalPath: null }))
        .rejects.toThrow('Missing BlueSky credentials')
    })
  })
})
