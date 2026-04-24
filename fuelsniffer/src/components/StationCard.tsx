'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'
import { SlotVerdict, SlotTrueCost } from '@/components/slots'

interface StationCardProps {
  station: PriceResult
  isSelected: boolean
  onClick: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  rank: number
  stationIndex?: number
  onArrowKey?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

export default function StationCard({ station, isSelected, onClick, cardRef, rank, stationIndex, onArrowKey }: StationCardProps) {
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const price = parseFloat(station.price_cents)
  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'
  const change = station.price_change != null ? Number(station.price_change) : null

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Ranked ${rank}, ${station.name}, ${parseFloat(station.price_cents).toFixed(1)} cents, ${station.distance_km.toFixed(1)} km`}
      aria-pressed={isSelected}
      data-station-index={stationIndex}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
        else onArrowKey?.(e)
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
        paddingLeft: isSelected ? '13px' : '16px',
        background: isSelected ? 'var(--color-accent-muted)' : 'var(--color-bg)',
        cursor: 'pointer',
        transition: 'background var(--motion-fast)',
        minHeight: '72px',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-elevated)'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg)'
      }}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '6px',
          background: rank === 1 ? 'var(--color-accent)' : 'var(--color-border)',
          color: rank === 1 ? 'var(--color-accent-fg)' : 'var(--color-text-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {rank}
      </div>

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
          {station.distance_km.toFixed(1)} km · {ago}
        </div>
        {/* SP-6 true-cost slot — reserved space in card context */}
        <SlotTrueCost station={station} context="card" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
        {/* SP-4 verdict slot */}
        <SlotVerdict station={station} />
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '24px',
            fontWeight: 900,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-text)',
            lineHeight: 1,
            marginBottom: '3px',
          }}>
            {price.toFixed(1)}<span style={{ fontSize: '13px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>¢</span>
          </div>
          {change !== null && change !== 0 && (
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: change < 0 ? 'var(--color-price-down)' : 'var(--color-price-up)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '2px',
            }}>
              <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                {change < 0
                  ? <path d="M5 8L1.5 3H8.5L5 8Z" />
                  : <path d="M5 2L8.5 7H1.5L5 2Z" />
                }
              </svg>
              {Math.abs(change).toFixed(1)}¢ / 7d
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
