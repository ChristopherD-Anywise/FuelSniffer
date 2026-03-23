'use client'
import { useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, useMap, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PriceResult } from '@/lib/db/queries/prices'
import { getPinColour } from '@/lib/map-utils'

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
  userLocation?: { lat: number; lng: number } | null
}

function buildPopupHTML(station: PriceResult): string {
  const price = parseFloat(station.price_cents)
  const color = price < 160 ? '#10b981' : price < 180 ? '#f59e0b' : '#ef4444'
  const addr = [station.address, station.suburb].filter(Boolean).join(', ')
  const lat = station.latitude
  const lng = station.longitude
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  const appleUrl = `https://maps.apple.com/?daddr=${lat},${lng}`

  return `
    <div style="padding:16px;font-family:Inter,system-ui,sans-serif;">
      <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:8px;">
        <span style="font-size:28px;font-weight:800;color:${color};line-height:1;">${price.toFixed(1)}</span>
        <span style="font-size:13px;color:#94a3b8;font-weight:500;">c/L</span>
      </div>
      <div style="font-size:15px;font-weight:600;color:#0f172a;margin-bottom:2px;">${station.name}</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:12px;">${addr}</div>
      <div style="display:flex;gap:8px;">
        <a href="${googleUrl}" target="_blank" rel="noopener"
           style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:8px 0;
                  background:#0ea5e9;color:white;border-radius:8px;font-size:13px;font-weight:600;
                  text-decoration:none;">
          Google Maps
        </a>
        <a href="${appleUrl}" target="_blank" rel="noopener"
           style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:8px 0;
                  background:#1e293b;color:white;border-radius:8px;font-size:13px;font-weight:600;
                  text-decoration:none;">
          Apple Maps
        </a>
      </div>
    </div>
  `
}

function PriceMarkers({ stations, selectedId, onPinClick, userLocation }: MapViewProps) {
  const map = useMap()
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const userMarkerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
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
          transform:${isSelected ? 'scale(1.25)' : 'scale(1)'};
          transition:transform 0.15s ease;
          ${isSelected ? 'outline:2px solid white;outline-offset:1px;z-index:1000;' : ''}
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
      marker.bindPopup(buildPopupHTML(station), {
        maxWidth: 280,
        closeButton: true,
        className: 'station-popup',
      })
      marker.on('click', () => {
        onPinClick(station.id)
        marker.openPopup()
      })
      marker.addTo(map)
      markersRef.current.set(station.id, marker)
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
    }
  }, [stations, selectedId, onPinClick, map])

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
    }
  }, [selectedId])

  return null
}

export default function MapView({ stations, selectedId, onPinClick, userLocation }: MapViewProps) {
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
      <PriceMarkers stations={stations} selectedId={selectedId} onPinClick={onPinClick} userLocation={userLocation} />
    </MapContainer>
  )
}
