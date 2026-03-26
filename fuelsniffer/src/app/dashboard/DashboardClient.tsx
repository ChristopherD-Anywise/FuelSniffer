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

  // User location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'active' | 'denied'>('idle')

  const cardRefsMap = useRef<Map<number, HTMLElement>>(new Map())

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      let url = `/api/prices?fuel=${activeFuel}&radius=${radius}`
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
  }, [activeFuel, radius, userLocation])

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
      />

      {/* Summary bar */}
      {!loading && !error && stationCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-100">
          {cheapest && (
            <>
              <span className="text-lg font-bold text-slate-900 tabular-nums">{cheapest.toFixed(1)}¢</span>
              <span className="text-sm text-slate-400">cheapest</span>
              <span className="text-slate-300">·</span>
            </>
          )}
          <span className="text-sm text-slate-500">{stationCount} stations within {radius}km</span>
          <span className="text-slate-300">·</span>
          <span className="text-sm text-slate-500">{fuelLabel(activeFuel)}</span>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden md:grid md:grid-cols-[minmax(360px,1fr)_1.5fr]">
        {/* Station list */}
        <div className={`h-full overflow-y-auto station-list bg-white ${isMobileMapVisible ? 'hidden md:block' : 'block'}`}>
          {loading && <LoadingSkeleton />}
          {!loading && error && <ErrorState onRetry={fetchPrices} />}
          {!loading && !error && sortedStations.length === 0 && (
            <EmptyState fuelLabel={fuelLabel(activeFuel) ?? activeFuel} radius={radius} />
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
        <div className={`h-full ${isMobileMapVisible ? 'block' : 'hidden md:block'}`}>
          <MapView
            stations={sortedStations}
            selectedId={selectedId}
            activeFuel={activeFuel}
            onPinClick={handlePinClick}
            userLocation={userLocation}
          />
        </div>
      </div>
    </div>
  )
}
