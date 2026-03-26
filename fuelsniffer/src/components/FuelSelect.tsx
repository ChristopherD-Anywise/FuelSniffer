'use client'

export const FUEL_TYPES = [
  { id: '2', label: 'Unleaded 91' },
  { id: '5', label: 'Premium 95' },
  { id: '8', label: 'Premium 98' },
  { id: '12', label: 'E10' },
  { id: '3', label: 'Diesel' },
  { id: '14', label: 'Premium Diesel' },
  { id: '4', label: 'LPG' },
]

interface FuelSelectProps {
  activeFuel: string
  onSelect: (fuelTypeId: string) => void
}

export default function FuelSelect({ activeFuel, onSelect }: FuelSelectProps) {
  return (
    <div className="relative shrink-0">
      <select
        value={activeFuel}
        onChange={(e) => onSelect(e.target.value)}
        className="h-9 pl-3 pr-8 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-colors"
      >
        {FUEL_TYPES.map((fuel) => (
          <option key={fuel.id} value={fuel.id}>
            {fuel.label}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}
