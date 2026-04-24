/**
 * SP-5 Alerts — template snapshot tests.
 * Renders each email template + push payload builder against fixed fixtures.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock SESSION_SECRET for createAlertToken
vi.stubEnv('SESSION_SECRET', 'test-secret-32-chars-long-enough-!!')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://fillip.clarily.au')

describe('priceThreshold email template', () => {
  it('renders subject, html, and text for a price threshold alert', async () => {
    const { renderPriceThresholdEmail } = await import('@/lib/alerts/dispatcher/templates/email/priceThreshold')
    const result = await renderPriceThresholdEmail({
      alertId: 42,
      userEmail: 'test@example.com',
      fuelName: 'U91',
      stationName: 'Shell Chermside',
      stationId: 9876,
      priceCents: 17490,
      maxPriceCents: 17500,
      distanceKm: 2.3,
      suburbDisplay: 'Chermside',
    })

    expect(result.subject).toBe('U91 just hit $174.9 near you')
    expect(result.html).toContain('$174.9')
    expect(result.html).toContain('Shell Chermside')
    expect(result.html).toContain('2.3 km')
    expect(result.html).toContain('Manage all alerts')
    expect(result.text).toContain('$174.9')
    expect(result.text).toContain('Shell Chermside')

    // Spam Act compliance: unsubscribe link present
    expect(result.html).toContain('Unsubscribe from this alert')
    expect(result.html).toContain('Pause this alert')
  })

  it('subject is ≤50 chars', async () => {
    const { renderPriceThresholdEmail } = await import('@/lib/alerts/dispatcher/templates/email/priceThreshold')
    const result = await renderPriceThresholdEmail({
      alertId: 1,
      userEmail: 'test@example.com',
      fuelName: 'U91',
      stationName: 'Test',
      stationId: 1,
      priceCents: 17490,
      maxPriceCents: 18000,
      distanceKm: 1.0,
    })
    expect(result.subject.length).toBeLessThanOrEqual(50)
  })
})

describe('cycleLow email template', () => {
  it('renders cycle low alert with top stations', async () => {
    const { renderCycleLowEmail } = await import('@/lib/alerts/dispatcher/templates/email/cycleLow')
    const result = await renderCycleLowEmail({
      alertId: 10,
      userEmail: 'test@example.com',
      fuelName: 'U91',
      suburbDisplay: 'Chermside',
      topStations: [
        { name: 'Shell Chermside', priceCents: 17490, distanceKm: 0.5 },
        { name: 'BP North', priceCents: 17510, distanceKm: 1.2 },
      ],
    })

    expect(result.subject).toContain('Fill now')
    expect(result.subject).toContain('Chermside')
    expect(result.html).toContain('FILL NOW')
    expect(result.html).toContain('Shell Chermside')
    expect(result.html).toContain('$174.9')
    expect(result.subject.length).toBeLessThanOrEqual(50)
  })
})

describe('favouriteDrop email template', () => {
  it('renders favourite drop alert', async () => {
    const { renderFavouriteDropEmail } = await import('@/lib/alerts/dispatcher/templates/email/favouriteDrop')
    const result = await renderFavouriteDropEmail({
      alertId: 20,
      userEmail: 'test@example.com',
      fuelName: 'U91',
      stationName: 'Caltex Aspley',
      stationId: 1234,
      priceCents: 17200,
      dropCents: 12,
    })

    expect(result.subject).toContain('12¢')
    expect(result.html).toContain('Caltex Aspley')
    expect(result.html).toContain('$172.0')
    expect(result.subject.length).toBeLessThanOrEqual(50)
  })
})

describe('weeklyDigest email template', () => {
  it('renders weekly digest', async () => {
    const { renderWeeklyDigestEmail } = await import('@/lib/alerts/dispatcher/templates/email/weeklyDigest')
    const result = await renderWeeklyDigestEmail({
      alertId: 30,
      userEmail: 'test@example.com',
      fuelName: 'U91',
      suburbDisplay: 'Chermside',
      bestDayToFill: 'Wednesday',
      signalState: 'FILL_NOW',
      signalLabel: 'Fill now — prices at cycle low',
      topStations: [
        { name: 'Shell Chermside', priceCents: 17490, distanceKm: 0.5 },
      ],
    })

    expect(result.subject).toBe('Your fuel outlook for this week')
    expect(result.html).toContain('Wednesday')
    expect(result.html).toContain('Fill now')
    expect(result.html).toContain('Shell Chermside')
  })
})

describe('push payload builder', () => {
  it('builds price_threshold payload', async () => {
    const { buildPushPayload } = await import('@/lib/alerts/dispatcher/templates/push')
    const payload = buildPushPayload(42, 'price_threshold', {
      fuelName: 'U91',
      stationName: 'Shell Chermside',
      stationId: 9876,
      priceCents: 17490,
      distanceKm: 2.3,
    })
    expect(payload.title).toContain('U91')
    expect(payload.title).toContain('$174.9')
    expect(payload.body).toContain('Shell Chermside')
    expect(payload.tag).toBe('fillip:pt:42:9876')
    expect(payload.url).toContain('/dashboard/station/9876')
    expect(payload.icon).toBe('/icons/fillip-192.png')
  })

  it('builds cycle_low payload', async () => {
    const { buildPushPayload } = await import('@/lib/alerts/dispatcher/templates/push')
    const payload = buildPushPayload(10, 'cycle_low', {
      fuelName: 'U91',
      suburbDisplay: 'Chermside',
    })
    expect(payload.title).toContain('Fill now')
    expect(payload.tag).toBe('fillip:cl:10')
  })

  it('builds favourite_drop payload', async () => {
    const { buildPushPayload } = await import('@/lib/alerts/dispatcher/templates/push')
    const payload = buildPushPayload(20, 'favourite_drop', {
      fuelName: 'U91',
      stationName: 'Caltex Aspley',
      stationId: 1234,
      priceCents: 17200,
      dropCents: 12,
    })
    expect(payload.title).toContain('Caltex Aspley')
    expect(payload.body).toContain('12¢')
    expect(payload.tag).toBe('fillip:fd:20')
  })

  it('builds weekly_digest payload', async () => {
    const { buildPushPayload } = await import('@/lib/alerts/dispatcher/templates/push')
    const payload = buildPushPayload(30, 'weekly_digest', {
      fuelName: 'U91',
      suburbDisplay: 'Chermside',
    })
    expect(payload.title).toContain('weekly fuel outlook')
    expect(payload.tag).toBe('fillip:wd:30')
  })
})
