/**
 * Cross-provider contract tests.
 * Verifies that every registered provider satisfies the FuelPriceProvider contract:
 * - Returns valid NormalisedStation[] (suburb is lowercase or null)
 * - Returns valid NormalisedPrice[] (priceCents in 50–400 range, or empty when disabled)
 * - healthCheck() returns a valid ProviderHealth object
 *
 * All feature flags are intentionally NOT set in these tests, so all non-QLD
 * providers return empty arrays. Contract tests assert the _shape_ is correct,
 * not the _content_.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QldFuelProvider }  from '@/lib/providers/fuel/qld'
import { NswFuelProvider }  from '@/lib/providers/fuel/nsw/provider'
import { TasFuelProvider }  from '@/lib/providers/fuel/tas/provider'
import { WaFuelProvider }   from '@/lib/providers/fuel/wa/provider'
import { NtFuelProvider }   from '@/lib/providers/fuel/nt/provider'
import type { FuelPriceProvider } from '@/lib/providers/fuel'

// ── Mock DB client (needed by QldFuelProvider.healthCheck) ────────────────────

import { vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}))

// ── Mock QLD API client (needs token) ────────────────��───────────────────────

vi.mock('@/lib/providers/fuel/qld/client', () => ({
  createApiClient: vi.fn().mockReturnValue({
    getFullSiteDetails: vi.fn().mockResolvedValue({ sites: [] }),
    getSitesPrices: vi.fn().mockResolvedValue({ SitePrices: [] }),
  }),
}))

vi.mock('@/lib/providers/fuel/qld/ckan-client', () => ({
  fetchCkanPrices:      vi.fn().mockResolvedValue([]),
  findLatestResourceId: vi.fn().mockResolvedValue({ resourceId: 'mock-resource-id' }),
  deduplicateToLatest:  vi.fn().mockReturnValue([]),
}))

// ── Provider list for contract verification ───────────────────────────────────

function makeProviders(): FuelPriceProvider[] {
  return [
    new QldFuelProvider(),
    new NswFuelProvider(),
    new TasFuelProvider(),
    new WaFuelProvider(),
    new NtFuelProvider(),
  ]
}

// ── Contract: fetchStations() ────────────────────────────��────────────────────

describe('Provider contract — fetchStations()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Ensure all feature flags are off (non-QLD providers return [])
    delete process.env.FILLIP_ENABLE_NSW
    delete process.env.FILLIP_ENABLE_TAS
    delete process.env.FILLIP_ENABLE_WA
    delete process.env.FILLIP_ENABLE_NT
    // QLD needs a token env var to not throw in the direct path
    process.env.QLD_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
  })

  for (const provider of makeProviders()) {
    it(`${provider.id}: fetchStations() returns an array`, async () => {
      const stations = await provider.fetchStations()
      expect(Array.isArray(stations)).toBe(true)
    })

    it(`${provider.id}: each station has required fields`, async () => {
      const stations = await provider.fetchStations()
      for (const s of stations) {
        expect(typeof s.id).toBe('number')
        expect(typeof s.externalId).toBe('string')
        expect(typeof s.sourceProvider).toBe('string')
        expect(typeof s.name).toBe('string')
        expect(typeof s.latitude).toBe('number')
        expect(typeof s.longitude).toBe('number')
      }
    })

    it(`${provider.id}: suburb is lowercase or null (SP-1 §0 amendment)`, async () => {
      const stations = await provider.fetchStations()
      for (const s of stations) {
        if (s.suburb !== null && s.suburb !== undefined) {
          expect(s.suburb).toBe(s.suburb.toLowerCase())
        }
      }
    })
  }
})

// ── Contract: fetchPrices() ───────────────────────────────────────────────────

describe('Provider contract — fetchPrices()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.FILLIP_ENABLE_NSW
    delete process.env.FILLIP_ENABLE_TAS
    delete process.env.FILLIP_ENABLE_WA
    delete process.env.FILLIP_ENABLE_NT
    process.env.QLD_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
  })

  for (const provider of makeProviders()) {
    it(`${provider.id}: fetchPrices() returns an array`, async () => {
      const prices = await provider.fetchPrices(new Date())
      expect(Array.isArray(prices)).toBe(true)
    })

    it(`${provider.id}: priceCents is in 50–400 range for all returned prices`, async () => {
      const prices = await provider.fetchPrices(new Date())
      for (const p of prices) {
        const cents = parseFloat(p.priceCents)
        expect(cents).toBeGreaterThanOrEqual(50)
        expect(cents).toBeLessThanOrEqual(400)
      }
    })
  }
})

// ── Contract: healthCheck() ────────────────────────────────���──────────────────

describe('Provider contract — healthCheck()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.FILLIP_ENABLE_NSW
    delete process.env.FILLIP_ENABLE_TAS
    delete process.env.FILLIP_ENABLE_WA
    delete process.env.FILLIP_ENABLE_NT
    process.env.QLD_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
  })

  for (const provider of makeProviders()) {
    it(`${provider.id}: healthCheck() returns valid ProviderHealth shape`, async () => {
      const health = await provider.healthCheck()
      expect(['ok', 'degraded', 'down']).toContain(health.status)
      // lastRunAt is Date or null
      expect(health.lastRunAt === null || health.lastRunAt instanceof Date).toBe(true)
    })
  }
})
