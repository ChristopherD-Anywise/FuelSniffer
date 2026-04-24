'use client'

import { useRef } from 'react'
import type { Route } from '@/lib/providers/routing'

interface RouteChipStripProps {
  routes: Route[]
  selectedIndex: number
  onSelect: (index: number) => void
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(0)} km`
}

function routeLabel(index: number): string {
  if (index === 0) return 'Fastest'
  return `Alt ${index}`
}

export default function RouteChipStrip({ routes, selectedIndex, onSelect }: RouteChipStripProps) {
  const chipsRef = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(index + 1, routes.length - 1)
      onSelect(next)
      chipsRef.current[next]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(index - 1, 0)
      onSelect(prev)
      chipsRef.current[prev]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(index)
    }
  }

  if (routes.length === 0) return null

  return (
    <div
      role="radiogroup"
      aria-label="Route options"
      style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        padding: '0 4px',
        scrollbarWidth: 'none',
      }}
      className="[&::-webkit-scrollbar]:hidden"
    >
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {routes[selectedIndex]
          ? `Selected: ${routeLabel(selectedIndex)}, ${formatDistance(routes[selectedIndex].distanceMeters)}, ${formatDuration(routes[selectedIndex].durationSeconds)}`
          : ''}
      </div>

      {routes.map((route, i) => {
        const isSelected = i === selectedIndex
        return (
          <button
            key={i}
            ref={el => { chipsRef.current[i] = el }}
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(i)}
            onKeyDown={e => handleKeyDown(e, i)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '10px 16px',
              borderRadius: '10px',
              border: isSelected ? '2px solid var(--color-accent)' : '2px solid var(--color-border)',
              background: isSelected ? 'rgba(245,158,11,0.12)' : 'var(--color-bg-elevated)',
              color: isSelected ? 'var(--color-text)' : 'var(--color-text-subtle)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'border-color var(--motion-fast), background var(--motion-fast), color var(--motion-fast)',
              minWidth: '100px',
            }}
            aria-label={`${routeLabel(i)}: ${formatDistance(route.distanceMeters)}, ${formatDuration(route.durationSeconds)}`}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: isSelected ? 'var(--color-accent)' : 'var(--color-text-subtle)' }}>
              {routeLabel(i)}
            </span>
            <span style={{ fontSize: '15px', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {formatDistance(route.distanceMeters)}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? 'var(--color-text-muted)' : 'var(--color-text-subtle)' }}>
              {formatDuration(route.durationSeconds)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
