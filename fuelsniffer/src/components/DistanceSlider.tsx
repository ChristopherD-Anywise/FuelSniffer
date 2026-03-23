'use client'

interface DistanceSliderProps {
  value: number
  onChange: (km: number) => void
}

export default function DistanceSlider({ value, onChange }: DistanceSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] text-zinc-600 font-medium">
        Within {value} km
      </label>
      <input
        type="range"
        min={1}
        max={50}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
  )
}
