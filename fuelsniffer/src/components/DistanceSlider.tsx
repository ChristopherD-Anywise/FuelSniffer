'use client'

import { useState, useEffect } from 'react'

interface DistanceSliderProps {
  value: number
  onChange: (km: number) => void
}

export default function DistanceSlider({ value, onChange }: DistanceSliderProps) {
  const [dragValue, setDragValue] = useState(value)

  // Keep dragValue in sync if the prop changes from outside (e.g. URL navigation)
  useEffect(() => {
    setDragValue(value)
  }, [value])

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="range"
        min={1}
        max={50}
        step={1}
        value={dragValue}
        onChange={(e) => setDragValue(Number(e.target.value))}
        onMouseUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        className="w-[100px]"
      />
      <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
        {dragValue}km
      </span>
    </div>
  )
}
