'use client'
/**
 * TripMap — SP-7 polished trip map.
 *
 * SP-7 additions over SP-2 baseline:
 *  - leaflet.markercluster when stations >= 10 (lazy threshold)
 *  - userInteractedRef flag: skips fitBounds after user pans/zooms
 *  - Verdict dot on marker pill (6px badge, colour-coded)
 *  - Full verdict chip + 1-line explainer in popup
 *  - Effective price on marker pill (falls back to pylon)
 *  - Dark map tile filter (--map-tile-filter CSS variable)
 *  - Skip-to-list link before map
 */

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Route } from '@/lib/providers/routing'
import type { CorridorStation } from '@/lib/trip/corridor-query'
import { getCssVar } from '@/lib/theme/getCssVar'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

// Leaflet markercluster types — loaded dynamically to avoid SSR issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkerClusterGroup = any

/** Verdict dot colour for a signal state. Returns null for no dot. */
function verdictDotColor(state: string | undefined | null): string | null {
  switch (state) {
    case 'FILL_NOW':      return 'var(--verdict-fill-now, #22c55e)'
    case 'WAIT_FOR_DROP': return 'var(--verdict-wait, #ef4444)'
    case 'HOLD':          return 'var(--verdict-hold, #f59e0b)'
    default:              return null
  }
}

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
  const clusterRef = useRef<MarkerClusterGroup | null>(null)
  const onClickRef = useRef(onStationClick)
  // Sync prop to ref so the latest handler is always used in event callbacks.
  // The initial value is passed to useRef so the ref is correct on first render too.
  onClickRef.current = onStationClick // eslint-disable-line react-hooks/refs
  // Track whether the user has interacted with the map (panned/zoomed)
  const userInteractedRef = useRef(false)

  // Register interaction listeners once
  useEffect(() => {
    const onInteract = () => { userInteractedRef.current = true }
    map.on('dragstart', onInteract)
    map.on('zoomstart', onInteract)
    return () => {
      map.off('dragstart', onInteract)
      map.off('zoomstart', onInteract)
    }
  }, [map])

  // Draw route polylines
  useEffect(() => {
    polylinesRef.current.forEach(p => p.remove())
    polylinesRef.current = []

    if (routes.length === 0) return

    // Alternatives first (drawn underneath primary)
    routes.forEach((route, i) => {
      if (i === selectedRouteIndex) return
      const latlngs = route.polyline.map(c => [c.lat, c.lng] as [number, number])
      const poly = L.polyline(latlngs, {
        color: getCssVar('--color-text-subtle', '#555555'),
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

      // Only fit bounds if user hasn't interacted with the map yet
      if (!userInteractedRef.current) {
        const bounds = L.latLngBounds(latlngs)
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
      }
    }

    return () => {
      polylinesRef.current.forEach(p => p.remove())
      polylinesRef.current = []
    }
  }, [routes, selectedRouteIndex, map])

  // Render station markers (with optional markercluster)
  useEffect(() => {
    // Remove previous markers/cluster
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    if (stations.length === 0) return

    const prices = stations.map(s => s.effectivePriceCents ?? s.priceCents)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice

    const colorDown = getCssVar('--color-price-down', '#22c55e')
    const colorAccent = getCssVar('--color-accent', '#f59e0b')
    const colorUp = getCssVar('--color-price-up', '#ef4444')
    const colorText = getCssVar('--color-text', '#ffffff')
    const colorTextSubtle = getCssVar('--color-text-subtle', '#888888')
    const colorBg = getCssVar('--color-popup-bg', '#1a1a1a')

    const useCluster = stations.length >= 10

    // Load markercluster dynamically (only when needed)
    async function buildMarkers() {
      if (useCluster) {
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — leaflet.markercluster JS entry has no matching TS declaration
          await import('leaflet.markercluster/dist/leaflet.markercluster.js')
          await import('leaflet.markercluster/dist/MarkerCluster.css')
          await import('leaflet.markercluster/dist/MarkerCluster.Default.css')

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clusterGroup = (L as any).markerClusterGroup({
            maxClusterRadius: 80,
            iconCreateFunction: (cluster: { getChildCount: () => number; getAllChildMarkers: () => L.Marker[] }) => {
              const count = cluster.getChildCount()
              // Find cheapest price in cluster
              const childMarkers = cluster.getAllChildMarkers()
              let cheapestLabel = ''
              let cheapestPrice = Infinity
              for (const m of childMarkers) {
                const opt = (m.options as { priceVal?: number; priceLabel?: string })
                const p = opt.priceVal ?? Infinity
                if (p < cheapestPrice) {
                  cheapestPrice = p
                  cheapestLabel = opt.priceLabel ?? ''
                }
              }
              const clusterBg = getCssVar('--map-cluster-bg', '#f59e0b')
              const clusterText = getCssVar('--map-cluster-text', '#111111')
              return L.divIcon({
                className: '',
                html: `<div style="
                  min-width:56px;height:28px;padding:0 8px;border-radius:14px;
                  background:${clusterBg};display:flex;align-items:center;justify-content:center;
                  color:${clusterText};font-weight:800;font-size:11px;font-family:Inter,system-ui,sans-serif;
                  box-shadow:0 2px 8px rgba(0,0,0,0.35);white-space:nowrap;gap:4px;
                ">${count}× from ${cheapestLabel}</div>`,
                iconSize: [80, 28],
                iconAnchor: [40, 14],
              })
            },
          })
          clusterRef.current = clusterGroup
        } catch {
          // Cluster failed to load — fall through to plain markers
        }
      }

      // Build individual markers
      const newMarkers: L.Marker[] = []

      for (const station of stations) {
        const effective = station.effectivePriceCents ?? station.priceCents
        const pylon = station.priceCents
        const ratio = priceRange > 0 ? (effective - minPrice) / priceRange : 0
        const colour = ratio < 0.33 ? colorDown : ratio < 0.67 ? colorAccent : colorUp
        const priceText = effective.toFixed(1)
        const isSelected = station.stationId === selectedStationId

        const dotColor = verdictDotColor(station.verdict?.state)
        const dotHtml = dotColor
          ? `<div style="position:absolute;bottom:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:${dotColor};border:1.5px solid #fff;"></div>`
          : ''

        const selectedRing = isSelected ? `,0 0 0 3px ${colorText}` : ''
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;display:inline-block;">
            <div style="
              min-width:48px;height:28px;padding:0 8px;border-radius:14px;
              background:${colour};display:flex;align-items:center;justify-content:center;
              color:#fff;font-weight:700;font-size:12px;font-family:Inter,system-ui,sans-serif;
              box-shadow:0 2px 6px rgba(0,0,0,0.35)${selectedRing};
              white-space:nowrap;
            ">${priceText}</div>
            ${dotHtml}
          </div>`,
          iconSize: [56, 30],
          iconAnchor: [28, 14],
        })

        // Verdict explainer for popup
        const verdictHtml = station.verdict && station.verdict.state !== 'UNCERTAIN'
          ? (() => {
              const dotC = verdictDotColor(station.verdict.state) ?? colorAccent
              const verdictLabel = station.verdict.label
              const conf = (station.verdict.confidence * 100).toFixed(0)
              return `
              <div style="display:flex;align-items:center;gap:5px;margin-top:4px;">
                <div style="width:8px;height:8px;border-radius:50%;background:${dotC};flex-shrink:0;"></div>
                <div style="font-size:11px;color:${colorTextSubtle}">${verdictLabel} (${conf}% confidence)</div>
              </div>`
            })()
          : ''

        const marker = L.marker([station.latitude, station.longitude], {
          icon,
          title: station.name,
          alt: `${station.name}, ${priceText}¢`,
          // Store price data for cluster icon
          priceVal: effective,
          priceLabel: `${priceText}¢`,
        } as L.MarkerOptions & { priceVal?: number; priceLabel?: string })

        marker.bindPopup(
          `<div style="font-family:Inter,system-ui,sans-serif;min-width:180px;color:${colorText};background:${colorBg};padding:8px;border-radius:8px;">
            <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${station.name}</div>
            <div style="font-size:12px;color:${colorTextSubtle};margin-bottom:4px;">${station.brand ?? 'Independent'}${station.suburb ? ' · ' + station.suburb : ''}</div>
            <div style="font-size:22px;font-weight:900;color:${colour};">${priceText}<span style="font-size:13px;font-weight:500;color:${colorTextSubtle}">¢</span></div>
            ${station.effectivePriceCents && station.effectivePriceCents < pylon
              ? `<div style="font-size:11px;color:${colorTextSubtle};text-decoration:line-through;">${pylon.toFixed(1)}¢ pylon</div>`
              : ''}
            ${verdictHtml}
          </div>`,
          { maxWidth: 240, className: 'station-popup' }
        )

        marker.on('click', () => {
          onClickRef.current(station.stationId)
        })

        newMarkers.push(marker)
        markersRef.current.set(station.stationId, marker)
      }

      if (useCluster && clusterRef.current) {
        clusterRef.current.addLayers(newMarkers)
        map.addLayer(clusterRef.current)
      } else {
        newMarkers.forEach(m => m.addTo(map))
      }
    }

    buildMarkers().catch(console.error)

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current)
        clusterRef.current = null
      }
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
    }
  }, [stations, selectedStationId, map])

  // Open popup / pan to selected station
  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (selectedStationId !== null) {
      const marker = markersRef.current.get(selectedStationId)
      if (marker) {
        marker.openPopup()
        map.panTo(marker.getLatLng(), { animate: !prefersReducedMotion, duration: 0.4 })
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
  const center: [number, number] = [-27.4698, 153.0251]
  const tileFilter = typeof window !== 'undefined' ? getCssVar('--map-tile-filter', 'none') : 'none'

  return (
    <>
      {/* Skip link for screen readers */}
      <a
        href="#station-list"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '0',
          zIndex: 1000,
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
          padding: '8px 16px',
          borderRadius: '4px',
          fontSize: '14px',
        }}
        onFocus={e => { e.currentTarget.style.left = '8px' }}
        onBlur={e => { e.currentTarget.style.left = '-9999px' }}
      >
        Skip to station list
      </a>

      <MapContainer
        center={center}
        zoom={10}
        className={className ?? 'w-full h-full'}
        style={{ minHeight: '300px' }}
        zoomControl={true}
      >
        <TileLayer
          url={OSM_TILE_URL}
          attribution={OSM_ATTRIBUTION}
          className={tileFilter !== 'none' ? 'dark-tiles' : undefined}
        />
        <TripMapLayers
          routes={routes}
          selectedRouteIndex={selectedRouteIndex}
          stations={stations}
          selectedStationId={selectedStationId}
          onStationClick={onStationClick}
        />
      </MapContainer>

      {/* Dark map tile CSS filter */}
      <style>{`
        .dark-tiles { filter: ${tileFilter}; }
      `}</style>
    </>
  )
}
