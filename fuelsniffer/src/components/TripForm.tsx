'use client'

import { useState } from 'react'
import { FUEL_TYPES } from '@/components/FuelSelect'
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

function parseCoord(raw: string, label: string): { lat: number; lng: number } {
  const parts = raw.trim().split(/[\s,]+/)
  if (parts.length !== 2) throw new Error(`${label}: enter as "lat, lng"`)
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  if (isNaN(lat) || isNaN(lng)) throw new Error(`${label}: invalid numbers`)
  if (lat < -44 || lat > -10 || lng < 112 || lng > 154) {
    throw new Error(`${label}: must be within Australia`)
  }
  return { lat, lng }
}

export default function TripForm({ onResult, onError, loading, setLoading }: TripFormProps) {
  const [startRaw, setStartRaw] = useState('')
  const [endRaw, setEndRaw] = useState('')
  const [fuelTypeId, setFuelTypeId] = useState('2')
  const [corridorKm, setCorridorKm] = useState(2)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'denied'>('idle')
  const [fieldErrors, setFieldErrors] = useState<{ start?: string; end?: string }>({})

  function handleLocateStart() {
    if (!navigator.geolocation) {
      setFieldErrors(e => ({ ...e, start: 'Geolocation not supported' }))
      return
    }
    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const val = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`
        setStartRaw(val)
        setFieldErrors(e => ({ ...e, start: undefined }))
        setGeoStatus('idle')
      },
      () => {
        setGeoStatus('denied')
        setFieldErrors(e => ({ ...e, start: 'Location access denied' }))
        setTimeout(() => setGeoStatus('idle'), 3000)
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})

    let start: { lat: number; lng: number }
    let end: { lat: number; lng: number }

    try {
      start = parseCoord(startRaw, 'Start')
    } catch (err) {
      setFieldErrors(e => ({ ...e, start: (err as Error).message }))
      return
    }
    try {
      end = parseCoord(endRaw, 'End')
    } catch (err) {
      setFieldErrors(e => ({ ...e, end: (err as Error).message }))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/trip/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, alternatives: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const result: RouteResult = await res.json()
      onResult(result, { start, end, fuelTypeId, corridorKm })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to fetch route')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '40px',
    borderRadius: '8px',
    border: '1px solid #2a2a2a',
    background: '#1a1a1a',
    paddingLeft: '12px',
    paddingRight: '12px',
    fontSize: '14px',
    color: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#888888',
    marginBottom: '6px',
    display: 'block',
  }

  const errorStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#ef4444',
    marginTop: '4px',
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
      aria-label="Trip planner"
    >
      {/* Start */}
      <div>
        <label htmlFor="trip-start" style={labelStyle}>Start location</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <input
            id="trip-start"
            type="text"
            value={startRaw}
            onChange={e => { setStartRaw(e.target.value); setFieldErrors(er => ({ ...er, start: undefined })) }}
            placeholder="-27.4698, 153.0251"
            style={{ ...inputStyle, flex: 1 }}
            aria-describedby={fieldErrors.start ? 'start-error' : undefined}
            aria-invalid={!!fieldErrors.start}
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleLocateStart}
            disabled={loading || geoStatus === 'loading'}
            title="Use my current location"
            style={{
              height: '40px',
              width: '40px',
              borderRadius: '8px',
              border: '1px solid #2a2a2a',
              background: geoStatus === 'denied' ? 'rgba(239,68,68,0.15)' : '#1a1a1a',
              color: geoStatus === 'loading' ? '#f59e0b' : geoStatus === 'denied' ? '#ef4444' : '#8a8a8a',
              cursor: loading || geoStatus === 'loading' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Use my current location for start"
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
        {fieldErrors.start && <p id="start-error" style={errorStyle}>{fieldErrors.start}</p>}
      </div>

      {/* End */}
      <div>
        <label htmlFor="trip-end" style={labelStyle}>End location</label>
        <input
          id="trip-end"
          type="text"
          value={endRaw}
          onChange={e => { setEndRaw(e.target.value); setFieldErrors(er => ({ ...er, end: undefined })) }}
          placeholder="-26.6500, 153.0667"
          style={inputStyle}
          aria-describedby={fieldErrors.end ? 'end-error' : undefined}
          aria-invalid={!!fieldErrors.end}
          disabled={loading}
        />
        {fieldErrors.end && <p id="end-error" style={errorStyle}>{fieldErrors.end}</p>}
      </div>

      {/* Fuel type */}
      <div>
        <label htmlFor="trip-fuel" style={labelStyle}>Fuel type</label>
        <div style={{ position: 'relative' }}>
          <select
            id="trip-fuel"
            value={fuelTypeId}
            onChange={e => setFuelTypeId(e.target.value)}
            disabled={loading}
            style={{
              ...inputStyle,
              paddingRight: '32px',
              appearance: 'none',
              cursor: 'pointer',
            }}
          >
            {FUEL_TYPES.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <svg
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#666666' }}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {/* Corridor width */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label htmlFor="trip-corridor" style={{ ...labelStyle, marginBottom: 0 }}>Corridor width</label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
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
          style={{ accentColor: '#f59e0b', width: '100%' }}
          aria-label={`Corridor width: ${corridorKm}km`}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555555', marginTop: '2px' }}>
          <span>500m</span>
          <span>20km</span>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !startRaw.trim() || !endRaw.trim()}
        style={{
          height: '44px',
          borderRadius: '8px',
          border: 'none',
          background: loading || !startRaw.trim() || !endRaw.trim() ? '#2a2a2a' : '#f59e0b',
          color: loading || !startRaw.trim() || !endRaw.trim() ? '#555555' : '#000000',
          fontSize: '14px',
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: loading || !startRaw.trim() || !endRaw.trim() ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s, color 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Finding route…
          </>
        ) : (
          'Find fuel on route →'
        )}
      </button>
    </form>
  )
}
