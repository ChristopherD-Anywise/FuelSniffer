'use client'

import FuelTypePills from '@/components/FuelTypePills'
import DistanceSlider from '@/components/DistanceSlider'

interface FilterBarProps {
  activeFuel: string
  radius: number
  onFuelChange: (id: string) => void
  onRadiusChange: (km: number) => void
  sortMode: 'price' | 'distance'
  onSortChange: (mode: 'price' | 'distance') => void
  isMobileMapVisible: boolean
  onToggleMobileMap: () => void
  onLocateMe?: () => void
  locationStatus?: 'idle' | 'loading' | 'active' | 'denied'
}

export default function FilterBar({
  activeFuel,
  radius,
  onFuelChange,
  onRadiusChange,
  sortMode,
  onSortChange,
  isMobileMapVisible,
  onToggleMobileMap,
  onLocateMe,
  locationStatus = 'idle',
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-slate-200/60 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            <span className="text-sky-500">⛽</span> FuelSniffer
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Locate me button */}
          {onLocateMe && (
            <button
              onClick={onLocateMe}
              className={[
                'flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all',
                locationStatus === 'active'
                  ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-200'
                  : locationStatus === 'loading'
                  ? 'bg-slate-100 text-slate-500 animate-pulse'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
              title="Use my location"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
              </svg>
              {locationStatus === 'active' ? 'Near me' : locationStatus === 'loading' ? 'Locating...' : 'Locate me'}
            </button>
          )}
          {/* Mobile map toggle */}
          <button
            onClick={onToggleMobileMap}
            className="md:hidden flex items-center gap-1 h-8 px-3 bg-slate-900 text-white rounded-full text-xs font-medium"
          >
            {isMobileMapVisible ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3" y2="6"/><line x1="3" y1="12" x2="3" y2="12"/><line x1="3" y1="18" x2="3" y2="18"/></svg>
                List
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                Map
              </>
            )}
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 px-4 pb-3 overflow-x-auto">
        <FuelTypePills activeFuel={activeFuel} onSelect={onFuelChange} />
        <div className="h-5 w-px bg-slate-200 shrink-0" />
        <div className="w-[140px] shrink-0">
          <DistanceSlider value={radius} onChange={onRadiusChange} />
        </div>
        <div className="h-5 w-px bg-slate-200 shrink-0" />
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => onSortChange('price')}
            className={[
              'h-7 px-3 rounded-md text-xs font-medium transition-all',
              sortMode === 'price'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            Cheapest
          </button>
          <button
            onClick={() => onSortChange('distance')}
            className={[
              'h-7 px-3 rounded-md text-xs font-medium transition-all',
              sortMode === 'distance'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            Nearest
          </button>
        </div>
      </div>
    </div>
  )
}
