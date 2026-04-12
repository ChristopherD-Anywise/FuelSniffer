'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationCardProps {
  station: PriceResult
  isSelected: boolean
  onClick: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  rank: number
}

export default function StationCard({ station, isSelected, onClick, cardRef, rank }: StationCardProps) {
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
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderBottom: '1px solid #1a1a1a',
        borderLeft: isSelected ? '3px solid #f59e0b' : '3px solid transparent',
        paddingLeft: isSelected ? '13px' : '16px',
        background: isSelected ? '#1a0d00' : '#111111',
        cursor: 'pointer',
        transition: 'background 0.1s',
        minHeight: '64px',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#1a1a1a'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#111111'
      }}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '6px',
          background: rank === 1 ? '#f59e0b' : '#2a2a2a',
          color: rank === 1 ? '#000000' : '#888888',
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
          color: '#ffffff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginBottom: '2px',
        }}>
          {station.name}
        </div>
        <div style={{ fontSize: '11px', color: '#8a8a8a' }}>
          {station.distance_km.toFixed(1)} km · {ago}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: '24px',
          fontWeight: 900,
          fontVariantNumeric: 'tabular-nums',
          color: '#ffffff',
          lineHeight: 1,
          marginBottom: '3px',
        }}>
          {price.toFixed(1)}<span style={{ fontSize: '13px', color: '#8a8a8a', fontWeight: 600 }}>¢</span>
        </div>
        {change !== null && change !== 0 && (
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: change < 0 ? '#22c55e' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '2px',
          }}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
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
  )
}
