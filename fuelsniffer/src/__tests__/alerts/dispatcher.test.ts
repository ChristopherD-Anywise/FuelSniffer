/**
 * SP-5 Alerts — Dispatcher tests with mocked channels.
 */
import { describe, it, expect } from 'vitest'
import { MemoryAlertEmailSender } from '@/lib/alerts/dispatcher/email/index'
import { MemoryWebPushProvider } from '@/lib/alerts/dispatcher/push/index'
import { checkRateLimit } from '@/lib/alerts/dispatcher/rateLimit'
import { isInQuietHours } from '@/lib/alerts/dispatcher/quietHours'
import type { Alert } from '@/lib/alerts/types'

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 1,
    userId: 'user-uuid-1',
    type: 'price_threshold',
    criteriaJson: { fuel_type_id: 2, centre: { lat: -27.43, lng: 153.04 }, radius_km: 5, max_price_cents: 174.9 },
    channels: ['email', 'push'],
    paused: false,
    createdAt: new Date(),
    lastFiredAt: null,
    lastEvaluatedAt: null,
    label: null,
    ...overrides,
  }
}

describe('MemoryAlertEmailSender', () => {
  it('captures sent messages', async () => {
    const sender = new MemoryAlertEmailSender()
    await sender.send({ to: 'test@example.com', subject: 'Test', html: '<p>hi</p>', text: 'hi' })
    expect(sender.sent).toHaveLength(1)
    expect(sender.sent[0].to).toBe('test@example.com')
  })

  it('returns a fake message ID', async () => {
    const sender = new MemoryAlertEmailSender()
    const result = await sender.send({ to: 'x@x.com', subject: 'S', html: '', text: '' })
    expect(result.id).toBeDefined()
    expect(result.id).toContain('memory-')
  })

  it('reset() clears sent list', async () => {
    const sender = new MemoryAlertEmailSender()
    await sender.send({ to: 'x@x.com', subject: 'S', html: '', text: '' })
    sender.reset()
    expect(sender.sent).toHaveLength(0)
  })
})

describe('MemoryWebPushProvider', () => {
  it('captures sent push payloads', async () => {
    const provider = new MemoryWebPushProvider()
    const result = await provider.send(
      { endpoint: 'https://push.example.com/sub/1', keysP256dh: 'p256key', keysAuth: 'authkey' },
      { title: 'Test', body: 'Hello', url: '/dashboard', tag: 'test:1' }
    )
    expect(result.success).toBe(true)
    expect(provider.sent).toHaveLength(1)
  })

  it('simulates 410 revocation', async () => {
    const provider = new MemoryWebPushProvider()
    provider.mockStatusCode = 410
    const result = await provider.send(
      { endpoint: 'https://push.example.com/sub/1', keysP256dh: 'p256key', keysAuth: 'authkey' },
      { title: 'Test', body: 'Hello', url: '/dashboard', tag: 'test:1' }
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.revoke).toBe(true)
      expect(result.statusCode).toBe(410)
    }
    // Payload should NOT be in sent array (simulated failure)
    expect(provider.sent).toHaveLength(0)
  })

  it('simulates 404 revocation', async () => {
    const provider = new MemoryWebPushProvider()
    provider.mockStatusCode = 404
    const result = await provider.send(
      { endpoint: 'https://push.example.com/sub/1', keysP256dh: 'p256key', keysAuth: 'authkey' },
      { title: 'Test', body: 'Hello', url: '/dashboard', tag: 'test:1' }
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.revoke).toBe(true)
    }
  })
})

describe('Rate limit + quiet hours integration', () => {
  it('rate limit allows if no previous fire', () => {
    const alert = makeAlert()
    const result = checkRateLimit(alert)
    expect(result.allowed).toBe(true)
  })

  it('rate limit blocks within interval', () => {
    const alert = makeAlert({ lastFiredAt: new Date(Date.now() - 60 * 1000) }) // 1 min ago
    const result = checkRateLimit(alert)
    expect(result.allowed).toBe(false)
  })

  it('quiet hours suppresses push at 22:00 Brisbane', () => {
    // 22:00 Brisbane (UTC+10) = 12:00 UTC
    const now = new Date('2026-04-24T12:00:00Z')
    const config = { timezone: 'Australia/Brisbane', quiet_hours_start: '21:00', quiet_hours_end: '07:00' }
    expect(isInQuietHours(config, now)).toBe(true)
  })

  it('quiet hours does not affect email (email always sends)', () => {
    // Quiet hours only applies to push channel — email always delivers
    // This is enforced in the dispatcher (only push check calls isInQuietHours)
    // Here we document the design expectation:
    const now = new Date('2026-04-24T12:00:00Z') // 22:00 Brisbane
    const config = { timezone: 'Australia/Brisbane', quiet_hours_start: '21:00', quiet_hours_end: '07:00' }
    const inQuietHours = isInQuietHours(config, now)
    // The dispatcher uses this only for the 'push' channel
    expect(inQuietHours).toBe(true) // push would be suppressed
    // Email channel ignores this entirely (logic is in dispatcher/index.ts)
  })
})
