'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import TripForm, { type TripFormValues } from '@/components/TripForm'
import RouteChipStrip from '@/components/RouteChipStrip'
import TripStationList from '@/components/TripStationList'
import type { RouteResult } from '@/lib/providers/routing'
import type { CorridorStation } from '@/lib/trip/corridor-query'
import Link from 'next/link'

const TripMap = dynamic(() => import('@/components/TripMap'), { ssr: false })

type TripState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'results'
      routeResult: RouteResult
      formValues: TripFormValues
      stations: CorridorStation[]
      selectedRouteIndex: number
      selectedStationId: number | null
    }

export default function TripClient() {
  const [state, setState] = useState<TripState>({ phase: 'idle' })
  const [formLoading, setFormLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(true)

  const handleRouteResult = useCallback(async (result: RouteResult, values: TripFormValues) => {
    // Fetch corridor stations for the primary route
    const primary = result.primary
    const corridorMeters = Math.round(values.corridorKm * 1000)

    setState({ phase: 'loading' })

    try {
      const res = await fetch('/api/trip/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polyline: primary.polyline,
          fuelTypeId: parseInt(values.fuelTypeId, 10),
          corridorMeters,
          excludeBrands: [],
          limit: 20,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }

      const stations: CorridorStation[] = await res.json()

      setState({
        phase: 'results',
        routeResult: result,
        formValues: values,
        stations,
        selectedRouteIndex: 0,
        selectedStationId: null,
      })
      // Route planned → collapse the form to give the map full space.
      setIsFormOpen(false)
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Failed to fetch corridor stations',
      })
    }
  }, [])

  const handleError = useCallback((msg: string) => {
    setState({ phase: 'error', message: msg })
  }, [])

  // Re-query stations when route selection changes
  async function handleRouteChange(newIndex: number) {
    if (state.phase !== 'results') return

    const route = [state.routeResult.primary, ...state.routeResult.alternatives][newIndex]
    if (!route) return

    const corridorMeters = Math.round(state.formValues.corridorKm * 1000)

    setState({ ...state, selectedRouteIndex: newIndex, selectedStationId: null })

    try {
      const res = await fetch('/api/trip/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polyline: route.polyline,
          fuelTypeId: parseInt(state.formValues.fuelTypeId, 10),
          corridorMeters,
          excludeBrands: [],
          limit: 20,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const stations: CorridorStation[] = await res.json()
      setState(prev => prev.phase === 'results' ? { ...prev, stations } : prev)
    } catch {
      // Non-critical: keep existing stations
    }
  }

  const allRoutes =
    state.phase === 'results'
      ? [state.routeResult.primary, ...state.routeResult.alternatives]
      : []

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ minHeight: '100dvh', background: '#111111', color: '#ffffff' }}
    >
      {/* Header */}
      <div style={{ background: '#111111', borderBottom: '3px solid #f59e0b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: '52px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link
              href="/dashboard"
              style={{ color: '#8a8a8a', textDecoration: 'none', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
              aria-label="Back to dashboard"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </Link>
            <span style={{ color: '#2a2a2a' }}>|</span>
            <span style={{ fontSize: '16px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              FUEL<span style={{ color: '#f59e0b' }}>SNIFFER</span>
              <span style={{ color: '#8a8a8a', fontWeight: 600, fontSize: '14px' }}> · Trip Planner</span>
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '24px 16px',
          display: 'grid',
          gap: '24px',
        }}
        className={state.phase === 'results' ? 'md:grid-cols-[380px_1fr]' : ''}
      >
        {/* Left column: route options + stations — only when we have a result.
            Before a result is returned, the form itself lives as an overlay on
            the map so the map gets the full viewport. */}
        {state.phase === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888888', marginBottom: '10px' }}>
                Route options
              </div>
              <RouteChipStrip
                routes={allRoutes}
                selectedIndex={state.selectedRouteIndex}
                onSelect={handleRouteChange}
              />
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888888', marginBottom: '4px' }}>
                Stations along route
                <span style={{ color: '#444444', fontWeight: 600, marginLeft: '6px', textTransform: 'none', letterSpacing: 'normal' }}>
                  ({state.stations.length} found)
                </span>
              </div>
              <div style={{ border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
                <TripStationList
                  stations={state.stations}
                  start={state.formValues.start}
                  end={state.formValues.end}
                  selectedId={state.selectedStationId}
                  onSelect={id =>
                    setState(prev =>
                      prev.phase === 'results'
                        ? { ...prev, selectedStationId: prev.selectedStationId === id ? null : id }
                        : prev
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Right column (or full-width before results): map + form overlay */}
        <div
          style={{
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid #2a2a2a',
            minHeight: '400px',
            position: 'relative',
          }}
          className="h-[70vh] md:h-auto md:min-h-[640px]"
        >
          {/* Map content (or placeholder) */}
          {state.phase === 'loading' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#111111', zIndex: 10, flexDirection: 'column', gap: '12px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span style={{ color: '#888888', fontSize: '14px' }}>Finding route…</span>
            </div>
          )}

          {(state.phase === 'idle' || state.phase === 'error') && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#111111', flexDirection: 'column', gap: '8px', color: '#444444',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              <span style={{ fontSize: '13px' }}>Enter a route to see the map</span>
            </div>
          )}

          {state.phase === 'results' && (
            <TripMap
              routes={allRoutes}
              selectedRouteIndex={state.selectedRouteIndex}
              stations={state.stations}
              selectedStationId={state.selectedStationId}
              onStationClick={id =>
                setState(prev =>
                  prev.phase === 'results'
                    ? { ...prev, selectedStationId: prev.selectedStationId === id ? null : id }
                    : prev
                )
              }
              className="w-full h-full"
            />
          )}

          {/* Top-right "Edit trip" button — only visible once a route is planned. */}
          {state.phase === 'results' && !isFormOpen && (
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              aria-label="Edit trip"
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                zIndex: 600,
                height: '40px',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid rgba(42,42,42,0.8)',
                background: '#f59e0b',
                color: '#000000',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
              </svg>
              Edit trip
            </button>
          )}

          {/* Form overlay — shown when isFormOpen, or always before a result is returned. */}
          {(state.phase !== 'results' || isFormOpen) && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                right: state.phase === 'results' ? '12px' : '12px',
                maxWidth: '400px',
                zIndex: 500,
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                borderRadius: '12px',
              }}
            >
              {/* Close button — only makes sense once a result exists (otherwise there's nothing to reveal). */}
              {state.phase === 'results' && (
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Close trip form"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 1,
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    color: '#8a8a8a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
              <TripForm
                onResult={handleRouteResult}
                onError={handleError}
                loading={formLoading || state.phase === 'loading'}
                setLoading={setFormLoading}
              />

              {state.phase === 'error' && (
                <div
                  role="alert"
                  style={{
                    marginTop: '8px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '14px',
                    color: '#ef4444',
                  }}
                >
                  {state.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </main>
  )
}
