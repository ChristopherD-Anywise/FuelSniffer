'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FilterBar from '@/components/FilterBar'
import StationList from '@/components/StationList'
import PriceChart from '@/components/PriceChart'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { sortStations } from '@/lib/dashboard-utils'
import type { PriceResult } from '@/lib/db/queries/prices'
import type { SortMode } from '@/lib/dashboard-utils'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const FUEL_LABELS: Record<string, string> = {
  '2': 'ULP 91', '5': 'P95', '8': 'P98',
  '12': 'E10', '3': 'Diesel', '14': 'Prem Diesel',
  '4': 'LPG', '19': 'E85',
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
    setSelectedId(id)
    const card = cardRefsMap.current.get(id)
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setIsMobileMapVisible(false)
  }

  function handleLocateMe() {
    if (locationStatus === 'loading') return
    if (locationStatus === 'active') {
      // Toggle off — return to North Lakes default
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

  // Summary stats
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
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-100 text-sm">
          <span className="text-slate-500">
            <span className="font-semibold text-slate-700">{stationCount}</span> stations
          </span>
          {cheapest && (
            <>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">
                From <span className="font-semibold text-emerald-600">{cheapest.toFixed(1)}¢/L</span>
              </span>
            </>
          )}
          <span className="text-slate-300">•</span>
          <span className="text-slate-500">{FUEL_LABELS[activeFuel]}</span>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden md:grid md:grid-cols-[minmax(360px,1fr)_1.5fr]">
        {/* Station list + chart */}
        <div className={`h-full flex flex-col bg-white ${isMobileMapVisible ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto station-list">
            {loading && <LoadingSkeleton />}
            {!loading && error && <ErrorState onRetry={fetchPrices} />}
            {!loading && !error && sortedStations.length === 0 && (
              <EmptyState fuelLabel={FUEL_LABELS[activeFuel] ?? activeFuel} radius={radius} />
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
          {selectedId && (
            <PriceChart
              stationId={selectedId}
              fuelId={activeFuel}
              stationName={sortedStations.find(s => s.id === selectedId)?.name ?? ''}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>

        {/* Map */}
        <div className={`h-full ${isMobileMapVisible ? 'block' : 'hidden md:block'}`}>
          <MapView
            stations={sortedStations}
            selectedId={selectedId}
            onPinClick={handlePinClick}
            userLocation={userLocation}
          />
        </div>
      </div>
    </div>
  )
}
