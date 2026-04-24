'use client'
/**
 * TripTotalCost — expandable "Trip fuel cost" panel.
 *
 * Inputs: tank size (default 50 L), efficiency (default 9 L/100km)
 * Persisted to localStorage keyed by fillip:trip:tank / fillip:trip:efficiency
 * Does NOT require user account — device-local only.
 *
 * Computation:
 *   fuelNeeded = min(tripDistanceKm * efficiency / 100, tankSize)
 *   perStation = fuelNeeded * effectiveCents / 100
 */

import { useState } from 'react'
import type { CorridorStation } from '@/lib/trip/corridor-query'

const LS_TANK = 'fillip:trip:tank'
const LS_EFF  = 'fillip:trip:efficiency'

const EFFICIENCY_PRESETS = [
  { label: 'Small',  value: 6.5 },
  { label: 'Medium', value: 8.0 },
  { label: 'Large',  value: 11.0 },
  { label: '4WD',    value: 14.0 },
  { label: 'Van',    value: 16.0 },
]

function readLocal(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const v = localStorage.getItem(key)
  if (!v) return fallback
  const n = parseFloat(v)
  return isNaN(n) ? fallback : n
}

interface TripTotalCostProps {
  tripDistanceKm: number
  stations: CorridorStation[]
}

export default function TripTotalCost({ tripDistanceKm, stations }: TripTotalCostProps) {
  const [expanded, setExpanded] = useState(false)
  // Lazy state initializer — reads localStorage only on first render (client-safe because
  // TripTotalCost is rendered inside a 'use client' component tree, never during SSR)
  const [tankSize, setTankSize] = useState(() => readLocal(LS_TANK, 50))
  const [efficiency, setEfficiency] = useState(() => readLocal(LS_EFF, 9.0))

  function handleTankChange(v: number) {
    setTankSize(v)
    if (typeof window !== 'undefined') localStorage.setItem(LS_TANK, String(v))
  }
  function handleEfficiencyChange(v: number) {
    setEfficiency(v)
    if (typeof window !== 'undefined') localStorage.setItem(LS_EFF, String(v))
  }

  if (stations.length === 0) return null

  const fuelNeeded = Math.min(tripDistanceKm * efficiency / 100, tankSize)

  const prices = stations.map(s => ({
    stationId: s.stationId,
    name: s.name,
    effective: s.effectivePriceCents ?? s.priceCents,
    cost: (fuelNeeded * (s.effectivePriceCents ?? s.priceCents)) / 100,
  }))

  const cheapest = prices.reduce((a, b) => a.cost < b.cost ? a : b)
  const mostExpensive = prices.reduce((a, b) => a.cost > b.cost ? a : b)
  const saving = mostExpensive.cost - cheapest.cost

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md, 10px)',
      background: 'var(--truecost-bg, var(--color-bg-elevated))',
      overflow: 'hidden',
    }}>
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls="trip-cost-panel"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text)',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-subtle)',
          }}>
            Trip fuel cost
          </span>
          {!expanded && saving >= 0.50 && (
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--truecost-saving, var(--color-price-down))',
            }}>
              · save up to ${saving.toFixed(2)}
            </span>
          )}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--motion-fast)', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          id="trip-cost-panel"
          style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {/* Inputs row */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label
                htmlFor="trip-tank"
                style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-subtle)', marginBottom: '4px' }}
              >
                Tank size (L)
              </label>
              <input
                id="trip-tank"
                type="number"
                min={10}
                max={200}
                step={5}
                value={tankSize}
                onChange={e => handleTankChange(Number(e.target.value))}
                style={{
                  width: '80px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: 700,
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="trip-efficiency"
                style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-subtle)', marginBottom: '4px' }}
              >
                Efficiency (L/100km)
              </label>
              <input
                id="trip-efficiency"
                type="number"
                min={3}
                max={30}
                step={0.5}
                value={efficiency}
                onChange={e => handleEfficiencyChange(Number(e.target.value))}
                style={{
                  width: '80px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: 700,
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            </div>

            {/* Efficiency presets */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {EFFICIENCY_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handleEfficiencyChange(p.value)}
                  aria-pressed={efficiency === p.value}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: `1px solid ${efficiency === p.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: efficiency === p.value ? 'var(--color-accent-muted)' : 'transparent',
                    color: efficiency === p.value ? 'var(--color-accent)' : 'var(--color-text-subtle)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trip summary */}
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-subtle)' }}>
              <span>Trip distance</span>
              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{tripDistanceKm.toFixed(1)} km</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-subtle)' }}>
              <span>Fuel needed</span>
              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>~{fuelNeeded.toFixed(1)} L</span>
            </div>
            <div style={{ height: '1px', background: 'var(--color-border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-subtle)' }}>
              <span>Cheapest ({cheapest.name.substring(0, 20)})</span>
              <span style={{ fontWeight: 700, color: 'var(--color-price-down)' }}>${cheapest.cost.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-subtle)' }}>
              <span>Most expensive</span>
              <span style={{ fontWeight: 700, color: 'var(--color-price-up)' }}>${mostExpensive.cost.toFixed(2)}</span>
            </div>
            {saving >= 0.50 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--truecost-saving, var(--color-price-down))', fontWeight: 700 }}>
                  You save
                </span>
                <span style={{ fontWeight: 900, color: 'var(--truecost-saving, var(--color-price-down))' }}>
                  ${saving.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
