'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FilterBar from '@/components/FilterBar'
import { FUEL_TYPES } from '@/components/FuelSelect'
import StationList from '@/components/StationList'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { sortStations } from '@/lib/dashboard-utils'
import type { PriceResult } from '@/lib/db/queries/prices'
import type { SortMode } from '@/lib/dashboard-utils'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

function fuelLabel(id: string): string {
  return FUEL_TYPES.find(f => f.id === id)?.label ?? id
}

function IconMap({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#f59e0b' : '#555555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/>
      <line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  )
}

function IconList({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#f59e0b' : '#555555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <circle cx="3" cy="6" r="1" fill={active ? '#f59e0b' : '#555555'} stroke="none"/>
      <circle cx="3" cy="12" r="1" fill={active ? '#f59e0b' : '#555555'} stroke="none"/>
      <circle cx="3" cy="18" r="1" fill={active ? '#f59e0b' : '#555555'} stroke="none"/>
    </svg>
  )
}

function IconTrends({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#f59e0b' : '#555555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}

type MobileTab = 'map' | 'list' | 'trends'

export default function DashboardClient() {
  const params = useSearchParams()
  const router = useRouter()

  const activeFuel  = params.get('fuel')   ?? '2'
  const radiusParam = parseInt(params.get('radius') ?? '20', 10)
  const sortMode    = (params.get('sort') ?? 'price') as SortMode

  const [stations,       setStations]       = useState<PriceResult[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(false)
  const [selectedId,     setSelectedId]     = useState<number | null>(null)
  const [mobileTab,      setMobileTab]      = useState<MobileTab>('map')
  const [userLocation,   setUserLocation]   = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'active' | 'denied'>('idle')
  const [activeSuburb,   setActiveSuburb]   = useState<string | null>(null)
  const [activePostcode, setActivePostcode] = useState<string | null>(null)
  const [fitBounds,      setFitBounds]      = useState(false)
  // Local radius drives the slider display immediately; URL is updated after dragging stops
  const [localRadius,    setLocalRadius]    = useState(radiusParam)
  const radiusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep localRadius in sync when URL param changes externally (e.g. back/forward nav)
  useEffect(() => { setLocalRadius(radiusParam) }, [radiusParam])

  const cardRefsMap = useRef<Map<number, HTMLElement>>(new Map())

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      let url: string
      if (activeSuburb || activePostcode) {
        url = `/api/prices?fuel=${activeFuel}`
        if (activeSuburb) url += `&suburb=${encodeURIComponent(activeSuburb)}`
        if (activePostcode) url += `&postcode=${encodeURIComponent(activePostcode)}`
      } else {
        url = `/api/prices?fuel=${activeFuel}&radius=${radiusParam}`
        if (userLocation) url += `&lat=${userLocation.lat}&lng=${userLocation.lng}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error('API error')
      const data: PriceResult[] = await res.json()
      setStations(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeFuel, radiusParam, userLocation, activeSuburb, activePostcode])

  useEffect(() => { fetchPrices() }, [fetchPrices])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.replace(`/dashboard?${next.toString()}`)
  }

  function handleRadiusChange(km: number) {
    setLocalRadius(km)
    if (radiusDebounceRef.current) clearTimeout(radiusDebounceRef.current)
    radiusDebounceRef.current = setTimeout(() => {
      updateParam('radius', String(km))
    }, 600)
  }

  function handleCardSelect(id: number) {
    setSelectedId(prev => prev === id ? null : id)
    setMobileTab('map')
  }

  function handlePinClick(id: number) {
    setSelectedId(prev => prev === id ? null : id)
  }

  function handleLocationSelect(location: { lat: number; lng: number; label: string; suburb?: string; postcode?: string }) {
    setUserLocation({ lat: location.lat, lng: location.lng })
    setLocationStatus('active')
    setActiveSuburb(location.suburb ?? null)
    setActivePostcode(location.postcode ?? null)
    if (location.suburb || location.postcode) setFitBounds(true)
  }

  function handleLocateMe() {
    if (locationStatus === 'loading') return
    if (locationStatus === 'active') {
      setUserLocation(null)
      setLocationStatus('idle')
      setActiveSuburb(null)
      setActivePostcode(null)
      return
    }
    setLocationStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationStatus('active')
        setActiveSuburb(null)
        setActivePostcode(null)
      },
      () => {
        setLocationStatus('denied')
        setTimeout(() => setLocationStatus('idle'), 3000)
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  const sortedStations = sortStations(stations, sortMode)
  const cheapest   = sortedStations.length > 0 ? parseFloat(sortedStations[0].price_cents) : null
  const dearest    = sortedStations.length > 0 ? parseFloat(sortedStations[sortedStations.length - 1].price_cents) : null
  const avg        = sortedStations.length > 0
    ? sortedStations.reduce((s, st) => s + parseFloat(st.price_cents), 0) / sortedStations.length
    : null
  const stationCount = sortedStations.length

  const isMobileMapVisible = mobileTab === 'map'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#111111' }}>
      <FilterBar
        activeFuel={activeFuel}
        radius={localRadius}
        onFuelChange={id => updateParam('fuel', id)}
        onRadiusChange={handleRadiusChange}
        sortMode={sortMode}
        onSortChange={mode => updateParam('sort', mode)}
        isMobileMapVisible={isMobileMapVisible}
        onToggleMobileMap={() => setMobileTab(t => t === 'map' ? 'list' : 'map')}
        onLocateMe={handleLocateMe}
        locationStatus={locationStatus}
        onLocationSelect={handleLocationSelect}
      />

      {/* Stat bar */}
      {!loading && !error && stationCount > 0 && (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #2a2a2a',
          background: '#1a1a1a',
          flexShrink: 0,
        }}>
          {([
            { label: 'Cheapest', value: cheapest != null ? `${cheapest.toFixed(1)}¢` : '—', color: '#22c55e' },
            { label: 'Area avg', value: avg      != null ? `${avg.toFixed(1)}¢`      : '—', color: '#f59e0b' },
            { label: 'Stations', value: String(stationCount),                                color: '#f59e0b' },
            { label: 'Dearest',  value: dearest  != null ? `${dearest.toFixed(1)}¢`  : '—', color: '#ef4444' },
          ] as const).map(({ label, value, color }, i, arr) => (
            <div key={label} style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 0',
              borderRight: i < arr.length - 1 ? '1px solid #2a2a2a' : 'none',
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#444444', marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content area */}
      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        className="md:grid md:grid-cols-[320px_1fr]"
      >
        {/* Station list */}
        <div
          className={`station-list absolute inset-0 md:relative md:inset-auto h-full overflow-y-auto ${mobileTab === 'list' ? 'block' : 'hidden md:block'}`}
          style={{ borderRight: '1px solid #2a2a2a' }}
        >
          {loading && <LoadingSkeleton />}
          {!loading && error && <ErrorState onRetry={fetchPrices} />}
          {!loading && !error && sortedStations.length === 0 && (
            <EmptyState fuelLabel={fuelLabel(activeFuel)} radius={localRadius} />
          )}
          {!loading && !error && sortedStations.length > 0 && (
            <StationList
              stations={sortedStations}
              selectedId={selectedId}
              onSelect={handleCardSelect}
              cardRefsMap={cardRefsMap.current}
            />
          )}
        </div>

        {/* Map */}
        <div
          className={`absolute inset-0 md:relative md:inset-auto h-full ${mobileTab === 'map' ? 'block' : 'hidden md:block'}`}
        >
          <MapView
            stations={sortedStations}
            selectedId={selectedId}
            activeFuel={activeFuel}
            onPinClick={handlePinClick}
            userLocation={userLocation}
            isVisible={mobileTab === 'map'}
            fitBounds={fitBounds}
            onFitBoundsDone={() => setFitBounds(false)}
          />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div
        className="md:hidden flex-shrink-0 flex"
        style={{ background: '#111111', borderTop: '1px solid #2a2a2a' }}
      >
        {([
          { tab: 'map'    as MobileTab, label: 'Map',    Icon: IconMap    },
          { tab: 'list'   as MobileTab, label: 'List',   Icon: IconList   },
          { tab: 'trends' as MobileTab, label: 'Trends', Icon: IconTrends },
        ]).map(({ tab, label, Icon }) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            style={{ flex: 1, padding: '10px 0 8px', textAlign: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon active={mobileTab === tab} />
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: mobileTab === tab ? '#f59e0b' : '#444444',
              marginTop: 2,
            }}>
              {label}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
