'use client'
/**
 * TripForm — SP-7 redesigned trip planner form.
 *
 * Changes from SP-2 baseline:
 *  - Default corridor 2 km → 3 km
 *  - Swap-direction button between Start and End
 *  - Corridor slider: datalist tick marks at 1,2,5,10,20km + aria-valuetext
 *  - Geolocation error has role="status" aria-live="polite"
 *  - Submit disabled state uses SP-3 tokens (WCAG AA contrast)
 *  - Friendly route error copy (no raw HTTP messages)
 *  - All inline styles use SP-3 CSS variables
 */

import { useState } from 'react'
import { FUEL_TYPES } from '@/components/FuelSelect'
import AddressSearch, { type AddressResult } from '@/components/AddressSearch'
import type { RouteResult } from '@/lib/providers/routing'

export interface TripFormValues {
  start: { lat: number; lng: number }
  end: { lat: number; lng: number }
  fuelTypeId: string
  corridorKm: number
}

interface TripFormProps {
  onResult: (result: RouteResult, values: TripFormValues) => void
  onError: (msg: string) => void
  loading: boolean
  setLoading: (v: boolean) => void
}

/** Map raw route-fetch errors to friendly copy for users. */
function friendlyRouteError(err: Error): string {
  const msg = err.message ?? ''
  if (/HTTP 4\d\d/.test(msg) || /not found/i.test(msg)) {
    return 'Check the start and end pins and try again.'
  }
  if (/HTTP 5\d\d/.test(msg) || /network|fetch|failed/i.test(msg)) {
    return "We couldn't plan that route. Try moving the pins off water or off a highway."
  }
  return 'Route planning failed. Please try again.'
}

export default function TripForm({ onResult, onError, loading, setLoading }: TripFormProps) {
  const [start, setStart] = useState<AddressResult | null>(null)
  const [end, setEnd] = useState<AddressResult | null>(null)
  const [fuelTypeId, setFuelTypeId] = useState('2')
  const [corridorKm, setCorridorKm] = useState(3)  // SP-7: default changed from 2 to 3
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'denied'>('idle')
  const [geoError, setGeoError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function handleLocateStart() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported')
      return
    }
    setGeoStatus('loading')
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' })
        setGeoStatus('idle')
      },
      () => {
        setGeoStatus('denied')
        setGeoError('Location access denied')
        setTimeout(() => setGeoStatus('idle'), 3000)
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  function handleSwap() {
    const tmp = start
    setStart(end)
    setEnd(tmp)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!start || !end) return

    setLoading(true)
    try {
      const res = await fetch('/api/trip/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { lat: start.lat, lng: start.lng },
          end: { lat: end.lat, lng: end.lng },
          alternatives: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const result: RouteResult = await res.json()
      onResult(result, {
        start: { lat: start.lat, lng: start.lng },
        end: { lat: end.lat, lng: end.lng },
        fuelTypeId,
        corridorKm,
      })
    } catch (err) {
      const raw = err instanceof Error ? err : new Error('Failed to fetch route')
      const message = friendlyRouteError(raw)
      setSubmitError(message)
      onError(message)
    } finally {
      setLoading(false)
    }
  }

  const eyebrowStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-subtle)',
    marginBottom: '6px',
    display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '44px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-elevated)',
    paddingLeft: '12px',
    paddingRight: '12px',
    fontSize: '14px',
    color: 'var(--color-text)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const isDisabled = loading || !start || !end

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Trip planner"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Start + geolocation button */}
      <div>
        <label htmlFor="trip-start" style={eyebrowStyle}>Start location</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <AddressSearch
              id="trip-start"
              placeholder="Search address, suburb, or postcode…"
              initialValue={start?.label ?? ''}
              onSelect={setStart}
              disabled={loading}
            />
          </div>
          <button
            type="button"
            onClick={handleLocateStart}
            disabled={loading || geoStatus === 'loading'}
            aria-label="Use my current location for start"
            title="Use my current location"
            style={{
              height: '44px',
              width: '44px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--color-border)',
              background: geoStatus === 'denied' ? 'rgba(239,68,68,0.15)' : 'var(--color-bg-elevated)',
              color: geoStatus === 'loading' ? 'var(--color-accent)' : geoStatus === 'denied' ? 'var(--color-danger)' : 'var(--color-text-subtle)',
              cursor: loading || geoStatus === 'loading' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'color var(--motion-fast), background var(--motion-fast)',
            }}
          >
            {geoStatus === 'loading' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              </svg>
            )}
          </button>
        </div>
        {/* Geolocation error — announced to screen readers */}
        {geoError && (
          <p
            role="status"
            aria-live="polite"
            style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}
          >
            {geoError}
          </p>
        )}
      </div>

      {/* Swap direction button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-8px', marginBottom: '-8px' }}>
        <button
          type="button"
          onClick={handleSwap}
          disabled={loading}
          aria-label="Swap start and end locations"
          title="Swap start and end"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text-subtle)',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            transition: 'background var(--motion-fast)',
          }}
          onMouseEnter={e => {
            if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-elevated)'
          }}
          onMouseLeave={e => {
            if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
            <polyline points="5 12 12 5 19 12" style={{ opacity: 0.4 }}/>
          </svg>
        </button>
      </div>

      {/* End location */}
      <div>
        <label htmlFor="trip-end" style={eyebrowStyle}>End location</label>
        <AddressSearch
          id="trip-end"
          placeholder="Search address, suburb, or postcode…"
          initialValue={end?.label ?? ''}
          onSelect={setEnd}
          disabled={loading}
        />
      </div>

      {/* Fuel type */}
      <div>
        <label htmlFor="trip-fuel" style={eyebrowStyle}>Fuel type</label>
        <select
          id="trip-fuel"
          value={fuelTypeId}
          onChange={e => setFuelTypeId(e.target.value)}
          disabled={loading}
          style={{
            ...inputStyle,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {FUEL_TYPES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      {/* Corridor width slider */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label htmlFor="trip-corridor" style={{ ...eyebrowStyle, marginBottom: 0 }}>
            Corridor width
          </label>
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--color-text)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {corridorKm < 1 ? `${corridorKm * 1000}m` : `${corridorKm}km`}
          </span>
        </div>
        <input
          id="trip-corridor"
          type="range"
          min={0.5}
          max={20}
          step={0.5}
          value={corridorKm}
          onChange={e => setCorridorKm(Number(e.target.value))}
          disabled={loading}
          list="corridor-ticks"
          style={{ accentColor: 'var(--color-accent)', width: '100%' }}
          aria-label="Corridor width"
          aria-valuetext={`${corridorKm < 1 ? `${corridorKm * 1000} metres` : `${corridorKm} kilometres`}`}
        />
        {/* Tick marks at useful intervals */}
        <datalist id="corridor-ticks">
          <option value="1" label="1km"/>
          <option value="2" label="2km"/>
          <option value="5" label="5km"/>
          <option value="10" label="10km"/>
          <option value="20" label="20km"/>
        </datalist>
        <p style={{
          fontSize: '11px',
          color: 'var(--color-text-subtle)',
          marginTop: '4px',
        }}>
          Wider catches more stations but slows the search.
        </p>
      </div>

      {submitError && (
        <p
          style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '-4px' }}
          role="alert"
        >
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={isDisabled}
        aria-busy={loading}
        style={{
          height: '44px',
          borderRadius: 'var(--radius-sm, 6px)',
          border: 'none',
          // SP-7 T-BUG-4: token-driven disabled state for WCAG AA contrast
          background: isDisabled ? 'var(--color-border)' : 'var(--color-accent)',
          color: isDisabled ? 'var(--color-text-muted)' : 'var(--color-accent-fg)',
          fontSize: '14px',
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: 'background var(--motion-fast), color var(--motion-fast)',
        }}
      >
        {loading ? 'Finding route…' : 'Find fuel on route →'}
      </button>
    </form>
  )
}
