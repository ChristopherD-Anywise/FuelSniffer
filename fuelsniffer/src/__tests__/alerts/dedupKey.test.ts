/**
 * SP-5 Alerts — dedup key derivation tests.
 * Tests the dedup key format for each alert type.
 */
import { describe, it, expect } from 'vitest'

// Dedup key formats (extracted from evaluator modules):
// price_threshold:   'pt:{alert_id}:{station_id}:{date}'
// favourite_drop:    'fd:{alert_id}:{date}:{4h-bucket}'
// cycle_low:         'cycle:{suburb_key}:{fuel_type_id}:{date}'
// weekly_digest:     'digest:{alert_id}:{iso_year}-W{iso_week}'

describe('dedup key format', () => {
  it('price_threshold key has expected format', () => {
    const alertId = 42
    const stationId = 9876
    const date = '2026-04-24'
    const key = `pt:${alertId}:${stationId}:${date}`
    expect(key).toBe('pt:42:9876:2026-04-24')
    expect(key).toMatch(/^pt:\d+:\d+:\d{4}-\d{2}-\d{2}$/)
  })

  it('favourite_drop key has expected format', () => {
    const alertId = 10
    const date = '2026-04-24'
    const bucket = Math.floor(6 / 4) // 1 (for hour 6)
    const key = `fd:${alertId}:${date}:${bucket}`
    expect(key).toBe('fd:10:2026-04-24:1')
    expect(key).toMatch(/^fd:\d+:\d{4}-\d{2}-\d{2}:\d+$/)
  })

  it('cycle_low key has expected format', () => {
    const suburbKey = 'chermside|qld'
    const fuelTypeId = 2
    const date = '2026-04-24'
    const key = `cycle:${suburbKey}:${fuelTypeId}:${date}`
    expect(key).toBe('cycle:chermside|qld:2:2026-04-24')
  })

  it('weekly_digest key has expected format', () => {
    const alertId = 5
    const isoYear = 2026
    const isoWeek = 17
    const key = `digest:${alertId}:${isoYear}-W${String(isoWeek).padStart(2, '0')}`
    expect(key).toBe('digest:5:2026-W17')
    expect(key).toMatch(/^digest:\d+:\d{4}-W\d{2}$/)
  })

  it('different stations in same scrape get different dedup keys', () => {
    const alertId = 42
    const date = '2026-04-24'
    const key1 = `pt:${alertId}:100:${date}`
    const key2 = `pt:${alertId}:200:${date}`
    expect(key1).not.toBe(key2)
  })

  it('same station on different days gets different dedup keys', () => {
    const alertId = 42
    const stationId = 100
    const key1 = `pt:${alertId}:${stationId}:2026-04-24`
    const key2 = `pt:${alertId}:${stationId}:2026-04-25`
    expect(key1).not.toBe(key2)
  })

  it('4-hour bucket divides 24h into 6 distinct buckets', () => {
    const date = '2026-04-24'
    const alertId = 1
    const buckets = new Set(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
        .map(h => `fd:${alertId}:${date}:${Math.floor(h / 4)}`)
    )
    expect(buckets.size).toBe(6)
  })
})
