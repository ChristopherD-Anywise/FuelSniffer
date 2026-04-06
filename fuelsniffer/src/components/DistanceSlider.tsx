'use client'

interface DistanceSliderProps {
  value: number
  onChange: (km: number) => void
}

export default function DistanceSlider({ value, onChange }: DistanceSliderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="range"
        min={1}
        max={500}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: '#f59e0b', width: '100px' }}
      />
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}km
      </span>
    </div>
  )
}
