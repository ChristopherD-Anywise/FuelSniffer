/**
 * Tests for the social bot scheduler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockSchedule = vi.fn()

vi.mock('node-cron', () => ({
  default: { schedule: mockSchedule },
  schedule: mockSchedule,
}))

vi.mock('@/lib/social-bot/composer', () => ({
  composeWeeklyPost: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/social-bot/dispatch', () => ({
  dispatchPosts: vi.fn().mockResolvedValue(undefined),
}))

describe('startBotScheduler', () => {
  beforeEach(() => {
    delete process.env.SOCIAL_BOT_DISABLED
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.SOCIAL_BOT_DISABLED
  })

  it('registers exactly one cron task', async () => {
    const { startBotScheduler } = await import('@/lib/social-bot/scheduler')
    startBotScheduler()
    expect(mockSchedule).toHaveBeenCalledOnce()
  })

  it('registers with correct cron expression and timezone', async () => {
    const { startBotScheduler, BOT_CRON_EXPRESSION, BOT_CRON_TZ } = await import('@/lib/social-bot/scheduler')
    startBotScheduler()
    expect(mockSchedule).toHaveBeenCalledWith(
      BOT_CRON_EXPRESSION,
      expect.any(Function),
      expect.objectContaining({ timezone: BOT_CRON_TZ })
    )
  })

  it('cron expression is Mon 07:00', async () => {
    const { BOT_CRON_EXPRESSION } = await import('@/lib/social-bot/scheduler')
    expect(BOT_CRON_EXPRESSION).toBe('0 7 * * 1')
  })

  it('timezone is Australia/Brisbane', async () => {
    const { BOT_CRON_TZ } = await import('@/lib/social-bot/scheduler')
    expect(BOT_CRON_TZ).toBe('Australia/Brisbane')
  })

  it('does NOT register when SOCIAL_BOT_DISABLED=true', async () => {
    process.env.SOCIAL_BOT_DISABLED = 'true'
    const { startBotScheduler } = await import('@/lib/social-bot/scheduler')
    startBotScheduler()
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('calls composeWeeklyPost and dispatchPosts when cron fires', async () => {
    const { startBotScheduler } = await import('@/lib/social-bot/scheduler')
    const { composeWeeklyPost } = await import('@/lib/social-bot/composer')
    const { dispatchPosts } = await import('@/lib/social-bot/dispatch')

    startBotScheduler()

    // Extract the registered callback and invoke it
    const callback = mockSchedule.mock.calls[0][1] as () => Promise<void>
    await callback()

    expect(composeWeeklyPost).toHaveBeenCalledWith('U91')
    expect(dispatchPosts).toHaveBeenCalled()
  })
})
