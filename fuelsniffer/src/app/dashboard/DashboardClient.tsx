'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FilterBar from '@/components/FilterBar'
import StationList from '@/components/StationList'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { sortStations } from '@/lib/dashboard-utils'
import type { PriceResult } from '@/lib/db/queries/prices'
import type { SortMode } from '@/lib/dashboard-utils'

// CRITICAL: MapView MUST use dynamic with ssr:false — Leaflet accesses window
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

// Fuel type label map (matches FuelTypePills order)
const FUEL_LABELS: Record<string, string> = {
  '2': 'ULP91', '5': 'ULP95', '4': 'ULP98',
  '1': 'Diesel', '3': 'E10', '6': 'E85',
}

export default function DashboardClient() {
  const params = useSearchParams()
  const router = useRouter()

  // URL param state with defaults (D-12: filter state in URL params)
  const activeFuel = params.get('fuel') ?? '2'        // default ULP91
  const radius = parseInt(params.get('radius') ?? '20', 10)
  const sortMode = (params.get('sort') ?? 'price') as SortMode

  // Component state
  const [stations, setStations] = useState<PriceResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isMobileMapVisible, setIsMobileMapVisible] = useState(false)

  // Card refs for scrollIntoView on pin click
  const cardRefsMap = useRef<Map<number, HTMLElement>>(new Map())

  // Fetch prices from /api/prices — re-runs when fuel or radius URL params change
  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/prices?fuel=${activeFuel}&radius=${radius}`)
      if (!res.ok) throw new Error('API error')
      const data: PriceResult[] = await res.json()
      setStations(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeFuel, radius])

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  // URL update helpers
  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.replace(`/dashboard?${next.toString()}`)
  }

  // Debounced radius slider (D-10: debounced 400ms per UI-SPEC.md)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleRadiusChange(km: number) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateParam('radius', String(km)), 400)
  }

  // Card↔map sync (D-08)
  function handleCardSelect(id: number) {
    setSelectedId(prev => prev === id ? null : id)
  }

  function handlePinClick(id: number) {
    setSelectedId(id)
    // Scroll the corresponding card into view
    const card = cardRefsMap.current.get(id)
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    // On mobile, switch to list view so the card is visible
    setIsMobileMapVisible(false)
  }

  const sortedStations = sortStations(stations, sortMode)

  return (
    <div className="flex flex-col h-screen">
      {/* Filter bar — sticky, always visible (D-11) */}
      <FilterBar
        activeFuel={activeFuel}
        radius={radius}
        onFuelChange={id => updateParam('fuel', id)}
        onRadiusChange={handleRadiusChange}
        sortMode={sortMode}
        onSortChange={mode => updateParam('sort', mode)}
        isMobileMapVisible={isMobileMapVisible}
        onToggleMobileMap={() => setIsMobileMapVisible(v => !v)}
      />

      {/* Content area — split view on desktop, toggle on mobile (D-06) */}
      <div className="flex-1 overflow-hidden md:grid md:grid-cols-2">

        {/* Station list column — hidden on mobile when map is active */}
        <div className={`h-full overflow-y-auto ${isMobileMapVisible ? 'hidden md:block' : 'block'}`}>
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

        {/* Map column — always visible on desktop, toggle on mobile */}
        <div className={`h-full ${isMobileMapVisible ? 'block' : 'hidden md:block'}`}>
          <MapView
            stations={sortedStations}
            selectedId={selectedId}
            onPinClick={handlePinClick}
          />
        </div>

      </div>
    </div>
  )
}
