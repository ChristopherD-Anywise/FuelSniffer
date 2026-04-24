'use client'
/**
 * TripStationList — SP-7 redesigned station list.
 *
 * Delegates rendering to TripStationCard.
 * Improved empty state with actionable buttons.
 * Results count announced via role="status" aria-live.
 */

import TripStationCard from '@/components/TripStationCard'
import { FUEL_TYPES } from '@/components/FuelSelect'
import type { CorridorStation } from '@/lib/trip/corridor-query'

interface TripStationListProps {
  stations: CorridorStation[]
  start: { lat: number; lng: number }
  end: { lat: number; lng: number }
  selectedId: number | null
  onSelect: (id: number) => void
  onSetBestFill?: (id: number) => void
  bestFillId?: number | null
  /** Current corridor width in km — shown in empty state */
  corridorKm?: number
  /** Current fuel type id — shown in empty state */
  fuelTypeId?: string
  /** Called when user clicks "Widen to 5 km" in empty state */
  onWidenCorridor?: () => void
  /** Called when user wants to change fuel type */
  onChangeFuel?: () => void
  /** Tank size in litres for "save $X" computation */
  tankSizeLitres?: number
}

export default function TripStationList({
  stations,
  start,
  end,
  selectedId,
  onSelect,
  onSetBestFill,
  bestFillId,
  corridorKm = 3,
  fuelTypeId = '2',
  onWidenCorridor,
  onChangeFuel,
  tankSizeLitres = 50,
}: TripStationListProps) {
  const fuelLabel = FUEL_TYPES.find(f => f.id === fuelTypeId)?.label ?? 'this fuel type'

  if (stations.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--color-text-subtle)',
          fontSize: '14px',
        }}
      >
        <div style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--color-text)' }}>
          No stations found
        </div>
        <div style={{ fontSize: '13px', marginBottom: '16px' }}>
          No fuel stations within <strong style={{ color: 'var(--color-text)' }}>{corridorKm} km</strong> of this route for{' '}
          <strong style={{ color: 'var(--color-text)' }}>{fuelLabel}</strong>.
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {onWidenCorridor && corridorKm < 5 && (
            <button
              type="button"
              onClick={onWidenCorridor}
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--color-accent)',
                background: 'var(--color-accent-muted)',
                color: 'var(--color-accent)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Widen to 5 km
            </button>
          )}
          {onChangeFuel && (
            <button
              type="button"
              onClick={onChangeFuel}
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-subtle)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try a different fuel
            </button>
          )}
        </div>
      </div>
    )
  }

  // Compute worst effective price for "save $X" callouts
  const worstEffective = Math.max(
    ...stations.map(s => s.effectivePriceCents ?? s.priceCents)
  )

  return (
    <div id="station-list">
      {/* Results count — announced to screen readers on change */}
      <div
        role="status"
        aria-live="polite"
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--color-text-subtle)',
          padding: '8px 16px 0',
          letterSpacing: '0.02em',
        }}
      >
        {stations.length} station{stations.length !== 1 ? 's' : ''} found
      </div>

      <div role="list" aria-label="Fuel stations along route">
        {stations.map((station, rank) => (
          <TripStationCard
            key={station.stationId}
            station={station}
            rank={rank}
            start={start}
            end={end}
            selectedId={selectedId}
            onSelect={onSelect}
            onSetBestFill={onSetBestFill}
            bestFillId={bestFillId}
            worstEffective={worstEffective}
            tankSizeLitres={tankSizeLitres}
            shouldScroll={true}
            fuelTypeLabel={fuelLabel}
          />
        ))}
      </div>
    </div>
  )
}
