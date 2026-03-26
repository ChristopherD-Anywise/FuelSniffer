'use client'

const FUEL_TYPES = [
  { id: '2', label: 'ULP 91' },
  { id: '5', label: 'P95' },
  { id: '8', label: 'P98' },
  { id: '12', label: 'E10' },
  { id: '3', label: 'Diesel' },
  { id: '14', label: 'Prem Diesel' },
  { id: '4', label: 'LPG' },
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
