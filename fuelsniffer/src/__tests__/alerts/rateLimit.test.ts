/**
 * SP-5 Alerts — rate limiter unit tests.
 */
import { describe, it, expect } from 'vitest'
import { checkRateLimit, MIN_INTERVAL_MS } from '@/lib/alerts/dispatcher/rateLimit'
import type { Alert, AlertType } from '@/lib/alerts/types'

function makeAlert(type: AlertType, lastFiredAt: Date | null = null): Alert {
  return {
    id: 1,
    userId: 'user-1',
    type,
    criteriaJson: {},
    channels: ['email'],
    paused: false,
    createdAt: new Date(),
    lastFiredAt,
    lastEvaluatedAt: null,
    label: null,
  }
}

describe('checkRateLimit', () => {
  const now = new Date('2026-04-24T10:00:00Z')

  it('allows if never fired (lastFiredAt is null)', () => {
    const alert = makeAlert('price_threshold', null)
    expect(checkRateLimit(alert, now).allowed).toBe(true)
  })

  it('blocks price_threshold within 4 hours', () => {
    const lastFired = new Date(now.getTime() - 3 * 60 * 60 * 1000) // 3h ago
    const alert = makeAlert('price_threshold', lastFired)
    const result = checkRateLimit(alert, now)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('rate_limit')
  })

  it('allows price_threshold after 4 hours', () => {
    const lastFired = new Date(now.getTime() - 4 * 60 * 60 * 1000 - 1) // 4h + 1ms ago
    const alert = makeAlert('price_threshold', lastFired)
    expect(checkRateLimit(alert, now).allowed).toBe(true)
  })

  it('allows at exactly the min interval boundary', () => {
    const lastFired = new Date(now.getTime() - MIN_INTERVAL_MS['price_threshold'])
    const alert = makeAlert('price_threshold', lastFired)
    expect(checkRateLimit(alert, now).allowed).toBe(true)
  })

  it('blocks favourite_drop within 4 hours', () => {
    const lastFired = new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2h ago
    const alert = makeAlert('favourite_drop', lastFired)
    expect(checkRateLimit(alert, now).allowed).toBe(false)
  })

  it('blocks cycle_low within 24 hours', () => {
    const lastFired = new Date(now.getTime() - 20 * 60 * 60 * 1000) // 20h ago
    const alert = makeAlert('cycle_low', lastFired)
    expect(checkRateLimit(alert, now).allowed).toBe(false)
  })

  it('allows cycle_low after 24 hours', () => {
    const lastFired = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1)
    const alert = makeAlert('cycle_low', lastFired)
    expect(checkRateLimit(alert, now).allowed).toBe(true)
  })

  it('blocks weekly_digest within 7 days', () => {
    const lastFired = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    const alert = makeAlert('weekly_digest', lastFired)
    expect(checkRateLimit(alert, now).allowed).toBe(false)
  })

  it('allows weekly_digest after 7 days', () => {
    const lastFired = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1)
    const alert = makeAlert('weekly_digest', lastFired)
    expect(checkRateLimit(alert, now).allowed).toBe(true)
  })
})
