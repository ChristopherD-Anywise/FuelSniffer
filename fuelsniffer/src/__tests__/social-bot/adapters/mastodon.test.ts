/**
 * Tests for Mastodon adapter.
 * Mocks fetch to avoid real API calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
}))

describe('MastodonAdapter', () => {
  const creds = {
    SOCIAL_MASTODON_INSTANCE_URL: 'https://aus.social',
    SOCIAL_MASTODON_ACCESS_TOKEN: 'mastodon_token_abc',
  }

  beforeEach(() => {
    Object.assign(process.env, creds)
    delete process.env.SOCIAL_BOT_DISABLED
    delete process.env.FILLIP_BOT_MASTODON_ENABLED
  })

  afterEach(() => {
    for (const key of Object.keys(creds)) delete process.env[key]
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  function mockFetch(responses: Array<{ ok: boolean; status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> }>) {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const r = responses[callCount] ?? responses[responses.length - 1]
      callCount++
      return Promise.resolve({
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 500),
        json: r.json ?? (() => Promise.resolve({ id: 'status_id_789' })),
        text: r.text ?? (() => Promise.resolve('')),
      })
    }))
  }

  describe('isEnabled()', () => {
    it('returns false when FILLIP_BOT_MASTODON_ENABLED is not set', async () => {
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      expect(new MastodonAdapter().isEnabled()).toBe(false)
    })

    it('returns true when FILLIP_BOT_MASTODON_ENABLED=true', async () => {
      process.env.FILLIP_BOT_MASTODON_ENABLED = 'true'
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      expect(new MastodonAdapter().isEnabled()).toBe(true)
    })

    it('returns false when kill switch is on', async () => {
      process.env.FILLIP_BOT_MASTODON_ENABLED = 'true'
      process.env.SOCIAL_BOT_DISABLED = 'true'
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      expect(new MastodonAdapter().isEnabled()).toBe(false)
    })
  })

  describe('post()', () => {
    it('happy path: posts text-only and returns status id', async () => {
      mockFetch([{
        ok: true,
        json: () => Promise.resolve({ id: 'status_789', url: 'https://aus.social/@fillip/789' }),
      }])
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      const adapter = new MastodonAdapter()
      const result = await adapter.post({ text: 'Test post', imageLocalPath: null })
      expect(result.id).toBe('status_789')

      const mockFetchFn = vi.mocked(fetch)
      const statusCall = mockFetchFn.mock.calls[0]
      expect(String(statusCall[0])).toContain('/api/v1/statuses')
      expect((statusCall[1] as RequestInit)?.headers).toMatchObject({ Authorization: 'Bearer mastodon_token_abc' })
    })

    it('uploads media and attaches to post when imageLocalPath is provided', async () => {
      mockFetch([
        // Media upload
        { ok: true, json: () => Promise.resolve({ id: 'media_id_001' }) },
        // Status post
        { ok: true, json: () => Promise.resolve({ id: 'status_with_media' }) },
      ])
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      const adapter = new MastodonAdapter()
      const result = await adapter.post({ text: 'Post with image', imageLocalPath: '/tmp/test.png' })
      expect(result.id).toBe('status_with_media')

      const mockFetchFn = vi.mocked(fetch)
      // First call: media upload
      expect(String(mockFetchFn.mock.calls[0][0])).toContain('/api/v2/media')
      // Second call: status post with media_ids
      const statusBody = JSON.parse((mockFetchFn.mock.calls[1][1] as RequestInit)?.body as string)
      expect(statusBody.media_ids).toContain('media_id_001')
    })

    it('throws on 401 response from status post', async () => {
      mockFetch([{ ok: false, status: 401 }])
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      const adapter = new MastodonAdapter()
      await expect(adapter.post({ text: 'test', imageLocalPath: null }))
        .rejects.toThrow('unauthorized (401)')
    })

    it('throws on 5xx response from status post', async () => {
      mockFetch([{ ok: false, status: 503, text: () => Promise.resolve('Service Unavailable') }])
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      const adapter = new MastodonAdapter()
      await expect(adapter.post({ text: 'test', imageLocalPath: null }))
        .rejects.toThrow('503')
    })

    it('throws when SOCIAL_MASTODON_ACCESS_TOKEN is missing', async () => {
      delete process.env.SOCIAL_MASTODON_ACCESS_TOKEN
      const { MastodonAdapter } = await import('@/lib/social-bot/adapters/mastodon')
      const adapter = new MastodonAdapter()
      await expect(adapter.post({ text: 'test', imageLocalPath: null }))
        .rejects.toThrow('Missing Mastodon credentials')
    })
  })
})
