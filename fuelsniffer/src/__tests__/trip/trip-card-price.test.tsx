// @vitest-environment happy-dom
/**
 * T-TEST-1 — Price format regression.
 *
 * Ensures price_cents is rendered as c/L directly (NOT divided by 10).
 * Commit 42a6757 fixed a bug where 1979 was displayed as 19.8¢ instead of 197.9¢.
 * This test is a permanent regression guard.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TripStationCard from '@/components/TripStationCard'
import type { CorridorStation } from '@/lib/trip/corridor-query'

/**
 * NOTE: priceCents is stored as a float representing c/L directly.
 * e.g. 197.9 means 197.9¢/L (NOT 1979 divided by 10).
 * Commit 42a6757 fixed a bug where 197.9 was shown as 19.8¢ (÷10 error).
 * These tests guard against that regression.
 */

function makeStation(overrides: Partial<CorridorStation> = {}): CorridorStation {
  return {
    stationId: 1,
    externalId: 'ext-1',
    sourceProvider: 'qld',
    name: 'Test Shell',
    brand: 'Shell',
    address: '1 Test St',
    suburb: 'Brisbane',
    latitude: -27.47,
    longitude: 153.02,
    priceCents: 197.9,
    fuelTypeId: 2,
    detourMeters: 800,
    ...overrides,
  }
}

const defaultProps = {
  rank: 0,
  start: { lat: -27.47, lng: 153.02 },
  end: { lat: -27.50, lng: 153.05 },
  selectedId: null,
  onSelect: () => {},
  worstEffective: 197.9,
  tankSizeLitres: 50,
}

describe('TripStationCard — price format (÷10 regression)', () => {
  it('renders 197.9 priceCents as "197.9¢" (not 19.8¢)', () => {
    const station = makeStation({ priceCents: 197.9 })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={197.9} />)

    // The price text "197.9" should appear (¢ is in a separate span)
    expect(screen.getByText('197.9')).toBeTruthy()

    // Must NOT appear as the ÷10 bug value
    expect(screen.queryByText('19.8')).toBeNull()
    cleanup()
  })

  it('renders 201.9 priceCents as "201.9¢"', () => {
    const station = makeStation({ priceCents: 201.9 })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={201.9} />)
    expect(screen.getByText('201.9')).toBeTruthy()
    expect(screen.queryByText('20.2')).toBeNull()
    cleanup()
  })

  it('renders 150.0 priceCents as "150.0¢"', () => {
    const station = makeStation({ priceCents: 150.0 })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={150.0} />)
    expect(screen.getByText('150.0')).toBeTruthy()
    cleanup()
  })

  it('renders effectivePriceCents when present (e.g. discount applied)', () => {
    // pylon = 200.0, effective = 196.0 (after 4¢ RACQ discount)
    const station = makeStation({ priceCents: 200.0, effectivePriceCents: 196.0 })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={200.0} />)
    // Effective price (196.0) should be the primary price shown
    expect(screen.getByText('196.0')).toBeTruthy()
    // Pylon (200.0) should appear struck-through
    expect(screen.getByText('200.0¢')).toBeTruthy()
    cleanup()
  })

  it('does not show strikethrough when effectivePriceCents === priceCents', () => {
    const station = makeStation({ priceCents: 200.0, effectivePriceCents: 200.0 })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={200.0} />)
    // The pylon strikethrough element should NOT exist (effectiveCents === pylonCents)
    const pylon = screen.queryByLabelText(/Pylon price/)
    expect(pylon).toBeNull()
    cleanup()
  })
})
