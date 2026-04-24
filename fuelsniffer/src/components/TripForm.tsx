'use client'

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

export default function TripForm({ onResult, onError, loading, setLoading }: TripFormProps) {
  const [start, setStart] = useState<AddressResult | null>(null)
  const [end, setEnd] = useState<AddressResult | null>(null)
  const [fuelTypeId, setFuelTypeId] = useState('2')
  const [corridorKm, setCorridorKm] = useState(2)
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
      const message = err instanceof Error ? err.message : 'Failed to fetch route'
      setSubmitError(message)
      onError(message)
    } finally {
      setLoading(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--color-text-subtle)', marginBottom: '6px', display: 'block',
  }
  const errorStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Trip planner"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Start */}
      <div>
        <label htmlFor="trip-start" style={labelStyle}>Start location</label>
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
              height: '40px', width: '40px', borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: geoStatus === 'denied' ? 'rgba(239,68,68,0.15)' : 'var(--color-bg-elevated)',
              color: geoStatus === 'loading' ? 'var(--color-accent)' : geoStatus === 'denied' ? 'var(--color-danger)' : 'var(--color-text-subtle)',
              cursor: loading || geoStatus === 'loading' ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {geoStatus === 'loading' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              </svg>
            )}
          </button>
        </div>
        {geoError && <p style={errorStyle}>{geoError}</p>}
      </div>

      {/* End */}
      <div>
        <label htmlFor="trip-end" style={labelStyle}>End location</label>
        <AddressSearch
          id="trip-end"
          placeholder="Search address, suburb, or postcode…"
          initialValue={end?.label ?? ''}
          onSelect={setEnd}
          disabled={loading}
        />
      </div>

      {/* Fuel */}
      <div>
        <label htmlFor="trip-fuel" style={labelStyle}>Fuel type</label>
        <select
          id="trip-fuel"
          value={fuelTypeId}
          onChange={e => setFuelTypeId(e.target.value)}
          disabled={loading}
          style={{
            width: '100%', height: '40px', borderRadius: '8px',
            border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)',
            paddingLeft: '12px', paddingRight: '12px',
            fontSize: '14px', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
          }}
        >
          {FUEL_TYPES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      {/* Corridor */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label htmlFor="trip-corridor" style={{ ...labelStyle, marginBottom: 0 }}>Corridor width</label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
            {corridorKm < 1 ? `${corridorKm * 1000}m` : `${corridorKm}km`}
          </span>
        </div>
        <input
          id="trip-corridor"
          type="range"
          min={0.5} max={20} step={0.5}
          value={corridorKm}
          onChange={e => setCorridorKm(Number(e.target.value))}
          disabled={loading}
          style={{ accentColor: 'var(--color-accent)', width: '100%' }}
          aria-label={`Corridor width: ${corridorKm}km`}
        />
      </div>

      {submitError && <p style={errorStyle} role="alert">{submitError}</p>}

      <button
        type="submit"
        disabled={loading || !start || !end}
        aria-busy={loading}
        style={{
          height: '44px', borderRadius: '8px', border: 'none',
          background: loading || !start || !end ? 'var(--color-border)' : 'var(--color-accent)',
          color: loading || !start || !end ? 'var(--color-text-subtle)' : 'var(--color-accent-fg)',
          fontSize: '14px', fontWeight: 900, textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: loading || !start || !end ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Finding route…' : 'Find fuel on route →'}
      </button>
    </form>
  )
}
