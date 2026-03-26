'use client'

import { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'

interface ChartPoint {
  time: number
  label: string
  avg: number
  min: number
  max: number
}

interface StationPopupProps {
  station: PriceResult
  fuelId: string
}

export default function StationPopup({ station, fuelId }: StationPopupProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(168)

  const price = parseFloat(station.price_cents)
  const color = price < 250 ? '#10b981' : price < 270 ? '#f59e0b' : '#ef4444'
  const addr = [station.address, station.suburb].filter(Boolean).join(', ')
  const lat = station.latitude
  const lng = station.longitude
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  const appleUrl = `https://maps.apple.com/?daddr=${lat},${lng}`
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'

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

  const domain = data.length > 0
    ? [Math.floor(Math.min(...data.map(d => d.min)) - 2), Math.ceil(Math.max(...data.map(d => d.max)) + 2)]
    : [0, 300]

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', width: 320 }}>
      {/* Price + station info */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{price.toFixed(1)}</span>
        <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>c/L</span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{ago}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{station.name}</div>
      {station.brand && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{station.brand}</div>
      )}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{addr}</div>

      {/* Time range pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[24, 72, 168].map(h => (
          <button
            key={h}
            onClick={() => setHours(h)}
            style={{
              padding: '3px 10px',
              borderRadius: 12,
              border: 'none',
              fontSize: 11,
              fontWeight: hours === h ? 700 : 500,
              background: hours === h ? '#0ea5e9' : '#f1f5f9',
              color: hours === h ? 'white' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {h === 24 ? '24h' : h === 72 ? '3d' : '7d'}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ height: 140, marginBottom: 8 }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8' }}>
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8' }}>
            Not enough history yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={`pg-${station.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={domain}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}¢`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as ChartPoint
                  return (
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{format(new Date(d.time), 'EEE d MMM, HH:mm')}</div>
                      <div style={{ color: '#0ea5e9', marginTop: 2 }}>{d.avg.toFixed(1)}¢/L</div>
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="avg"
                stroke="#0ea5e9"
                strokeWidth={2}
                fill={`url(#pg-${station.id})`}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#0ea5e9' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Navigation buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <a href={googleUrl} target="_blank" rel="noopener"
           style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0',
                    background: '#0ea5e9', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    textDecoration: 'none' }}>
          Google Maps
        </a>
        <a href={appleUrl} target="_blank" rel="noopener"
           style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0',
                    background: '#1e293b', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    textDecoration: 'none' }}>
          Apple Maps
        </a>
      </div>
    </div>
  )
}
