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

function getPriceColor(price: number): string {
  if (price < 160) return 'text-emerald-600'
  if (price < 180) return 'text-amber-600'
  return 'text-red-600'
}

function getPriceBg(price: number): string {
  if (price < 160) return 'bg-emerald-50'
  if (price < 180) return 'bg-amber-50'
  return 'bg-red-50'
}

export default function StationCard({ station, isSelected, onClick, cardRef }: StationCardProps) {
  const stale = isStale(station.recorded_at)
  const price = parseFloat(station.price_cents)
  const priceWhole = Math.floor(price)
  const priceDec = (price % 1).toFixed(1).slice(1) // ".5" etc

  const ago = stale
    ? 'Outdated'
    : formatDistanceToNowStrict(new Date(station.recorded_at), { addSuffix: false }) + ' ago'

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={[
        'group flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-150',
        'hover:bg-sky-50/60',
        isSelected
          ? 'bg-sky-50 border-l-[3px] border-sky-500'
          : 'border-l-[3px] border-transparent',
        stale ? 'opacity-50' : '',
      ].join(' ')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Price badge */}
      <div className={`flex-shrink-0 flex items-baseline justify-center rounded-xl px-3 py-2 ${getPriceBg(price)}`}>
        <span className={`text-2xl font-extrabold tabular-nums leading-none ${getPriceColor(price)}`}>
          {priceWhole}
        </span>
        <span className={`text-lg font-bold leading-none ${getPriceColor(price)}`}>
          {priceDec}
        </span>
      </div>

      {/* Station details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-slate-900 truncate">
            {station.name}
          </span>
          {station.brand && (
            <span className="text-xs text-slate-400 font-medium shrink-0">
              {station.brand}
            </span>
          )}
        </div>
        <div className="text-sm text-slate-500 truncate mt-0.5">
          {[station.address, station.suburb].filter(Boolean).join(', ')}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-slate-400">
            {station.distance_km.toFixed(1)} km away
          </span>
          <span className="text-xs text-slate-300">•</span>
          <span className={`text-xs ${stale ? 'text-amber-500 font-medium' : 'text-slate-400'}`}>
            {ago}
          </span>
        </div>
      </div>

      {/* Arrow indicator */}
      <div className="flex-shrink-0 text-slate-300 group-hover:text-sky-400 transition-colors">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  )
}
