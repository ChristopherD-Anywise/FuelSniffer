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

const CHANGE_PERIODS = [
  { hours: 24, label: '24h' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
] as const

export default function DashboardClient() {
  const params = useSearchParams()
  const router = useRouter()

  const activeFuel = params.get('fuel') ?? '2'
  const radius = parseInt(params.get('radius') ?? '20', 10)
  const sortMode = (params.get('sort') ?? 'price') as SortMode

  const [stations, setStations] = useState<PriceResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isMobileMapVisible, setIsMobileMapVisible] = useState(false)
  const [changeHours, setChangeHours] = useState(24)

  // User location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'active' | 'denied'>('idle')

  const cardRefsMap = useRef<Map<number, HTMLElement>>(new Map())

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      let url = `/api/prices?fuel=${activeFuel}&radius=${radius}&changeHours=${changeHours}`
      if (userLocation) {
        url += `&lat=${userLocation.lat}&lng=${userLocation.lng}`
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
  }, [activeFuel, radius, userLocation, changeHours])

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.replace(`/dashboard?${next.toString()}`)
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleRadiusChange(km: number) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateParam('radius', String(km)), 400)
  }

  function handleCardSelect(id: number) {
    setSelectedId(prev => prev === id ? null : id)
  }

  function handlePinClick(id: number) {
    setSelectedId(prev => prev === id ? null : id)
  }

  function handleLocationSelect(location: { lat: number; lng: number; label: string }) {
    setUserLocation({ lat: location.lat, lng: location.lng })
    setLocationStatus('active')
  }

  function handleLocateMe() {
    if (locationStatus === 'loading') return
    if (locationStatus === 'active') {
      setUserLocation(null)
      setLocationStatus('idle')
      return
    }
    setLocationStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationStatus('active')
      },
      () => {
        setLocationStatus('denied')
        setTimeout(() => setLocationStatus('idle'), 3000)
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  const sortedStations = sortStations(stations, sortMode)
  const cheapest = sortedStations.length > 0 ? parseFloat(sortedStations[0].price_cents) : null
  const stationCount = sortedStations.length
  const changePeriodLabel = CHANGE_PERIODS.find(p => p.hours === changeHours)?.label ?? '24h'

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <FilterBar
        activeFuel={activeFuel}
        radius={radius}
        onFuelChange={id => updateParam('fuel', id)}
        onRadiusChange={handleRadiusChange}
        sortMode={sortMode}
        onSortChange={mode => updateParam('sort', mode)}
        isMobileMapVisible={isMobileMapVisible}
        onToggleMobileMap={() => setIsMobileMapVisible(v => !v)}
        onLocateMe={handleLocateMe}
        locationStatus={locationStatus}
        onLocationSelect={handleLocationSelect}
      />

      {/* Summary bar with change period toggle */}
      {!loading && !error && stationCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-white border-b border-slate-100 text-sm">
          {cheapest && (
            <>
              <span className="text-base font-bold text-slate-900 tabular-nums">{cheapest.toFixed(1)}¢</span>
              <span className="text-slate-400">cheapest</span>
              <span className="text-slate-300">·</span>
            </>
          )}
          <span className="text-slate-500">{stationCount} stations</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">{fuelLabel(activeFuel)}</span>

          {/* Change period toggle */}
          <div className="ml-auto flex items-center bg-slate-100 rounded-md p-0.5">
            {CHANGE_PERIODS.map(p => (
              <button
                key={p.hours}
                onClick={() => setChangeHours(p.hours)}
                className={[
                  'px-2 py-0.5 rounded text-xs font-medium transition-all',
                  changeHours === p.hours
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden md:grid md:grid-cols-[280px_1fr]">
        {/* Station list — narrower on desktop */}
        <div className={`absolute inset-0 md:relative md:inset-auto h-full overflow-y-auto station-list bg-white border-r border-slate-100 ${isMobileMapVisible ? 'hidden md:block' : 'block'}`}>
          {loading && <LoadingSkeleton />}
          {!loading && error && <ErrorState onRetry={fetchPrices} />}
          {!loading && !error && sortedStations.length === 0 && (
            <EmptyState fuelLabel={fuelLabel(activeFuel)} radius={radius} />
          )}
          {!loading && !error && sortedStations.length > 0 && (
            <StationList
              stations={sortedStations}
              selectedId={selectedId}
              changePeriodLabel={changePeriodLabel}
              onSelect={handleCardSelect}
              cardRefsMap={cardRefsMap.current}
            />
          )}
        </div>

        {/* Map */}
        <div className={`absolute inset-0 md:relative md:inset-auto h-full ${isMobileMapVisible ? 'block' : 'hidden md:block'}`}>
          <MapView
            stations={sortedStations}
            selectedId={selectedId}
            activeFuel={activeFuel}
            onPinClick={handlePinClick}
            userLocation={userLocation}
            isVisible={isMobileMapVisible}
          />
        </div>
      </div>
    </div>
  )
}
