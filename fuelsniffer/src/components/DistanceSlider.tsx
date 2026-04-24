'use client'

interface DistanceSliderProps {
  value: number
  onChange: (km: number) => void
}

export default function DistanceSlider({ value, onChange }: DistanceSliderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <label htmlFor="distance-slider" className="sr-only">Radius in km</label>
      <input
        id="distance-slider"
        type="range"
        min={1}
        max={50}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: 'var(--color-accent)', width: '100px' }}
        aria-label={`Search radius: ${value} km`}
        aria-valuetext={`${value} kilometres`}
      />
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}km
      </span>
    </div>
  )
}
