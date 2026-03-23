'use client'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PriceResult } from '@/lib/db/queries/prices'
import { getPinColour } from '@/lib/map-utils'

// Fix broken default Leaflet icon paths in Next.js Webpack builds
// Source: RESEARCH.md Pattern 4 — known issue with all bundlers
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
  onPinClick: (id: number) => void
}

/** Renders and manages Leaflet DivIcon markers imperatively (react-leaflet has no DivIcon component). */
function PriceMarkers({ stations, selectedId, onPinClick }: MapViewProps) {
  const map = useMap()
  const markersRef = useRef<Map<number, L.Marker>>(new Map())

  useEffect(() => {
    // Remove all existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    if (stations.length === 0) return

    const prices = stations.map(s => parseFloat(s.price_cents))
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)

    stations.forEach(station => {
      const price = parseFloat(station.price_cents)
      const colour = getPinColour(price, minPrice, maxPrice)
      const isSelected = station.id === selectedId
      const scale = isSelected ? 'scale(1.2)' : 'scale(1)'
      const ring = isSelected ? 'outline: 3px solid white; outline-offset: 2px;' : ''

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:32px;height:32px;border-radius:50%;
          background:${colour};
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:700;font-size:10px;
          transform:${scale};
          ${ring}
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
        ">${price.toFixed(1)}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      const marker = L.marker([station.latitude, station.longitude], { icon })
      marker.on('click', () => onPinClick(station.id))
      marker.addTo(map)
      markersRef.current.set(station.id, marker)
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
    }
  }, [stations, selectedId, onPinClick, map])

  return null
}

export default function MapView({ stations, selectedId, onPinClick }: MapViewProps) {
  return (
    <MapContainer
      center={[NORTH_LAKES.lat, NORTH_LAKES.lng]}
      zoom={12}
      className="w-full h-full"
      style={{ minHeight: '300px' }}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <PriceMarkers stations={stations} selectedId={selectedId} onPinClick={onPinClick} />
    </MapContainer>
  )
}
