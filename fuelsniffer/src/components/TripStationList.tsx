'use client'

import NavigateButton from '@/components/NavigateButton'
import type { CorridorStation } from '@/lib/trip/corridor-query'

interface TripStationListProps {
  stations: CorridorStation[]
  start: { lat: number; lng: number }
  end: { lat: number; lng: number }
  selectedId: number | null
  onSelect: (id: number) => void
}

function detourMinutes(detourMeters: number): number {
  // Approx detour time at 60 km/h: meters / 1000 km * (60 min/h)
  return Math.max(1, Math.round((detourMeters / 1000) * (60 / 60)))
}

export default function TripStationList({ stations, start, end, selectedId, onSelect }: TripStationListProps) {
  if (stations.length === 0) {
    return (
      <div style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--color-text-subtle)',
        fontSize: '14px',
      }}>
        No stations found along this corridor.
        <br />
        <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>Try widening the corridor.</span>
      </div>
    )
  }

  const prices = stations.map(s => s.priceCents)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  return (
    <div role="list" aria-label="Fuel stations along route">
      {stations.map((station, rank) => {
        const isSelected = station.stationId === selectedId
        const detour = detourMinutes(station.detourMeters)
        // price_cents is already stored in c/L (e.g. 197.9) — do not divide by 10.
        const priceDisplay = station.priceCents.toFixed(1)
        // Colour: green → amber → red based on price in range
        const priceRange = maxPrice - minPrice
        const ratio = priceRange > 0 ? (station.priceCents - minPrice) / priceRange : 0
        const priceColor = ratio < 0.33 ? 'var(--color-price-down)' : ratio < 0.67 ? 'var(--color-accent)' : 'var(--color-price-up)'

        return (
          <div
            key={station.stationId}
            role="listitem"
            onClick={() => onSelect(station.stationId)}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(station.stationId) }
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '14px 16px',
              borderBottom: '1px solid var(--color-bg-elevated)',
              borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
              paddingLeft: isSelected ? '13px' : '16px',
              background: isSelected ? 'var(--color-accent-muted)' : 'var(--color-bg)',
              cursor: 'pointer',
              transition: 'background var(--motion-fast)',
            }}
            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-elevated)' }}
            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg)' }}
            aria-label={`${station.name}, ${priceDisplay} cents, approx ${detour} minute detour`}
          >
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Rank badge */}
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: rank === 0 ? 'var(--color-accent)' : 'var(--color-border)',
                color: rank === 0 ? 'var(--color-accent-fg)' : 'var(--color-text-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 900,
                flexShrink: 0,
              }}>
                {rank + 1}
              </div>

              {/* Station info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginBottom: '2px',
                }}>
                  {station.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>
                  {station.brand ?? 'Independent'}
                  {station.suburb ? ` · ${station.suburb}` : ''}
                </div>
              </div>

              {/* Price + detour */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: '24px',
                  fontWeight: 900,
                  fontVariantNumeric: 'tabular-nums',
                  color: priceColor,
                  lineHeight: 1,
                  marginBottom: '3px',
                }}>
                  {priceDisplay}<span style={{ fontSize: '13px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>¢</span>
                </div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--color-text-subtle)',
                  whiteSpace: 'nowrap',
                }}>
                  ≈+{detour} min
                </div>
              </div>
            </div>

            {/* Navigate button row */}
            <div onClick={e => e.stopPropagation()}>
              <NavigateButton
                start={start}
                station={{ lat: station.latitude, lng: station.longitude, name: station.name }}
                end={end}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
