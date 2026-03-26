'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import { isStale } from '@/lib/dashboard-utils'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationCardProps {
  station: PriceResult
  isSelected: boolean
  onClick: () => void
  cardRef?: (el: HTMLDivElement | null) => void
}

function PriceChange({ change }: { change: number | null }) {
  if (change === null || change === undefined) return null

  if (change > 0) {
    return (
      <span className="text-red-500 text-xs font-medium">
        ▲ {Math.abs(change).toFixed(1)}¢
      </span>
    )
  }
  if (change < 0) {
    return (
      <span className="text-emerald-600 text-xs font-medium">
        ▼ {Math.abs(change).toFixed(1)}¢
      </span>
    )
  }
  return (
    <span className="text-slate-400 text-xs">
      — 0¢
    </span>
  )
}

export default function StationCard({ station, isSelected, onClick, cardRef }: StationCardProps) {
  // Use source_ts (when station reported the price) if available, fall back to recorded_at
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const price = parseFloat(station.price_cents)

  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'

  const metaParts = [
    station.brand,
    station.distance_km.toFixed(1) + ' km',
    ago,
  ].filter(Boolean)

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={[
        'group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150',
        'hover:bg-slate-50',
        isSelected ? 'bg-sky-50/80' : '',
      ].join(' ')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Price column */}
      <div className="flex-shrink-0 flex flex-col items-start">
        <span className="text-2xl font-extrabold tabular-nums text-slate-900 leading-none">
          {price.toFixed(1)}
        </span>
        <div className="mt-0.5">
          <PriceChange change={station.price_change_24h} />
        </div>
      </div>

      {/* Station details */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">
          {station.name}
        </div>
        <div className="text-xs text-slate-500 truncate mt-0.5">
          {metaParts.join(' · ')}
        </div>
      </div>
    </div>
  )
}
