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
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-zinc-100 border-b border-zinc-200">
      {/* Desktop layout: single row, h-14 (56px) */}
      <div className="hidden md:flex items-center h-14 px-4 gap-4">
        <FuelTypePills activeFuel={activeFuel} onSelect={onFuelChange} />
        <div className="flex-1 max-w-[200px]">
          <DistanceSlider value={radius} onChange={onRadiusChange} />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => onSortChange('price')}
            className={[
              'h-9 px-3 text-[12px] rounded-l-md border transition-colors',
              sortMode === 'price'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400',
            ].join(' ')}
          >
            Cheapest first
          </button>
          <button
            onClick={() => onSortChange('distance')}
            className={[
              'h-9 px-3 text-[12px] rounded-r-md border-t border-b border-r transition-colors',
              sortMode === 'distance'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400',
            ].join(' ')}
          >
            Nearest first
          </button>
        </div>
      </div>

      {/* Mobile layout: stacked, h-[88px] */}
      <div className="flex md:hidden flex-col justify-center h-[88px] px-4 gap-2">
        <div className="flex items-center justify-between gap-2">
          <FuelTypePills activeFuel={activeFuel} onSelect={onFuelChange} />
          <button
            onClick={onToggleMobileMap}
            className="md:hidden bg-blue-600 text-white rounded-md px-3 h-9 text-[12px] font-medium shrink-0"
          >
            {isMobileMapVisible ? 'List' : 'Map'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <DistanceSlider value={radius} onChange={onRadiusChange} />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSortChange('price')}
              className={[
                'h-9 px-3 text-[12px] rounded-l-md border transition-colors',
                sortMode === 'price'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-zinc-700 border-zinc-300',
              ].join(' ')}
            >
              Cheapest first
            </button>
            <button
              onClick={() => onSortChange('distance')}
              className={[
                'h-9 px-3 text-[12px] rounded-r-md border-t border-b border-r transition-colors',
                sortMode === 'distance'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-zinc-700 border-zinc-300',
              ].join(' ')}
            >
              Nearest first
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
