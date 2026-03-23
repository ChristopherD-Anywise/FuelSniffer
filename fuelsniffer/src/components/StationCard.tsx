'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import { isStale } from '@/lib/dashboard-utils'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationCardProps {
  station: PriceResult
  isSelected: boolean
  onClick: () => void
}

function FreshnessLabel({ recordedAt }: { recordedAt: Date }) {
  if (isStale(recordedAt)) {
    return (
      <span className="text-[12px] text-zinc-400">
        <span className="text-zinc-400">Outdated</span>
        {' · '}
        Price may be outdated
      </span>
    )
  }
  const ago = formatDistanceToNowStrict(new Date(recordedAt), { addSuffix: false })
  return (
    <span className="text-[12px] text-zinc-400">{ago} ago</span>
  )
}

export default function StationCard({ station, isSelected, onClick }: StationCardProps) {
  const stale = isStale(station.recorded_at)
  const priceDisplay = (parseFloat(station.price_cents) / 10).toFixed(1)

  return (
    <div
      onClick={onClick}
      className={[
        'grid grid-cols-[80px_1fr_56px] p-4 min-h-[80px] cursor-pointer hover:bg-zinc-50 transition-colors',
        isSelected ? 'border-l-4 border-blue-600' : '',
      ].join(' ')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Column 1: Price block */}
      <div className="flex flex-col items-end justify-center">
        <div className={stale ? 'opacity-40' : ''}>
          <div className="text-[28px] font-bold leading-none text-zinc-900">
            {priceDisplay}
          </div>
          <div className="text-[12px] text-zinc-500 text-right">c/L</div>
        </div>
      </div>

      {/* Column 2: Station info */}
      <div className="pl-3 flex flex-col justify-center gap-0.5">
        <div className="text-lg font-bold text-zinc-900 leading-tight">
          {station.name}
        </div>
        <div className={stale ? 'opacity-40' : ''}>
          <div className="text-[15px] text-zinc-600 leading-snug">
            {[station.address, station.suburb].filter(Boolean).join(', ')}
          </div>
        </div>
        <FreshnessLabel recordedAt={station.recorded_at} />
      </div>

      {/* Column 3: Distance badge */}
      <div className="flex items-center justify-end">
        <span className="text-[15px] text-zinc-600 font-medium">
          {station.distance_km.toFixed(1)} km
        </span>
      </div>
    </div>
  )
}
