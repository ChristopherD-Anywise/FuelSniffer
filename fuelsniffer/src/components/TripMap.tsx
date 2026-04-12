'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Route } from '@/lib/providers/routing'
import type { CorridorStation } from '@/lib/trip/corridor-query'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

interface TripMapInnerProps {
  routes: Route[]
  selectedRouteIndex: number
  stations: CorridorStation[]
  selectedStationId: number | null
  onStationClick: (id: number) => void
}

function TripMapLayers({ routes, selectedRouteIndex, stations, selectedStationId, onStationClick }: TripMapInnerProps) {
  const map = useMap()
  const polylinesRef = useRef<L.Polyline[]>([])
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const onClickRef = useRef(onStationClick)
  onClickRef.current = onStationClick

  // Draw route polylines
  useEffect(() => {
    // Remove old polylines
    polylinesRef.current.forEach(p => p.remove())
    polylinesRef.current = []

    if (routes.length === 0) return

    // Alternatives first (drawn underneath primary)
    routes.forEach((route, i) => {
      if (i === selectedRouteIndex) return
      const latlngs = route.polyline.map(c => [c.lat, c.lng] as [number, number])
      const poly = L.polyline(latlngs, {
        color: '#555555',
        weight: 3,
        opacity: 0.6,
        dashArray: '8 6',
      }).addTo(map)
      polylinesRef.current.push(poly)
    })

    // Primary on top
    if (routes[selectedRouteIndex]) {
      const primary = routes[selectedRouteIndex]
      const latlngs = primary.polyline.map(c => [c.lat, c.lng] as [number, number])
      const poly = L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 5,
        opacity: 0.9,
      }).addTo(map)
      polylinesRef.current.push(poly)

      // Fit bounds to selected route
      const bounds = L.latLngBounds(latlngs)
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
    }

    return () => {
      polylinesRef.current.forEach(p => p.remove())
      polylinesRef.current = []
    }
  }, [routes, selectedRouteIndex, map])

  // Render station markers
  useEffect(() => {
    // Remove old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    if (stations.length === 0) return

    const prices = stations.map(s => s.priceCents)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice

    stations.forEach(station => {
      const ratio = priceRange > 0 ? (station.priceCents - minPrice) / priceRange : 0
      const colour = ratio < 0.33 ? '#22c55e' : ratio < 0.67 ? '#f59e0b' : '#ef4444'
      const priceText = (station.priceCents / 10).toFixed(1)

      const isSelected = station.stationId === selectedStationId

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          min-width:48px;height:28px;padding:0 8px;border-radius:14px;
          background:${colour};
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-weight:700;font-size:12px;font-family:Inter,system-ui,sans-serif;
          box-shadow:0 2px 6px rgba(0,0,0,0.35)${isSelected ? ',0 0 0 3px #ffffff' : ''};
          white-space:nowrap;
        ">${priceText}</div>`,
        iconSize: [48, 28],
        iconAnchor: [24, 14],
      })

      const marker = L.marker([station.latitude, station.longitude], {
        icon,
        title: station.name,
        alt: `${station.name}, ${priceText}¢`,
      })

      marker.bindPopup(
        `<div style="font-family:Inter,system-ui,sans-serif;min-width:180px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${station.name}</div>
          <div style="font-size:12px;color:#888;margin-bottom:6px;">${station.brand ?? 'Independent'}${station.suburb ? ' · ' + station.suburb : ''}</div>
          <div style="font-size:22px;font-weight:900;color:${colour};">${priceText}<span style="font-size:13px;font-weight:500;color:#888">¢</span></div>
        </div>`,
        { maxWidth: 240, className: 'station-popup' }
      )

      marker.on('click', () => {
        onClickRef.current(station.stationId)
      })

      marker.addTo(map)
      markersRef.current.set(station.stationId, marker)
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
    }
  }, [stations, selectedStationId, map])

  // Open popup for selected station
  useEffect(() => {
    if (selectedStationId !== null) {
      const marker = markersRef.current.get(selectedStationId)
      if (marker) {
        marker.openPopup()
        map.panTo(marker.getLatLng(), { animate: true, duration: 0.4 })
      }
    } else {
      map.closePopup()
    }
  }, [selectedStationId, map])

  return null
}

interface TripMapProps extends TripMapInnerProps {
  className?: string
}

export default function TripMap({ routes, selectedRouteIndex, stations, selectedStationId, onStationClick, className }: TripMapProps) {
  // Default to Brisbane if no routes
  const center: [number, number] = [-27.4698, 153.0251]

  return (
    <MapContainer
      center={center}
      zoom={10}
      className={className ?? 'w-full h-full'}
      style={{ minHeight: '300px' }}
      zoomControl={true}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <TripMapLayers
        routes={routes}
        selectedRouteIndex={selectedRouteIndex}
        stations={stations}
        selectedStationId={selectedStationId}
        onStationClick={onStationClick}
      />
    </MapContainer>
  )
}
