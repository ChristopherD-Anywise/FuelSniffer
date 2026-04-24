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

  it('renders reserved footprint in card context', () => {
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
