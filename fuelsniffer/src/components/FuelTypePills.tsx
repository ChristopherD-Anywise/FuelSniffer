'use client'

const FUEL_TYPES = [
  { id: '2', label: 'ULP 91' },
  { id: '5', label: 'ULP 95' },
  { id: '4', label: 'ULP 98' },
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
    <div className="flex items-center gap-1.5 flex-nowrap">
      {FUEL_TYPES.map((fuel) => {
        const isActive = fuel.id === activeFuel
        return (
          <button
            key={fuel.id}
            onClick={() => onSelect(fuel.id)}
            className={[
              'h-7 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-all',
              isActive
                ? 'bg-sky-500 text-white shadow-sm shadow-sky-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
            aria-pressed={isActive}
          >
            {fuel.label}
          </button>
        )
      })}
    </div>
  )
}
