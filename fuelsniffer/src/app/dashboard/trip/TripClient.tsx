'use client'
/**
 * TripClient — SP-7 orchestration component for the trip planner.
 *
 * SP-7 additions over SP-2 baseline:
 *  - Sort/filter state (URL params: ?sort=..&brands=..&verdict=..)
 *  - bestFill URL param (?bestFill=stationId)
 *  - 250 ms debounce on route-change re-fetch
 *  - Non-blocking toast on corridor re-fetch failure (TripToast)
 *  - Limit raised from 20 to 30
 *  - TripTotalCost panel
 *  - TripSortFilter bar
 *  - Mobile: sticky summary bar + expandable form sheet + bottom-sheet list
 *  - Proper AppHeader slot (Back + FILLIP · Trip Planner)
 *  - Empty state callbacks (widen corridor, change fuel)
 */

import { useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import TripForm, { type TripFormValues } from '@/components/TripForm'
import RouteChipStrip from '@/components/RouteChipStrip'
import TripStationList from '@/components/TripStationList'
import TripSortFilter, { extractBrands } from '@/components/TripSortFilter'
import TripTotalCost from '@/components/TripTotalCost'
import TripToast from '@/components/TripToast'
import type { RouteResult } from '@/lib/providers/routing'
import type { CorridorStation } from '@/lib/trip/corridor-query'
import { sortStations, filterStations, type TripSortKey, type TripFilterState } from '@/lib/trip/sort-filter'
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

/** Read URL search param, return null if not present */
function getParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

/** Update URL search params without page reload */
function setParam(key: string, value: string | null) {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  if (value === null) u.searchParams.delete(key)
  else u.searchParams.set(key, value)
  window.history.replaceState(null, '', u.toString())
}

export default function TripClient() {
  const [state, setState] = useState<TripState>({ phase: 'idle' })
  const [formLoading, setFormLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Sort/filter state — lazy initializers read URL params on first client render
  const [sort, setSort] = useState<TripSortKey>(() => {
    const urlSort = getParam('sort') as TripSortKey | null
    return urlSort && ['effective_price', 'detour_minutes', 'verdict'].includes(urlSort) ? urlSort : 'effective_price'
  })
  const [filters, setFilters] = useState<TripFilterState>(() => {
    const urlBrands = getParam('brands')
    const urlVerdict = getParam('verdict') as TripFilterState['verdict']
    return {
      brands: urlBrands ? urlBrands.split(',').filter(Boolean) : [],
      verdict: urlVerdict ?? null,
    }
  })
  const [bestFillId, setBestFillId] = useState<number | null>(() => {
    const urlBestFill = getParam('bestFill')
    return urlBestFill ? parseInt(urlBestFill, 10) : null
  })

  // Mobile: form sheet expanded
  const [mobileFormExpanded, setMobileFormExpanded] = useState(false)

  // Debounce ref for route-change re-fetch
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSortChange(newSort: TripSortKey) {
    setSort(newSort)
    setParam('sort', newSort === 'effective_price' ? null : newSort)
  }

  function handleFiltersChange(newFilters: TripFilterState) {
    setFilters(newFilters)
    setParam('brands', newFilters.brands.length ? newFilters.brands.join(',') : null)
    setParam('verdict', newFilters.verdict)
  }

  function handleSetBestFill(id: number) {
    const next = bestFillId === id ? null : id
    setBestFillId(next)
    setParam('bestFill', next !== null ? String(next) : null)
  }

  const handleRouteResult = useCallback(async (result: RouteResult, values: TripFormValues) => {
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
          limit: 30,
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
      setMobileFormExpanded(false)
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

  // Route-change re-fetch with 250 ms debounce
  function handleRouteChange(newIndex: number) {
    if (state.phase !== 'results') return

    setState(prev => prev.phase === 'results' ? { ...prev, selectedRouteIndex: newIndex, selectedStationId: null } : prev)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (state.phase !== 'results') return
      const route = [state.routeResult.primary, ...state.routeResult.alternatives][newIndex]
      if (!route) return

      const corridorMeters = Math.round(state.formValues.corridorKm * 1000)

      try {
        const res = await fetch('/api/trip/stations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            polyline: route.polyline,
            fuelTypeId: parseInt(state.formValues.fuelTypeId, 10),
            corridorMeters,
            excludeBrands: [],
            limit: 30,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const stations: CorridorStation[] = await res.json()
        setState(prev => prev.phase === 'results' ? { ...prev, stations } : prev)
      } catch {
        // Non-critical: keep prior stations, show toast
        setToastMessage("Couldn't refresh stations for new route")
      }
    }, 250)
  }

  // Empty state callbacks
  function handleWidenCorridor() {
    if (state.phase !== 'results') return
    const newValues: TripFormValues = { ...state.formValues, corridorKm: 5 }
    handleRouteResult(state.routeResult, newValues)
  }

  function handleChangeFuel() {
    // Scroll to top of form — on mobile expand the form sheet
    setMobileFormExpanded(true)
    document.getElementById('trip-fuel')?.focus()
  }

  const allRoutes =
    state.phase === 'results'
      ? [state.routeResult.primary, ...state.routeResult.alternatives]
      : []

  // Apply sort + filter to stations for display
  const displayStations =
    state.phase === 'results'
      ? filterStations(
          sortStations(state.stations, sort),
          filters
        )
      : []

  const availableBrands =
    state.phase === 'results' ? extractBrands(state.stations) : []

  const tripDistanceKm =
    state.phase === 'results' ? (state.routeResult.primary.distance ?? 0) / 1000 : 0

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ minHeight: '100dvh', background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {/* Header */}
      <div style={{ background: 'var(--color-bg)', borderBottom: '3px solid var(--color-accent)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          height: '52px',
          maxWidth: '1200px',
          margin: '0 auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link
              href="/dashboard"
              style={{
                color: 'var(--color-text-subtle)',
                textDecoration: 'none',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              aria-label="Back to dashboard"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </Link>
            <span aria-hidden="true" style={{ color: 'var(--color-border)' }}>|</span>
            <span style={{
              fontSize: '16px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
            }}>
              FILLIP<span style={{ color: 'var(--color-accent)' }}>.</span>
              <span style={{ color: 'var(--color-text-subtle)', fontWeight: 600, fontSize: '14px' }}> · Trip Planner</span>
            </span>
          </div>
        </div>
      </div>

      {/* Mobile sticky summary bar (shown when results + form collapsed) */}
      {state.phase === 'results' && !mobileFormExpanded && (
        <div
          className="md:hidden"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'var(--color-bg-elevated)',
            borderBottom: '1px solid var(--color-border)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            <span style={{ color: 'var(--color-text-subtle)' }}>From:</span> {state.formValues.start.lat.toFixed(3)},{state.formValues.start.lng.toFixed(3)}{' '}
            <span style={{ color: 'var(--color-text-subtle)' }}>· To:</span> {state.formValues.end.lat.toFixed(3)},{state.formValues.end.lng.toFixed(3)}{' '}
            · {state.formValues.corridorKm}km
          </div>
          <button
            type="button"
            onClick={() => setMobileFormExpanded(true)}
            style={{
              flexShrink: 0,
              height: '32px',
              padding: '0 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Edit ▾
          </button>
        </div>
      )}

      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '24px 16px',
          display: 'grid',
          gap: '24px',
        }}
        className="md:grid-cols-[380px_1fr]"
      >
        {/* Left column: form + results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Form — collapsible on mobile when results exist */}
          <div
            className={state.phase === 'results' ? 'hidden md:block' : undefined}
            style={state.phase === 'results' && mobileFormExpanded ? { display: 'block' } : undefined}
          >
            <TripForm
              onResult={handleRouteResult}
              onError={handleError}
              loading={formLoading || state.phase === 'loading'}
              setLoading={setFormLoading}
            />
          </div>

          {state.phase === 'error' && (
            <div
              role="alert"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-md, 10px)',
                padding: '12px 14px',
                fontSize: '14px',
                color: 'var(--color-danger)',
              }}
            >
              {state.message}
            </div>
          )}

          {state.phase === 'results' && (
            <>
              {/* Route options */}
              <div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-subtle)',
                  marginBottom: '10px',
                }}>
                  Route options
                </div>
                <RouteChipStrip
                  routes={allRoutes}
                  selectedIndex={state.selectedRouteIndex}
                  onSelect={handleRouteChange}
                />
              </div>

              {/* Total trip cost panel */}
              <TripTotalCost
                tripDistanceKm={tripDistanceKm}
                stations={displayStations}
              />

              {/* Stations section */}
              <div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-subtle)',
                  marginBottom: '4px',
                }}>
                  Stations along route
                </div>
                <div style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md, 10px)',
                  overflow: 'hidden',
                }}>
                  <TripSortFilter
                    sort={sort}
                    filters={filters}
                    onSortChange={handleSortChange}
                    onFiltersChange={handleFiltersChange}
                    availableBrands={availableBrands}
                  />
                  <TripStationList
                    stations={displayStations}
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
                    onSetBestFill={handleSetBestFill}
                    bestFillId={bestFillId}
                    corridorKm={state.formValues.corridorKm}
                    fuelTypeId={state.formValues.fuelTypeId}
                    onWidenCorridor={handleWidenCorridor}
                    onChangeFuel={handleChangeFuel}
                    tankSizeLitres={50}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right column: map */}
        <div
          style={{
            borderRadius: 'var(--radius-lg, 16px)',
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            minHeight: '400px',
            position: 'relative',
          }}
          className="h-[50vh] md:h-auto md:min-h-[600px]"
        >
          {state.phase === 'loading' && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-bg)',
              zIndex: 10,
              flexDirection: 'column',
              gap: '12px',
            }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ animation: 'spin 1s linear infinite' }}
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span style={{ color: 'var(--color-text-subtle)', fontSize: '14px' }}>Finding route…</span>
            </div>
          )}

          {(state.phase === 'idle' || state.phase === 'error') && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-bg)',
              flexDirection: 'column',
              gap: '8px',
              color: 'var(--color-text-subtle)',
            }}>
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
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
        </div>
      </div>

      {/* Non-blocking toast */}
      <TripToast message={toastMessage} onDismiss={() => setToastMessage(null)} />

      {/* Spin animation (respects prefers-reduced-motion) */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes spin { from { opacity: 1; } to { opacity: 0.5; } }
        }
      `}</style>
    </main>
  )
}
