/**
 * Tests for the weekly-postcode composer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  db: { execute: vi.fn() },
}))

vi.mock('@/lib/share/render-node', () => ({
  renderCardPng: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
}))

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/config/publicUrl', () => ({
  getPublicUrl: () => new URL('https://fillip.com.au'),
}))

import { db } from '@/lib/db/client'

// Helpers
function mockDbSequence(responses: Array<unknown>) {
  let call = 0
  vi.mocked(db.execute).mockImplementation(() => {
    const r = responses[call] ?? []
    call++
    return Promise.resolve(r as never)
  })
}

const FUEL_ROW = [{ id: 2 }]

const POSTCODE_ROWS = [
  { postcode: '4000', avg_price: 17400, reading_count: 50 },
  { postcode: '2000', avg_price: 17600, reading_count: 40 },
  { postcode: '3000', avg_price: 17800, reading_count: 30 },
]

const PCT5_ROW = [{ pct5: 15000 }] // sane 5th percentile

describe('composeWeeklyPost', () => {
  beforeEach(() => {
    process.env.APP_PUBLIC_URL = 'https://fillip.com.au'
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.APP_PUBLIC_URL
  })

  it('happy path: returns 3 approved posts (one per network)', async () => {
    mockDbSequence([FUEL_ROW, POSTCODE_ROWS, PCT5_ROW])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')

    expect(posts).toHaveLength(3)
    expect(posts.map(p => p.network).sort()).toEqual(['bluesky', 'mastodon', 'x'])
    posts.forEach(p => {
      expect(p.status).toBe('approved')
      expect(p.contentText).toContain('4000')
      expect(p.contentText).toContain('$174.00')
      expect(p.deepLink).toContain('utm_source=social-bot')
    })
  })

  it('respects text budget: X ≤ 280 chars', async () => {
    mockDbSequence([FUEL_ROW, POSTCODE_ROWS, PCT5_ROW])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    const xPost = posts.find(p => p.network === 'x')
    expect(xPost?.contentText.length).toBeLessThanOrEqual(280)
  })

  it('respects text budget: BlueSky ≤ 300 chars', async () => {
    mockDbSequence([FUEL_ROW, POSTCODE_ROWS, PCT5_ROW])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    const bskyPost = posts.find(p => p.network === 'bluesky')
    expect(bskyPost?.contentText.length).toBeLessThanOrEqual(300)
  })

  it('respects text budget: Mastodon ≤ 500 chars', async () => {
    mockDbSequence([FUEL_ROW, POSTCODE_ROWS, PCT5_ROW])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    const mastoPost = posts.find(p => p.network === 'mastodon')
    expect(mastoPost?.contentText.length).toBeLessThanOrEqual(500)
  })

  it('fallback: unknown fuel code → all cancelled', async () => {
    mockDbSequence([[]])  // empty fuel_types result
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('INVALID_FUEL')
    posts.forEach(p => {
      expect(p.status).toBe('cancelled')
      expect(p.errorText).toContain('unknown_fuel_code')
    })
  })

  it('fallback: no postcode data → all cancelled with insufficient_data', async () => {
    mockDbSequence([FUEL_ROW, []])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    posts.forEach(p => {
      expect(p.status).toBe('cancelled')
      expect(p.errorText).toBe('insufficient_data')
    })
  })

  it('fallback: insufficient total readings → all cancelled', async () => {
    // Only 10 total readings (below MIN_TOTAL_READINGS=30)
    const sparseRows = [
      { postcode: '4000', avg_price: 17400, reading_count: 5 },
      { postcode: '2000', avg_price: 17600, reading_count: 5 },
    ]
    mockDbSequence([FUEL_ROW, sparseRows])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    posts.forEach(p => {
      expect(p.status).toBe('cancelled')
      expect(p.errorText).toBe('insufficient_data')
    })
  })

  it('tie detection: includes tie note when 2+ postcodes within 0.2¢', async () => {
    const tiedRows = [
      { postcode: '4000', avg_price: 17400, reading_count: 50 },
      { postcode: '4001', avg_price: 17400.1, reading_count: 40 }, // within 0.2¢
      { postcode: '4002', avg_price: 17600, reading_count: 30 },
    ]
    mockDbSequence([FUEL_ROW, tiedRows, PCT5_ROW])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    const xPost = posts.find(p => p.network === 'x')
    expect(xPost?.contentText).toContain('tied with')
  })

  it('implausible price: skips winner and uses runner-up', async () => {
    const rowsWithImplausible = [
      { postcode: '4000', avg_price: 5000,  reading_count: 50 }, // implausibly cheap
      { postcode: '2000', avg_price: 17600, reading_count: 40 }, // valid runner-up
    ]
    // pct5 = 15000, implausible threshold = 15000 * 0.8 = 12000
    mockDbSequence([FUEL_ROW, rowsWithImplausible, PCT5_ROW])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    const xPost = posts.find(p => p.network === 'x')
    // Should use runner-up (2000), not implausible winner (4000 at $50)
    expect(xPost?.status).toBe('approved')
    expect(xPost?.contentText).toContain('2000')
    expect(xPost?.contentText).not.toContain('$50.00')
  })

  it('all candidates implausible → all cancelled', async () => {
    const allImplausible = [
      { postcode: '4000', avg_price: 1000, reading_count: 50 },
      { postcode: '2000', avg_price: 2000, reading_count: 40 },
    ]
    mockDbSequence([FUEL_ROW, allImplausible, PCT5_ROW])
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const posts = await composeWeeklyPost('U91')
    posts.forEach(p => {
      expect(p.status).toBe('cancelled')
      expect(p.errorText).toBe('implausible_price')
    })
  })
})
