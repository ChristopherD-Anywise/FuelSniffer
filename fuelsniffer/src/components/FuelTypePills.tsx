'use client'

// QLD API fuelTypeId values confirmed from Phase 1 research
const FUEL_TYPES = [
  { id: '2', label: 'ULP91' },
  { id: '5', label: 'ULP95' },
  { id: '4', label: 'ULP98' },
  { id: '1', label: 'Diesel' },
  { id: '3', label: 'E10' },
  { id: '6', label: 'E85' },
]

interface FuelTypePillsProps {
  activeFuel: string
  onSelect: (fuelTypeId: string) => void
}

export default function FuelTypePills({ activeFuel, onSelect }: FuelTypePillsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {FUEL_TYPES.map((fuel) => {
        const isActive = fuel.id === activeFuel
        return (
          <div key={fuel.id} className="min-h-[44px] flex items-center">
            <button
              onClick={() => onSelect(fuel.id)}
              className={[
                'h-9 px-4 rounded-full text-[12px] font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white border-transparent'
                  : 'bg-white border border-zinc-300 text-zinc-700 hover:border-zinc-400',
              ].join(' ')}
              aria-pressed={isActive}
            >
              {fuel.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}
