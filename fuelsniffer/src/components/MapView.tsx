'use client'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
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

function PriceMarkers({ stations, selectedId, onPinClick, userLocation }: MapViewProps) {
  const map = useMap()
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick

  // Create markers when stations change
  useEffect(() => {
    // Clean up previous cluster group
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }
    markersRef.current.clear()

    if (stations.length === 0) return

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          className: '',
          html: `<div style="
            width:36px;height:36px;border-radius:50%;
            background:#0ea5e9;color:white;
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:13px;font-family:Inter,system-ui,sans-serif;
            box-shadow:0 2px 6px rgba(0,0,0,0.2);
            border:2px solid white;
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
          box-shadow:0 2px 6px rgba(0,0,0,0.2);
          transition:transform 0.15s ease;
          white-space:nowrap;
        ">${priceText}</div>`,
        iconSize: [48, 28],
        iconAnchor: [24, 14],
      })

      const marker = L.marker([station.latitude, station.longitude], { icon })

      const popupHtml = `
        <div style="font-family:Inter,system-ui,sans-serif;width:240px;">
          <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px;">
            <span style="font-size:24px;font-weight:800;color:${colour};line-height:1;">${priceText}</span>
            <span style="font-size:12px;color:#94a3b8;">c/L</span>
          </div>
          <div style="font-size:14px;font-weight:600;color:#0f172a;">${station.name}</div>
          ${station.brand ? `<div style="font-size:11px;color:#94a3b8;">${station.brand}</div>` : ''}
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${station.address || ''}</div>
        </div>
      `
      marker.bindPopup(popupHtml, { maxWidth: 260, closeButton: true })

      marker.on('click', () => {
        onPinClickRef.current(station.id)
      })

      marker.addTo(clusterGroup)
      markersRef.current.set(station.id, marker)
    })

    clusterGroup.addTo(map)
    clusterRef.current = clusterGroup

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current)
        clusterRef.current = null
      }
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

  // Open popup for selected station and pan to it
  useEffect(() => {
    if (selectedId) {
      const marker = markersRef.current.get(selectedId)
      if (marker) {
        marker.openPopup()
        map.panTo(marker.getLatLng(), { animate: true, duration: 0.3 })
      }
    } else {
      map.closePopup()
    }
  }, [selectedId, map])

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
