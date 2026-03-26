'use client'

import { useState, useEffect } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'
import { FUEL_TYPES } from '@/components/FuelSelect'

interface ChartPoint {
  time: number
  label: string
  avg: number
  min: number
  max: number
}

interface StationDetailProps {
  station: PriceResult
  fuelId: string
  allStations: PriceResult[]
  onClose: () => void
  onFuelChange: (fuelId: string) => void
}

function approxDistKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111.32
  const dLng = (lng2 - lng1) * 111.32 * Math.cos(lat1 * Math.PI / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

function PriceChangeIndicator({ change }: { change: number | null }) {
  if (change === null || change === undefined) return null

  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-500 text-sm font-semibold">
        ▲ {Math.abs(change).toFixed(1)}¢
      </span>
    )
  }
  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 text-sm font-semibold">
        ▼ {Math.abs(change).toFixed(1)}¢
      </span>
    )
  }
  return (
    <span className="text-slate-400 text-sm">
      — 0¢
    </span>
  )
}

export default function StationDetail({
  station,
  fuelId,
  allStations,
  onClose,
  onFuelChange,
}: StationDetailProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(24)

  const price = parseFloat(station.price_cents)
  const addr = [station.address, station.suburb].filter(Boolean).join(', ')
  const lat = station.latitude
  const lng = station.longitude
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  const appleUrl = `https://maps.apple.com/?daddr=${lat},${lng}`
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'

  // Fetch chart data
  useEffect(() => {
    setLoading(true)
    fetch(`/api/prices/history?station=${station.id}&fuel=${fuelId}&hours=${hours}`)
      .then(r => r.json())
      .then((rows: Array<{ bucket: string; avg_price: string | number; min_price: string | number; max_price: string | number }>) => {
        setData(
          rows.map(r => ({
            time: new Date(r.bucket).getTime(),
            label: format(new Date(r.bucket), 'EEE HH:mm'),
            avg: Number(r.avg_price),
            min: Number(r.min_price),
            max: Number(r.max_price),
          }))
        )
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [station.id, fuelId, hours])

  // Compute chart Y domain
  const domain = data.length > 0
    ? [Math.floor(Math.min(...data.map(d => d.min)) - 2), Math.ceil(Math.max(...data.map(d => d.max)) + 2)]
    : [0, 300]

  // Nearby alternatives within 2km
  const nearby = allStations
    .filter(s => s.id !== station.id)
    .map(s => ({
      ...s,
      dist: approxDistKm(lat, lng, s.latitude, s.longitude),
    }))
    .filter(s => s.dist <= 2)
    .sort((a, b) => parseFloat(a.price_cents) - parseFloat(b.price_cents))
    .slice(0, 3)

  const stationDist = station.distance_km

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — desktop: right side panel, mobile: bottom sheet */}
      <div
        className={[
          'fixed z-50 bg-white overflow-y-auto',
          // Mobile
          'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl shadow-xl detail-panel-mobile',
          // Desktop
          'md:inset-x-auto md:right-0 md:top-0 md:bottom-0 md:max-h-none md:w-[400px] md:rounded-none md:shadow-xl md:border-l md:border-slate-200 md:detail-panel-desktop',
        ].join(' ')}
      >
        <div className="p-6">
          {/* ── Header ── */}
          <div className="relative mb-6">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute -top-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Hero price */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-extrabold tabular-nums text-slate-900 leading-none">
                {price.toFixed(1)}
              </span>
              <span className="text-lg text-slate-400 font-medium">c/L</span>
            </div>

            {/* 24h change */}
            <div className="mb-3">
              <PriceChangeIndicator change={station.price_change_24h} />
              <span className="text-xs text-slate-400 ml-2">{ago}</span>
            </div>

            {/* Station name + brand */}
            <div className="text-lg font-bold text-slate-900">{station.name}</div>
            {station.brand && (
              <div className="text-sm text-slate-400 mt-0.5">{station.brand}</div>
            )}

            {/* Address + distance */}
            <div className="text-sm text-slate-500 mt-1">
              {addr}
              {station.distance_km != null && (
                <span className="text-slate-400"> · {station.distance_km.toFixed(1)} km</span>
              )}
            </div>
          </div>

          {/* ── Fuel Type Tabs ── */}
          <div className="mb-6">
            <div className="flex flex-wrap gap-1.5">
              {FUEL_TYPES.map(fuel => (
                <button
                  key={fuel.id}
                  onClick={() => onFuelChange(fuel.id)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    fuel.id === fuelId
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {fuel.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Price History Chart ── */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Price History</h3>
              <div className="flex gap-1">
                {([24, 72, 168, 720, 2160] as const).map(h => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    className={[
                      'px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors',
                      hours === h
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    {h === 24 ? '24h' : h === 72 ? '3d' : h === 168 ? '7d' : h === 720 ? '30d' : '90d'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="h-[160px] flex items-center justify-center text-sm text-slate-400">
                Loading...
              </div>
            ) : data.length === 0 ? (
              <div className="h-[160px] flex items-center justify-center text-sm text-slate-400">
                Not enough history yet
              </div>
            ) : (
              <>
                {/* Desktop: fixed 360px, Mobile: full width */}
                <div className="hidden md:block">
                  <AreaChart width={360} height={160} data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id={`detail-grad-${station.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={domain} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}¢`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload as ChartPoint
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-lg">
                            <div className="font-semibold text-slate-700">{format(new Date(d.time), 'EEE d MMM, HH:mm')}</div>
                            <div className="text-sky-500 mt-0.5">{d.avg.toFixed(1)}¢/L</div>
                          </div>
                        )
                      }}
                    />
                    <Area type="monotone" dataKey="avg" stroke="#0ea5e9" strokeWidth={2} fill={`url(#detail-grad-${station.id})`} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#0ea5e9' }} />
                  </AreaChart>
                </div>
                <div className="md:hidden">
                  <AreaChart width={Math.min(window.innerWidth - 48, 600)} height={160} data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id={`detail-grad-m-${station.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={domain} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}¢`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload as ChartPoint
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-lg">
                            <div className="font-semibold text-slate-700">{format(new Date(d.time), 'EEE d MMM, HH:mm')}</div>
                            <div className="text-sky-500 mt-0.5">{d.avg.toFixed(1)}¢/L</div>
                          </div>
                        )
                      }}
                    />
                    <Area type="monotone" dataKey="avg" stroke="#0ea5e9" strokeWidth={2} fill={`url(#detail-grad-m-${station.id})`} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#0ea5e9' }} />
                  </AreaChart>
                </div>
              </>
            )}
          </div>

          {/* ── Nearby Alternatives ── */}
          {nearby.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Nearby Alternatives</h3>
              <div className="space-y-2">
                {nearby.map(s => {
                  const sPrice = parseFloat(s.price_cents)
                  const distDelta = s.dist
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <span className="text-lg font-extrabold tabular-nums text-slate-900">
                        {sPrice.toFixed(1)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{s.name}</div>
                        <div className="text-xs text-slate-400">{distDelta.toFixed(1)}km away</div>
                      </div>
                      {sPrice < price ? (
                        <span className="text-xs font-semibold text-emerald-600">
                          {(price - sPrice).toFixed(1)}¢ cheaper
                        </span>
                      ) : sPrice > price ? (
                        <span className="text-xs font-medium text-slate-400">
                          +{(sPrice - price).toFixed(1)}¢
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Navigation Buttons ── */}
          <div className="flex gap-3">
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Google Maps
            </a>
            <a
              href={appleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Apple Maps
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
