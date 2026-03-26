'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationCardProps {
  station: PriceResult
  isSelected: boolean
  changePeriodLabel: string  // "24h", "3d", "7d"
  onClick: () => void
  cardRef?: (el: HTMLDivElement | null) => void
}

export default function StationCard({ station, isSelected, changePeriodLabel, onClick, cardRef }: StationCardProps) {
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const price = parseFloat(station.price_cents)
  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'
  const change = station.price_change != null ? Number(station.price_change) : null

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={[
        'group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-150',
        'hover:bg-slate-50',
        isSelected ? 'bg-sky-50/80' : '',
      ].join(' ')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Price + change */}
      <div className="flex-shrink-0 w-[72px]">
        <div className="text-xl font-extrabold tabular-nums text-slate-900 leading-tight">
          {price.toFixed(1)}
        </div>
        {change !== null && change !== 0 && (
          <div className={`flex items-center gap-0.5 text-[11px] font-semibold leading-tight ${
            change > 0 ? 'text-red-500' : 'text-emerald-600'
          }`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              {change > 0
                ? <path d="M5 2L8.5 7H1.5L5 2Z" />   /* up arrow */
                : <path d="M5 8L1.5 3H8.5L5 8Z" />    /* down arrow */
              }
            </svg>
            {Math.abs(change).toFixed(1)}¢
            <span className="text-slate-400 font-normal ml-0.5">/ {changePeriodLabel}</span>
          </div>
        )}
        {change !== null && change === 0 && (
          <div className="text-[11px] text-slate-400 leading-tight">
            — 0¢ / {changePeriodLabel}
          </div>
        )}
      </div>

      {/* Station details */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">
          {station.name}
        </div>
        <div className="text-xs text-slate-500 truncate">
          {[station.brand, station.distance_km.toFixed(1) + ' km', ago].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  )
}
