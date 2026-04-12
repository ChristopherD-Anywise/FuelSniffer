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
        color: '#555555',
        fontSize: '14px',
      }}>
        No stations found along this corridor.
        <br />
        <span style={{ fontSize: '12px', color: '#444444' }}>Try widening the corridor.</span>
      </div>
    )
  }

  const minPrice = stations[0].priceCents
  const maxPrice = stations[stations.length - 1].priceCents

  return (
    <div role="list" aria-label="Fuel stations along route">
      {stations.map((station, rank) => {
        const isSelected = station.stationId === selectedId
        const detour = detourMinutes(station.detourMeters)
        const priceDisplay = (station.priceCents / 10).toFixed(1)
        // Colour: green → amber → red based on price in range
        const priceRange = maxPrice - minPrice
        const ratio = priceRange > 0 ? (station.priceCents - minPrice) / priceRange : 0
        const priceColor = ratio < 0.33 ? '#22c55e' : ratio < 0.67 ? '#f59e0b' : '#ef4444'

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
              borderBottom: '1px solid #1a1a1a',
              borderLeft: isSelected ? '3px solid #f59e0b' : '3px solid transparent',
              paddingLeft: isSelected ? '13px' : '16px',
              background: isSelected ? '#1a0d00' : '#111111',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#1a1a1a' }}
            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#111111' }}
            aria-label={`${station.name}, ${priceDisplay} cents, approx ${detour} minute detour`}
          >
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Rank badge */}
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: rank === 0 ? '#f59e0b' : '#2a2a2a',
                color: rank === 0 ? '#000000' : '#888888',
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
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginBottom: '2px',
                }}>
                  {station.name}
                </div>
                <div style={{ fontSize: '11px', color: '#8a8a8a' }}>
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
                  {priceDisplay}<span style={{ fontSize: '13px', color: '#8a8a8a', fontWeight: 600 }}>¢</span>
                </div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#888888',
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
