// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlotVerdict } from '@/components/slots/SlotVerdict'
import { SlotTrueCost } from '@/components/slots/SlotTrueCost'
import { SlotShareButton } from '@/components/slots/SlotShareButton'
import { SlotAlertButton } from '@/components/slots/SlotAlertButton'

// Minimal PriceResult stub for slot testing
const mockStation = {
  id: 1,
  name: 'Test Station',
  brand: 'Shell',
  address: '1 Test St',
  suburb: 'Brisbane',
  latitude: -27.4698,
  longitude: 153.0251,
  price_cents: '197.9',
  recorded_at: new Date().toISOString(),
  source_ts: new Date().toISOString(),
  fuel_type_id: '2',
  distance_km: 1.5,
  price_change: null,
  // SP-6 true-cost fields — default: no programme applied
  effective_price_cents: 197.9,
  applied_programme_id: null,
  applied_programme_name: null,
  applied_discount_cents: 0,
  considered_programme_ids: [],
} as const

// Station with a programme applied
const mockStationWithDiscount = {
  ...mockStation,
  price_cents: '197.9',
  effective_price_cents: 193.9,
  applied_programme_id: 'shell_vpower_rewards',
  applied_programme_name: 'Shell V-Power Rewards',
  applied_discount_cents: 4,
  considered_programme_ids: ['shell_vpower_rewards'],
} as const

describe('SlotVerdict', () => {
  it('renders without throwing', () => {
    const { container } = render(<SlotVerdict station={mockStation as never} />)
    expect(container).toBeTruthy()
  })

  it('reserves layout footprint with data-slot="verdict"', () => {
    const { container } = render(<SlotVerdict station={mockStation as never} />)
    const slot = container.querySelector('[data-slot="verdict"]')
    expect(slot).toBeTruthy()
  })

  it('is hidden from assistive technology', () => {
    const { container } = render(<SlotVerdict station={mockStation as never} />)
    const slot = container.querySelector('[data-slot="verdict"]')
    expect(slot?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('SlotTrueCost', () => {
  it('renders without throwing in card context', () => {
    const { container } = render(<SlotTrueCost station={mockStation as never} context="card" />)
    expect(container).toBeTruthy()
  })

  it('renders reserved footprint in card context (no discount)', () => {
    const { container } = render(<SlotTrueCost station={mockStation as never} context="card" />)
    const slot = container.querySelector('[data-slot="truecost"]')
    expect(slot).toBeTruthy()
  })

  it('renders null in popup context', () => {
    const { container } = render(<SlotTrueCost station={mockStation as never} context="popup" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null in detail context', () => {
    const { container } = render(<SlotTrueCost station={mockStation as never} context="detail" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders struck-through pylon and programme chip when discount applies', () => {
    const { container } = render(<SlotTrueCost station={mockStationWithDiscount as never} context="card" />)
    const slot = container.querySelector('[data-slot="truecost"]')
    expect(slot).toBeTruthy()
    // Should show struck-through pylon price
    expect(container.textContent).toContain('197.9¢')
    // Should show the discount amount
    expect(container.textContent).toContain('−4¢')
    // Should show the programme name (possibly truncated)
    expect(container.textContent).toContain('Shell V-Power')
  })

  it('reserves footprint even when applied_discount_cents is 0', () => {
    const noDiscount = { ...mockStation, applied_programme_id: 'racq', applied_discount_cents: 0 }
    const { container } = render(<SlotTrueCost station={noDiscount as never} context="card" />)
    const slot = container.querySelector('[data-slot="truecost"]')
    expect(slot).toBeTruthy()
  })
})

describe('SlotShareButton', () => {
  it('renders a disabled button', () => {
    render(<SlotShareButton station={mockStation as never} disabled />)
    const btn = screen.getByRole('button', { name: /share station/i })
    expect(btn).toBeTruthy()
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('has data-slot="share"', () => {
    const { container } = render(<SlotShareButton station={mockStation as never} disabled />)
    expect(container.querySelector('[data-slot="share"]')).toBeTruthy()
  })
})

describe('SlotAlertButton', () => {
  it('renders a disabled button', () => {
    render(<SlotAlertButton station={mockStation as never} disabled />)
    const btn = screen.getByRole('button', { name: /create.*alert/i })
    expect(btn).toBeTruthy()
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('has data-slot="alert"', () => {
    const { container } = render(<SlotAlertButton station={mockStation as never} disabled />)
    expect(container.querySelector('[data-slot="alert"]')).toBeTruthy()
  })
})
