'use client'

interface DistanceSliderProps {
  value: number
  onChange: (km: number) => void
}

export default function DistanceSlider({ value, onChange }: DistanceSliderProps) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="range"
        min={1}
        max={50}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-[100px]"
      />
      <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
        {value}km
      </span>
    </div>
  )
}
