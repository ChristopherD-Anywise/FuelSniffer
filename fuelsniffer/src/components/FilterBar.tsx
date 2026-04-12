'use client'

import DistanceSlider from '@/components/DistanceSlider'
import LocationSearch from '@/components/LocationSearch'

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
  onLocationSelect?: (location: { lat: number; lng: number; label: string }) => void
}

const FUEL_TABS = [
  { id: '2',  label: 'ULP 91' },
  { id: '5',  label: 'PULP 95' },
  { id: '8',  label: 'PULP 98' },
  { id: '12', label: 'E10' },
  { id: '3',  label: 'Diesel' },
  { id: '14', label: 'Prem Diesel' },
  { id: '4',  label: 'LPG' },
]

export default function FilterBar({
  activeFuel,
  onFuelChange,
  radius,
  onRadiusChange,
  sortMode,
  onSortChange,
  onLocateMe,
  locationStatus = 'idle',
  onLocationSelect,
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-20 flex-shrink-0">
      {/* Top bar */}
      <div
        style={{ background: '#111111', borderBottom: '3px solid #f59e0b' }}
        className="flex items-center justify-between px-4 h-[52px]"
      >
        <span className="text-lg font-black uppercase tracking-tight text-white">
          FUEL<span style={{ color: '#f59e0b' }}>SNIFFER</span>
        </span>

        <div className="flex items-center gap-2">
          {onLocationSelect && (
            <LocationSearch onSelect={onLocationSelect} />
          )}

          {onLocateMe && (
            <button
              onClick={onLocateMe}
              style={{
                background: locationStatus === 'active' ? 'rgba(245,158,11,0.15)' : '#1a1a1a',
                border: `1px solid ${locationStatus === 'active' ? '#f59e0b' : '#2a2a2a'}`,
                color: locationStatus === 'active' ? '#f59e0b' : '#8a8a8a',
              }}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
              title={locationStatus === 'active' ? 'Clear location' : 'Use my location'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              </svg>
            </button>
          )}

          <DistanceSlider value={radius} onChange={onRadiusChange} />

          <div
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            className="flex items-center rounded-lg p-0.5 shrink-0"
          >
            {(['price', 'distance'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onSortChange(mode)}
                style={{
                  background: sortMode === mode ? '#f59e0b' : 'transparent',
                  color: sortMode === mode ? '#000000' : '#8a8a8a',
                }}
                className="h-7 px-3 rounded-md text-xs font-bold uppercase tracking-wide transition-all"
              >
                {mode === 'price' ? 'Price' : 'Near'}
              </button>
            ))}
          </div>

          <span
            style={{ background: '#f59e0b', color: '#000000' }}
            className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded"
          >
            LIVE
          </span>
        </div>
      </div>

      {/* Fuel type tab row */}
      <div
        style={{ background: '#1a1a1a', borderBottom: '2px solid #2a2a2a' }}
        className="flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {FUEL_TABS.map((fuel) => (
          <button
            key={fuel.id}
            onClick={() => onFuelChange(fuel.id)}
            style={{
              borderBottom: activeFuel === fuel.id ? '3px solid #f59e0b' : '3px solid transparent',
              color: activeFuel === fuel.id ? '#f59e0b' : '#8a8a8a',
              marginBottom: '-2px',
            }}
            className="flex-shrink-0 px-5 py-3 text-[13px] font-black uppercase tracking-wide transition-colors whitespace-nowrap"
          >
            {fuel.label}
          </button>
        ))}
      </div>
    </div>
  )
}
