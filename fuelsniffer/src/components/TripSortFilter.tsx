'use client'
/**
 * TripSortFilter — horizontal sort + filter control bar above station list.
 *
 * Sort: effective_price (default), detour_minutes, verdict
 * Filter: brand multi-select, verdict single-select
 *
 * State is lifted to TripClient which persists it in URL search params.
 */

import type { TripSortKey, TripFilterState } from '@/lib/trip/sort-filter'
import type { SignalState } from '@/lib/cycle/types'
import type { CorridorStation } from '@/lib/trip/corridor-query'

interface TripSortFilterProps {
  sort: TripSortKey
  filters: TripFilterState
  onSortChange: (sort: TripSortKey) => void
  onFiltersChange: (filters: TripFilterState) => void
  /** Available brands from current station set */
  availableBrands: string[]
}

const SORT_OPTIONS: { value: TripSortKey; label: string }[] = [
  { value: 'effective_price', label: 'Best price' },
  { value: 'detour_minutes', label: 'Least detour' },
  { value: 'verdict',        label: 'Fill now first' },
]

const VERDICT_OPTIONS: { value: SignalState | ''; label: string }[] = [
  { value: '',             label: 'Any signal' },
  { value: 'FILL_NOW',    label: 'Fill now' },
  { value: 'HOLD',        label: 'Hold' },
  { value: 'WAIT_FOR_DROP', label: 'Wait' },
]

const selectStyle: React.CSSProperties = {
  height: '32px',
  borderRadius: 'var(--radius-sm, 6px)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-elevated)',
  color: 'var(--color-text)',
  fontSize: '12px',
  fontWeight: 600,
  paddingLeft: '8px',
  paddingRight: '8px',
  cursor: 'pointer',
  outline: 'none',
}

export default function TripSortFilter({
  sort,
  filters,
  onSortChange,
  onFiltersChange,
  availableBrands,
}: TripSortFilterProps) {
  function handleBrandToggle(brand: string) {
    const current = filters.brands
    const next = current.includes(brand)
      ? current.filter(b => b !== brand)
      : [...current, brand]
    onFiltersChange({ ...filters, brands: next })
  }

  function handleVerdictChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value as SignalState | ''
    onFiltersChange({ ...filters, verdict: v === '' ? null : v })
  }

  return (
    <div
      role="group"
      aria-label="Sort and filter stations"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated)',
        flexWrap: 'wrap',
      }}
    >
      {/* Sort selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <label
          htmlFor="trip-sort"
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--color-text-subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}
        >
          Sort
        </label>
        <select
          id="trip-sort"
          value={sort}
          onChange={e => onSortChange(e.target.value as TripSortKey)}
          style={selectStyle}
          aria-label="Sort stations by"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div
        aria-hidden="true"
        style={{ width: '1px', height: '20px', background: 'var(--color-border)', flexShrink: 0 }}
      />

      {/* Verdict filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <label
          htmlFor="trip-verdict-filter"
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--color-text-subtle)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}
        >
          Signal
        </label>
        <select
          id="trip-verdict-filter"
          value={filters.verdict ?? ''}
          onChange={handleVerdictChange}
          style={selectStyle}
          aria-label="Filter by verdict signal"
        >
          {VERDICT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Brand filter chips (shown if brands available) */}
      {availableBrands.length > 0 && (
        <>
          <div
            aria-hidden="true"
            style={{ width: '1px', height: '20px', background: 'var(--color-border)', flexShrink: 0 }}
          />
          <div
            role="group"
            aria-label="Filter by brand"
            style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}
          >
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-text-subtle)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Brand
            </span>
            {availableBrands.map(brand => {
              const isActive = filters.brands.includes(brand)
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={() => handleBrandToggle(brand)}
                  aria-pressed={isActive}
                  style={{
                    height: '26px',
                    padding: '0 8px',
                    borderRadius: '13px',
                    border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: isActive ? 'var(--color-accent-muted)' : 'transparent',
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-subtle)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background var(--motion-fast), color var(--motion-fast)',
                  }}
                >
                  {brand}
                </button>
              )
            })}
            {filters.brands.length > 0 && (
              <button
                type="button"
                onClick={() => onFiltersChange({ ...filters, brands: [] })}
                style={{
                  height: '26px',
                  padding: '0 6px',
                  borderRadius: '13px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-subtle)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
                aria-label="Clear brand filter"
              >
                ✕
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Extract unique sorted brand names from a station list. */
export function extractBrands(stations: CorridorStation[]): string[] {
  const brands = new Set<string>()
  for (const s of stations) {
    brands.add(s.brand ?? 'Independent')
  }
  return Array.from(brands).sort()
}
