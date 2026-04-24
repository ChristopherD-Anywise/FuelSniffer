/**
 * SP-5 Alerts — Zod criteria schema validation tests.
 */
import { describe, it, expect } from 'vitest'
import {
  PriceThresholdCriteria,
  CycleLowCriteria,
  FavouriteDropCriteria,
  WeeklyDigestCriteria,
  validateCriteria,
} from '@/lib/alerts/criteria'

describe('PriceThresholdCriteria', () => {
  const valid = {
    fuel_type_id: 2,
    centre: { lat: -27.43, lng: 153.04 },
    radius_km: 5,
    max_price_cents: 174.9,
  }

  it('accepts valid input', () => {
    expect(PriceThresholdCriteria.safeParse(valid).success).toBe(true)
  })

  it('rejects missing fuel_type_id', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fuel_type_id: _, ...rest } = valid
    expect(PriceThresholdCriteria.safeParse(rest).success).toBe(false)
  })

  it('rejects extra keys (strict)', () => {
    expect(PriceThresholdCriteria.safeParse({ ...valid, extra: 'nope' }).success).toBe(false)
  })

  it('rejects out-of-range lat', () => {
    expect(PriceThresholdCriteria.safeParse({ ...valid, centre: { lat: -200, lng: 153 } }).success).toBe(false)
  })

  it('rejects negative radius', () => {
    expect(PriceThresholdCriteria.safeParse({ ...valid, radius_km: -1 }).success).toBe(false)
  })

  it('rejects radius > 100', () => {
    expect(PriceThresholdCriteria.safeParse({ ...valid, radius_km: 101 }).success).toBe(false)
  })
})

describe('CycleLowCriteria', () => {
  const valid = { suburb_key: 'chermside|qld', fuel_type_id: 2 }

  it('accepts valid input', () => {
    expect(CycleLowCriteria.safeParse(valid).success).toBe(true)
  })

  it('rejects empty suburb_key', () => {
    expect(CycleLowCriteria.safeParse({ ...valid, suburb_key: '' }).success).toBe(false)
  })

  it('rejects extra keys', () => {
    expect(CycleLowCriteria.safeParse({ ...valid, extra: 'nope' }).success).toBe(false)
  })
})

describe('FavouriteDropCriteria', () => {
  const valid = {
    station_id: 9876,
    fuel_type_id: 2,
    min_drop_cents: 5,
    window_minutes: 60,
  }

  it('accepts valid input', () => {
    expect(FavouriteDropCriteria.safeParse(valid).success).toBe(true)
  })

  it('rejects window_minutes > 1440', () => {
    expect(FavouriteDropCriteria.safeParse({ ...valid, window_minutes: 1441 }).success).toBe(false)
  })

  it('rejects non-positive min_drop_cents', () => {
    expect(FavouriteDropCriteria.safeParse({ ...valid, min_drop_cents: 0 }).success).toBe(false)
  })

  it('rejects extra keys', () => {
    expect(FavouriteDropCriteria.safeParse({ ...valid, extra: 'x' }).success).toBe(false)
  })
})

describe('WeeklyDigestCriteria', () => {
  const valid = {
    centre: { lat: -27.43, lng: 153.04 },
    radius_km: 10,
    fuel_type_id: 2,
  }

  it('accepts valid input', () => {
    expect(WeeklyDigestCriteria.safeParse(valid).success).toBe(true)
  })

  it('rejects missing fuel_type_id', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fuel_type_id: _, ...rest } = valid
    expect(WeeklyDigestCriteria.safeParse(rest).success).toBe(false)
  })
})

describe('validateCriteria', () => {
  it('validates price_threshold correctly', () => {
    const result = validateCriteria('price_threshold', {
      fuel_type_id: 2,
      centre: { lat: -27.43, lng: 153.04 },
      radius_km: 5,
      max_price_cents: 174.9,
    })
    expect(result.success).toBe(true)
  })

  it('returns error for malformed cycle_low', () => {
    const result = validateCriteria('cycle_low', { suburb_key: '', fuel_type_id: 2 })
    expect(result.success).toBe(false)
  })

  it('returns error for unknown type', () => {
    const result = validateCriteria('unknown_type' as never, {})
    expect(result.success).toBe(false)
  })
})
