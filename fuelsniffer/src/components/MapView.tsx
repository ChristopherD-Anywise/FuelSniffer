'use client'
import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { PriceResult } from '@/lib/db/queries/prices'
import { getPinColour } from '@/lib/map-utils'
import StationPopup from '@/components/StationPopup'
import { getCssVar } from '@/lib/theme/getCssVar'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

const DEFAULT_CENTER = { lat: -27.2353, lng: 153.0189 }
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

interface MapViewProps {
  stations: PriceResult[]
  selectedId: number | null
  activeFuel: string
  onPinClick: (id: number) => void
  userLocation?: { lat: number; lng: number } | null
  isVisible?: boolean  // triggers invalidateSize when map container becomes visible
  fitBounds?: boolean  // when true, fit map to all current stations
  onFitBoundsDone?: () => void
}

function PriceMarkers({ stations, selectedId, activeFuel, onPinClick, userLocation, isVisible, fitBounds, onFitBoundsDone }: MapViewProps) {
  const map = useMap()
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const rootsRef = useRef<Map<number, ReturnType<typeof createRoot>>>(new Map())
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick
  const activeFuelRef = useRef(activeFuel)
  activeFuelRef.current = activeFuel

  // Create markers when stations change
  useEffect(() => {
    // Clean up — defer unmounts to avoid React race condition
    const oldRoots = new Map(rootsRef.current)
    rootsRef.current.clear()
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }
    markersRef.current.clear()
    setTimeout(() => oldRoots.forEach(root => root.unmount()), 0)

    if (stations.length === 0) return

    // Read theme tokens at marker creation time
    const clusterBg = getCssVar('--map-cluster-bg', '#f59e0b')
    const clusterText = getCssVar('--map-cluster-text', '#000000')
    const clusterBorder = getCssVar('--map-cluster-border', '#111111')

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          className: '',
          // aria-label provided via title on the container for screen readers
          html: `<div title="${count} stations clustered, double-click to expand" style="
  width:36px;height:36px;border-radius:50%;
  background:${clusterBg};color:${clusterText};
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:13px;font-family:Inter,system-ui,sans-serif;
  box-shadow:0 2px 6px rgba(0,0,0,0.4);
  border:2px solid ${clusterBorder};
">${count}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })
      },
    })

    const prices = stations.map(s => parseFloat(s.price_cents))
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)

    stations.forEach(station => {
      const price = parseFloat(station.price_cents)
      const colour = getPinColour(price, minPrice, maxPrice)
      const priceText = price.toFixed(1)

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          min-width:48px;height:28px;padding:0 8px;border-radius:14px;
          background:${colour};
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:700;font-size:12px;font-family:Inter,system-ui,sans-serif;
          box-shadow:0 2px 6px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.2);
          white-space:nowrap;
        ">${priceText}</div>`,
        iconSize: [48, 28],
        iconAnchor: [24, 14],
      })

      const ariaLabel = `${station.name}, ${activeFuelRef.current} ${priceText}¢`
      const marker = L.marker([station.latitude, station.longitude], {
        icon,
        alt: ariaLabel,
        title: ariaLabel,
        keyboard: true,
      })

      // Create a DOM container for the React popup
      const popupContainer = document.createElement('div')
      const popup = L.popup({
        maxWidth: 340,
        minWidth: 310,
        closeButton: true,
        className: 'station-popup',
        autoPan: true,
        autoPanPaddingTopLeft: L.point(50, 50),
        autoPanPaddingBottomRight: L.point(50, 50),
      }).setContent(popupContainer)

      marker.bindPopup(popup)

      // Render React component into popup when it opens
      marker.on('popupopen', () => {
        let root = rootsRef.current.get(station.id)
        if (!root) {
          root = createRoot(popupContainer)
          rootsRef.current.set(station.id, root)
        }
        root.render(
          <StationPopup station={station} fuelId={activeFuelRef.current} />
        )
      })

      marker.on('click', () => {
        onPinClickRef.current(station.id)
      })

      marker.addTo(clusterGroup)
      markersRef.current.set(station.id, marker)
    })

    clusterGroup.addTo(map)
    clusterRef.current = clusterGroup

    return () => {
      const roots = new Map(rootsRef.current)
      rootsRef.current.clear()
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current)
        clusterRef.current = null
      }
      markersRef.current.clear()
      setTimeout(() => roots.forEach(root => root.unmount()), 0)
    }
  }, [stations, map])

  // User location marker
  useEffect(() => {
    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
      userMarkerRef.current = null
    }
    if (userLocation) {
      const accent = getCssVar('--color-accent', '#f59e0b')
      const bg = getCssVar('--color-bg', '#111111')
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${accent};
                border:3px solid ${bg};box-shadow:0 0 0 2px ${accent},0 2px 6px rgba(0,0,0,0.4);"
                title="Your location"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon, interactive: false }).addTo(map)
      map.panTo([userLocation.lat, userLocation.lng], { animate: !prefersReducedMotion, duration: 0.5 })
    }
  }, [userLocation, map])

  // Open popup for selected station — zoom to uncluster, then pan so popup is fully visible
  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (selectedId) {
      const marker = markersRef.current.get(selectedId)
      const cluster = clusterRef.current
      if (marker && cluster) {
        cluster.zoomToShowLayer(marker, () => {
          marker.openPopup()
          // Give the popup DOM a tick to render, then pan to keep it in view
          setTimeout(() => {
            const popup = marker.getPopup()
            if (!popup) return
            const px = map.latLngToContainerPoint(marker.getLatLng())
            const mapSize = map.getSize()
            const popupHeight = 420
            const popupWidth  = 320
            const PAD = 16
            let dx = 0
            let dy = 0
            if (px.y - popupHeight - PAD < 0) dy = px.y - popupHeight - PAD
            if (px.x + popupWidth / 2 + PAD > mapSize.x) dx = px.x + popupWidth / 2 + PAD - mapSize.x
            if (px.x - popupWidth / 2 - PAD < 0) dx = px.x - popupWidth / 2 - PAD
            if (dx !== 0 || dy !== 0) map.panBy([dx, dy], { animate: !prefersReducedMotion, duration: 0.25 })
          }, 50)
        })
      }
    } else {
      map.closePopup()
    }
  }, [selectedId, map])

  // When the map container becomes visible (mobile toggle), tell Leaflet to recalculate
  useEffect(() => {
    if (isVisible) {
      setTimeout(() => map.invalidateSize(), 100)
    }
  }, [isVisible, map])

  // Fit map to all stations when a suburb search result is selected
  useEffect(() => {
    if (!fitBounds || stations.length === 0) return
    const bounds = L.latLngBounds(stations.map(s => [s.latitude, s.longitude]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
    onFitBoundsDone?.()
  }, [fitBounds, stations, map, onFitBoundsDone])

  return null
}

export default function MapView({ stations, selectedId, activeFuel, onPinClick, userLocation, isVisible, fitBounds, onFitBoundsDone }: MapViewProps) {
  const center = userLocation
    ? [userLocation.lat, userLocation.lng] as [number, number]
    : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng] as [number, number]

  return (
    <div
      role="application"
      aria-roledescription="Interactive map of fuel stations"
      aria-label="Fuel station map"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* Skip map link for keyboard users */}
      <a
        href="#station-list"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-[var(--color-accent)] focus:text-[var(--color-accent-fg)] focus:px-3 focus:py-1 focus:rounded focus:text-sm focus:font-medium"
      >
        Skip map, go to station list
      </a>
      <MapContainer
        center={center}
        zoom={12}
        className="w-full h-full"
        style={{ minHeight: '300px', width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        <PriceMarkers stations={stations} selectedId={selectedId} activeFuel={activeFuel} onPinClick={onPinClick} userLocation={userLocation} isVisible={isVisible} fitBounds={fitBounds} onFitBoundsDone={onFitBoundsDone} />
      </MapContainer>
    </div>
  )
}
