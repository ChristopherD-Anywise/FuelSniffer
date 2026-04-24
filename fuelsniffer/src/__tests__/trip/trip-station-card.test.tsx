// @vitest-environment happy-dom
/**
 * T-TEST-4 — TripStationCard component tests.
 *
 * Tests verdict chip variants, price display, and Set-as-best-fill.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import TripStationCard from '@/components/TripStationCard'
import type { CorridorStation } from '@/lib/trip/corridor-query'
import type { CycleSignalView } from '@/lib/cycle/types'

function makeVerdict(state: CycleSignalView['state']): CycleSignalView {
  return {
    state,
    label: state,
    confidence: 0.8,
    suburb: 'Chermside',
    suburbKey: 'chermside|qld',
    fuelTypeId: 2,
    computedFor: '2026-04-24',
    computedAt: '2026-04-24T10:00:00Z',
    algoVersion: 'rule-v1',
    supporting: {
      windowMinCents: 1500,
      windowMaxCents: 2100,
      todayMedianCents: 1800,
      cheapestNowCents: 1700,
      positionInRange: 0.3,
      slope3dCents: -5,
      stationCountAvg: 15,
      daysWithData: 14,
    },
  }
}

// priceCents is a float c/L (e.g. 197.9 = 197.9¢/L)
function makeStation(overrides: Partial<CorridorStation> = {}): CorridorStation {
  return {
    stationId: 1,
    externalId: 'ext-1',
    sourceProvider: 'qld',
    name: 'Shell Chermside',
    brand: 'Shell',
    address: '123 Gympie Rd',
    suburb: 'Chermside',
    latitude: -27.38,
    longitude: 153.03,
    priceCents: 197.9,
    fuelTypeId: 2,
    detourMeters: 800,
    ...overrides,
  }
}

const defaultProps = {
  rank: 0,
  start: { lat: -27.47, lng: 153.02 },
  end: { lat: -27.38, lng: 153.03 },
  selectedId: null,
  onSelect: vi.fn(),
  worstEffective: 210.0,
  tankSizeLitres: 50,
}

describe('TripStationCard — verdict chip', () => {
  it('renders FILL_NOW chip', () => {
    const station = makeStation({ verdict: makeVerdict('FILL_NOW') })
    render(<TripStationCard station={station} {...defaultProps} />)
    expect(screen.getByText('Fill now')).toBeTruthy()
    cleanup()
  })

  it('renders WAIT chip for WAIT_FOR_DROP', () => {
    const station = makeStation({ verdict: makeVerdict('WAIT_FOR_DROP') })
    render(<TripStationCard station={station} {...defaultProps} />)
    expect(screen.getByText('Wait')).toBeTruthy()
    cleanup()
  })

  it('does NOT render chip for HOLD (quiet omit)', () => {
    const station = makeStation({ verdict: makeVerdict('HOLD') })
    render(<TripStationCard station={station} {...defaultProps} />)
    expect(screen.queryByText('Hold')).toBeNull()
    cleanup()
  })

  it('does NOT render chip for UNCERTAIN (quiet omit)', () => {
    const station = makeStation({ verdict: makeVerdict('UNCERTAIN') })
    render(<TripStationCard station={station} {...defaultProps} />)
    expect(screen.queryByText('Mixed signal')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    cleanup()
  })

  it('does NOT render chip when verdict is null', () => {
    const station = makeStation({ verdict: null })
    render(<TripStationCard station={station} {...defaultProps} />)
    expect(screen.queryByRole('status')).toBeNull()
    cleanup()
  })

  it('does NOT render chip when verdict is undefined', () => {
    const station = makeStation({ verdict: undefined })
    render(<TripStationCard station={station} {...defaultProps} />)
    expect(screen.queryByRole('status')).toBeNull()
    cleanup()
  })
})

describe('TripStationCard — effective price and pylon strikethrough', () => {
  it('shows strikethrough pylon when effectivePriceCents < priceCents', () => {
    const station = makeStation({ priceCents: 200.0, effectivePriceCents: 196.0 })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={200.0} />)
    const pylonEl = screen.getByLabelText(/Pylon price/)
    expect(pylonEl).toBeTruthy()
    expect(pylonEl.textContent).toBe('200.0¢')
    cleanup()
  })

  it('does NOT show strikethrough when no effectivePriceCents', () => {
    const station = makeStation({ priceCents: 200.0, effectivePriceCents: undefined })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={200.0} />)
    expect(screen.queryByLabelText(/Pylon price/)).toBeNull()
    cleanup()
  })

  it('does NOT show strikethrough when effectivePriceCents === priceCents', () => {
    const station = makeStation({ priceCents: 200.0, effectivePriceCents: 200.0 })
    render(<TripStationCard station={station} {...defaultProps} worstEffective={200.0} />)
    expect(screen.queryByLabelText(/Pylon price/)).toBeNull()
    cleanup()
  })
})

describe('TripStationCard — Set as best fill', () => {
  it('calls onSetBestFill with station id when clicked', () => {
    const onSetBestFill = vi.fn()
    const station = makeStation()
    render(
      <TripStationCard
        station={station}
        {...defaultProps}
        onSetBestFill={onSetBestFill}
        bestFillId={null}
      />
    )
    const btn = screen.getByRole('button', { name: /Set.*best fill/ })
    fireEvent.click(btn)
    expect(onSetBestFill).toHaveBeenCalledWith(1)
    cleanup()
  })

  it('shows "Best fill" label and aria-pressed=true when this station is best fill', () => {
    const station = makeStation()
    render(
      <TripStationCard
        station={station}
        {...defaultProps}
        onSetBestFill={vi.fn()}
        bestFillId={1}
      />
    )
    const btn = screen.getByRole('button', { name: /best fill/i })
    expect((btn as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true')
    cleanup()
  })

  it('does NOT render Set as best fill when onSetBestFill is not provided', () => {
    const station = makeStation()
    render(<TripStationCard station={station} {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /best fill/i })).toBeNull()
    cleanup()
  })
})

describe('TripStationCard — selection', () => {
  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn()
    const station = makeStation()
    render(<TripStationCard station={station} {...defaultProps} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('listitem'))
    expect(onSelect).toHaveBeenCalledWith(1)
    cleanup()
  })

  it('calls onSelect when Enter is pressed on card', () => {
    const onSelect = vi.fn()
    const station = makeStation()
    render(<TripStationCard station={station} {...defaultProps} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('listitem'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(1)
    cleanup()
  })
})
