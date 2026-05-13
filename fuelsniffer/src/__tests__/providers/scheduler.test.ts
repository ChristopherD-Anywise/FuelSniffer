/**
 * Scheduler tests — verifies per-provider cron registration.
 * Tests that startScheduler() registers the expected number of cron jobs
 * and uses the correct cron expressions / timezones per provider.
 *
 * Approach: mock node-cron.schedule before any import; capture calls.
 * PROVIDER_SCHEDULES is a module-level constant, so we can't easily spy on it.
 * Instead we verify the _declared_ schedules match expectations by importing
 * the constants directly after mocking everything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks must be declared before any imports ──────────────────────────────────

const cronScheduleCalls: Array<{ cronExpr: string; opts: { timezone?: string; noOverlap?: boolean } }> = []

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(
      (cronExpr: string, _fn: () => void, opts: { timezone?: string; noOverlap?: boolean }) => {
        cronScheduleCalls.push({ cronExpr, opts })
      }
    ),
  },
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

vi.mock('@/lib/scraper/writer', () => ({
  runProviderScrape: vi.fn().mockResolvedValue({ pricesUpserted: 0, error: null, source: 'mock' }),
}))

// Mock all provider constructors to avoid real API calls on construction
vi.mock('@/lib/providers/fuel/qld', () => ({
  QldFuelProvider: class {
    id = 'qld'
    displayName = 'Queensland Fuel Prices'
    fetchStations = vi.fn().mockResolvedValue([])
    fetchPrices   = vi.fn().mockResolvedValue([])
    healthCheck   = vi.fn().mockResolvedValue({ status: 'ok', lastRunAt: null })
  },
}))

vi.mock('@/lib/providers/fuel/nsw/provider', () => ({
  NswFuelProvider: class {
    id = 'nsw'
    displayName = 'NSW FuelCheck'
    fetchStations = vi.fn().mockResolvedValue([])
    fetchPrices   = vi.fn().mockResolvedValue([])
    healthCheck   = vi.fn().mockResolvedValue({ status: 'ok', lastRunAt: null })
  },
}))

vi.mock('@/lib/providers/fuel/tas/provider', () => ({
  TasFuelProvider: class {
    id = 'tas'
    displayName = 'TAS FuelCheck'
    fetchStations = vi.fn().mockResolvedValue([])
    fetchPrices   = vi.fn().mockResolvedValue([])
    healthCheck   = vi.fn().mockResolvedValue({ status: 'ok', lastRunAt: null })
  },
}))

vi.mock('@/lib/providers/fuel/wa/provider', () => ({
  WaFuelProvider: class {
    id = 'wa'
    displayName = 'WA FuelWatch'
    fetchStations = vi.fn().mockResolvedValue([])
    fetchPrices   = vi.fn().mockResolvedValue([])
    healthCheck   = vi.fn().mockResolvedValue({ status: 'ok', lastRunAt: null })
  },
}))

vi.mock('@/lib/providers/fuel/nt/provider', () => ({
  NtFuelProvider: class {
    id = 'nt'
    displayName = 'NT MyFuel'
    fetchStations = vi.fn().mockResolvedValue([])
    fetchPrices   = vi.fn().mockResolvedValue([])
    healthCheck   = vi.fn().mockResolvedValue({ status: 'ok', lastRunAt: null })
  },
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { startScheduler } from '@/lib/scraper/scheduler'
import { clearProviders } from '@/lib/providers/fuel'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('scheduler — per-provider cron registration', () => {
  beforeEach(() => {
    cronScheduleCalls.length = 0
    clearProviders()
    vi.useFakeTimers()
    startScheduler()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearProviders()
  })

  it('registers exactly 7 cron jobs (5 providers + hourly refresh + nightly)', () => {
    // 5 providers (qld, nsw, tas, nt, wa) + hourly_prices refresh + nightly maintenance
    expect(cronScheduleCalls).toHaveLength(7)
  })

  it('QLD gets */15 * * * * cron with Australia/Brisbane', () => {
    const qldCall = cronScheduleCalls.find(
      c => c.cronExpr === '*/15 * * * *' && c.opts.timezone === 'Australia/Brisbane'
    )
    expect(qldCall).toBeDefined()
  })

  it('NSW gets */15 * * * * cron with Australia/Sydney', () => {
    const calls15min = cronScheduleCalls.filter(c => c.cronExpr === '*/15 * * * *')
    const nswCall = calls15min.find(c => c.opts.timezone === 'Australia/Sydney')
    expect(nswCall).toBeDefined()
  })

  it('TAS gets */15 * * * * cron with Australia/Hobart', () => {
    const calls15min = cronScheduleCalls.filter(c => c.cronExpr === '*/15 * * * *')
    const tasCall = calls15min.find(c => c.opts.timezone === 'Australia/Hobart')
    expect(tasCall).toBeDefined()
  })

  it('NT gets */30 * * * * cron with Australia/Darwin', () => {
    const ntCall = cronScheduleCalls.find(
      c => c.cronExpr === '*/30 * * * *' && c.opts.timezone === 'Australia/Darwin'
    )
    expect(ntCall).toBeDefined()
  })

  it('WA gets 30 6,14 * * * cron with Australia/Perth', () => {
    const waCall = cronScheduleCalls.find(
      c => c.cronExpr === '30 6,14 * * *' && c.opts.timezone === 'Australia/Perth'
    )
    expect(waCall).toBeDefined()
  })

  it('all cron jobs use noOverlap: true', () => {
    for (const call of cronScheduleCalls) {
      expect(call.opts.noOverlap).toBe(true)
    }
  })
})
