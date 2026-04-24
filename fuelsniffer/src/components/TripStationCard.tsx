'use client'
/**
 * TripStationCard — SP-7 redesigned station card for the trip planner.
 *
 * Renders:
 *  - Rank pill (#1, #2, …)
 *  - Station name + brand/suburb
 *  - D1 verdict chip (SlotVerdict — quiet-fail if verdict absent)
 *  - Effective price as primary number (pylon if no effective)
 *  - Strikethrough pylon only when effective < pylon
 *  - Meta row: detour · save $X (if ≥ $0.50)
 *  - Actions: NavigateButton + "Set as best fill"
 *
 * A11y: role="listitem", keyboard-operable (Enter/Space = select, Tab = actions)
 */

import { useRef, useEffect } from 'react'
import NavigateButton from '@/components/NavigateButton'
import type { CorridorStation } from '@/lib/trip/corridor-query'
import type { CycleSignalView } from '@/lib/cycle/types'

// Inline verdict pill — avoids importing the full SlotVerdict (which expects PriceResult)
function VerdictPill({ verdict }: { verdict: CycleSignalView | null | undefined }) {
  if (!verdict) return null
  const { state } = verdict
  if (state === 'HOLD' || state === 'UNCERTAIN') return null

  const styles: Record<string, { bg: string; label: string; ariaLabel: string }> = {
    FILL_NOW:      { bg: 'var(--color-price-down, #16a34a)',  label: 'Fill now', ariaLabel: 'Verdict: fill now — suburb at cycle low' },
    WAIT_FOR_DROP: { bg: 'var(--color-price-up, #ea580c)',    label: 'Wait',     ariaLabel: 'Verdict: wait — suburb near cycle peak' },
  }
  const s = styles[state]
  if (!s) return null

  return (
    <span
      role="status"
      aria-label={s.ariaLabel}
      title={`${verdict.label} — ${verdict.suburb} (confidence ${(verdict.confidence * 100).toFixed(0)}%)`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '11px',
        background: s.bg,
        color: '#ffffff',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  )
}

interface TripStationCardProps {
  station: CorridorStation
  rank: number
  start: { lat: number; lng: number }
  end: { lat: number; lng: number }
  selectedId: number | null
  onSelect: (id: number) => void
  onSetBestFill?: (id: number) => void
  bestFillId?: number | null
  /** Worst effective price among all stations (for "save $X" callout) */
  worstEffective: number
  /** Tank size in litres (for "save $X" calc) */
  tankSizeLitres: number
  /** Scroll this card into view when it becomes selected */
  shouldScroll?: boolean
  /** Fuel type label for aria */
  fuelTypeLabel?: string
}

function detourMinutes(detourMeters: number): number {
  // Approx at 60 km/h: meters/1000 * 60 min/h
  return Math.max(1, Math.round((detourMeters / 1000) * (60 / 60)))
}

function detourKm(detourMeters: number): string {
  const km = detourMeters / 1000
  return km < 1 ? `${Math.round(detourMeters)}m` : `${km.toFixed(1)}km`
}

export default function TripStationCard({
  station,
  rank,
  start,
  end,
  selectedId,
  onSelect,
  onSetBestFill,
  bestFillId,
  worstEffective,
  tankSizeLitres,
  shouldScroll = false,
  fuelTypeLabel = 'fuel',
}: TripStationCardProps) {
  const isSelected = station.stationId === selectedId
  const isBestFill = station.stationId === bestFillId
  const cardRef = useRef<HTMLDivElement>(null)

  // Scroll into view when selected changes — honour prefers-reduced-motion
  useEffect(() => {
    if (isSelected && shouldScroll && cardRef.current) {
      const prefersReduced = typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      cardRef.current.scrollIntoView({
        block: 'nearest',
        behavior: prefersReduced ? 'auto' : 'smooth',
      })
    }
  }, [isSelected, shouldScroll])

  const effectiveCents = station.effectivePriceCents ?? station.priceCents
  const pylonCents = station.priceCents
  const hasDiscount = station.effectivePriceCents !== undefined && station.effectivePriceCents < pylonCents

  // "Save $X" callout
  const savingCents = (worstEffective - effectiveCents) * tankSizeLitres
  const savingDollars = savingCents / 100
  const showSaving = savingDollars >= 0.50

  const detour = detourMinutes(station.detourMeters)
  const detourKmLabel = detourKm(station.detourMeters)

  // Price colour based on rank in results
  const priceColor = rank === 0
    ? 'var(--color-price-down)'
    : rank === 1
      ? 'var(--color-accent)'
      : 'var(--color-price-up)'

  return (
    <div
      ref={cardRef}
      role="listitem"
      tabIndex={0}
      onClick={() => onSelect(station.stationId)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(station.stationId)
        }
      }}
      aria-label={`${station.name}, ${effectiveCents.toFixed(1)} cents per litre, approx ${detour} minute detour at 60 km/h. ${fuelTypeLabel}.`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '14px 16px',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
        paddingLeft: isSelected ? '13px' : '16px',
        background: isSelected ? 'var(--color-accent-muted)' : 'var(--color-bg)',
        cursor: 'pointer',
        transition: 'background var(--motion-fast)',
        outline: 'none',
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-elevated)'
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg)'
      }}
      onFocus={e => {
        e.currentTarget.style.boxShadow = '0 0 0 2px var(--color-focus-ring)'
      }}
      onBlur={e => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Top row: rank + name + verdict + price */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {/* Rank pill */}
        <div
          style={{
            minWidth: '24px',
            height: '24px',
            borderRadius: '12px',
            background: rank === 0 ? 'var(--color-accent)' : 'var(--color-border)',
            color: rank === 0 ? 'var(--color-accent-fg)' : 'var(--color-text-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 900,
            flexShrink: 0,
            paddingLeft: '6px',
            paddingRight: '6px',
          }}
        >
          {isBestFill ? '★' : rank + 1}
        </div>

        {/* Station name + brand + verdict */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--color-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: '2px',
          }}>
            {station.name}
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--color-text-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            <span>{station.brand ?? 'Independent'}{station.suburb ? ` · ${station.suburb}` : ''}</span>
            <VerdictPill verdict={station.verdict} />
          </div>
        </div>

        {/* Price column */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {/* Effective price (primary) */}
          <div style={{
            fontSize: '24px',
            fontWeight: 900,
            fontVariantNumeric: 'tabular-nums',
            color: priceColor,
            lineHeight: 1,
            marginBottom: '2px',
          }}>
            {effectiveCents.toFixed(1)}
            <span style={{ fontSize: '13px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>¢</span>
          </div>

          {/* Strikethrough pylon — only if discount applies */}
          {hasDiscount && (
            <div
              aria-label={`Pylon price ${pylonCents.toFixed(1)} cents`}
              style={{
                fontSize: '11px',
                color: 'var(--color-text-subtle)',
                textDecoration: 'line-through',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {pylonCents.toFixed(1)}¢
            </div>
          )}

          {/* Detour */}
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--color-text-subtle)',
            whiteSpace: 'nowrap',
          }}>
            <span title="Approximate detour time at 60 km/h" aria-label={`${detour} minutes detour (approx. at 60 km/h)`}>
              ≈+{detour} min
            </span>
          </div>
        </div>
      </div>

      {/* Meta row: detour km + save callout */}
      <div style={{
        fontSize: '11px',
        color: 'var(--color-text-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        <span>{detourKmLabel} off route</span>
        {showSaving && (
          <span style={{ color: 'var(--truecost-saving, var(--color-price-down))', fontWeight: 700 }}>
            · save ${savingDollars.toFixed(2)} / fill
          </span>
        )}
      </div>

      {/* Actions row: NavigateButton + Set as best fill */}
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}
      >
        <NavigateButton
          start={start}
          station={{ lat: station.latitude, lng: station.longitude, name: station.name }}
          end={end}
        />

        {onSetBestFill && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onSetBestFill(station.stationId)
            }}
            aria-label={`Set ${station.name} as best fill stop${isBestFill ? ' (currently selected)' : ''}`}
            aria-pressed={isBestFill}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              height: '36px',
              paddingLeft: '12px',
              paddingRight: '12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: `1px solid ${isBestFill ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: isBestFill ? 'var(--color-accent-muted)' : 'transparent',
              color: isBestFill ? 'var(--color-accent)' : 'var(--color-text-subtle)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background var(--motion-fast), color var(--motion-fast)',
            }}
          >
            <span aria-hidden="true">{isBestFill ? '★' : '☆'}</span>
            {isBestFill ? 'Best fill' : 'Set as best fill'}
          </button>
        )}
      </div>
    </div>
  )
}
