'use client'
import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PriceResult } from '@/lib/db/queries/prices'
import { getPinColour } from '@/lib/map-utils'
import StationPopup from '@/components/StationPopup'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

const NORTH_LAKES = { lat: -27.2353, lng: 153.0189 }
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

interface MapViewProps {
  stations: PriceResult[]
  selectedId: number | null
  activeFuel: string
  onPinClick: (id: number) => void
  userLocation?: { lat: number; lng: number } | null
}

function PriceMarkers({ stations, selectedId, activeFuel, onPinClick, userLocation }: MapViewProps) {
  const map = useMap()
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const rootsRef = useRef<Map<number, ReturnType<typeof createRoot>>>(new Map())
  const userMarkerRef = useRef<L.Marker | null>(null)
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick
  const activeFuelRef = useRef(activeFuel)
  activeFuelRef.current = activeFuel

  // Create markers when stations change
  useEffect(() => {
    // Clean up old React roots
    rootsRef.current.forEach(root => root.unmount())
    rootsRef.current.clear()
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    if (stations.length === 0) return

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
          position:relative;
          min-width:48px;height:28px;padding:0 8px;border-radius:14px;
          background:${colour};
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:700;font-size:12px;font-family:Inter,system-ui,sans-serif;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
          transition:transform 0.15s ease;
          white-space:nowrap;
        ">${priceText}
          <div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
            width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;
            border-top:5px solid ${colour};"></div>
        </div>`,
        iconSize: [48, 33],
        iconAnchor: [24, 33],
      })

      const marker = L.marker([station.latitude, station.longitude], { icon })

      // Create a DOM container for the React popup
      const popupContainer = document.createElement('div')
      const popup = L.popup({
        maxWidth: 380,
        minWidth: 320,
        closeButton: true,
        className: 'station-popup',
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

      marker.addTo(map)
      markersRef.current.set(station.id, marker)
    })

    return () => {
      rootsRef.current.forEach(root => root.unmount())
      rootsRef.current.clear()
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
    }
  }, [stations, map])

  // User location marker
  useEffect(() => {
    if (userMarkerRef.current) {
      userMarkerRef.current.remove()
      userMarkerRef.current = null
    }
    if (userLocation) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#0ea5e9;
                border:3px solid white;box-shadow:0 0 0 2px #0ea5e9,0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon, interactive: false }).addTo(map)
    }
  }, [userLocation, map])

  // Open popup for selected station
  useEffect(() => {
    if (selectedId) {
      const marker = markersRef.current.get(selectedId)
      if (marker) marker.openPopup()
    } else {
      map.closePopup()
    }
  }, [selectedId, map])

  return null
}

export default function MapView({ stations, selectedId, activeFuel, onPinClick, userLocation }: MapViewProps) {
  const center = userLocation
    ? [userLocation.lat, userLocation.lng] as [number, number]
    : [NORTH_LAKES.lat, NORTH_LAKES.lng] as [number, number]

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="w-full h-full"
      style={{ minHeight: '300px' }}
      zoomControl={false}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <PriceMarkers stations={stations} selectedId={selectedId} activeFuel={activeFuel} onPinClick={onPinClick} userLocation={userLocation} />
    </MapContainer>
  )
}
