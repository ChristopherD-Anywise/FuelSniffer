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
import { format } from 'date-fns'

interface HistoryPoint {
  bucket: string
  avg_price: number | string
  min_price: number | string
  max_price: number | string
}

interface ChartPoint {
  time: number
  label: string
  avg: number
  min: number
  max: number
}

interface PriceChartProps {
  stationId: number
  fuelId: string
  stationName: string
  onClose: () => void
}

export default function PriceChart({ stationId, fuelId, stationName, onClose }: PriceChartProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(168) // 7 days default

  useEffect(() => {
    setLoading(true)
    fetch(`/api/prices/history?station=${stationId}&fuel=${fuelId}&hours=${hours}`)
      .then(r => r.json())
      .then((rows: HistoryPoint[]) => {
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
  }, [stationId, fuelId, hours])

  const domain = data.length > 0
    ? [Math.floor(Math.min(...data.map(d => d.min)) - 2), Math.ceil(Math.max(...data.map(d => d.max)) + 2)]
    : [0, 300]

  return (
    <div className="bg-white border-t border-slate-200 shadow-inner">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800 truncate">{stationName}</h3>
          <p className="text-xs text-slate-400">Price history</p>
        </div>
        <div className="flex items-center gap-2">
          {[24, 72, 168].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                hours === h
                  ? 'bg-sky-100 text-sky-700 font-semibold'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              {h === 24 ? '24h' : h === 72 ? '3d' : '7d'}
            </button>
          ))}
          <button
            onClick={onClose}
            className="ml-2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close chart"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48 px-2 pb-3">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            Not enough data yet — check back after a few scrape cycles
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={domain}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}¢`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as ChartPoint
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                      <div className="font-semibold text-slate-700">{format(new Date(d.time), 'EEE d MMM, HH:mm')}</div>
                      <div className="text-sky-600 mt-1">Avg: {d.avg.toFixed(1)}¢/L</div>
                      {d.min !== d.max && (
                        <div className="text-slate-400">Range: {d.min.toFixed(1)} – {d.max.toFixed(1)}¢</div>
                      )}
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="avg"
                stroke="#0ea5e9"
                strokeWidth={2}
                fill="url(#priceGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#0ea5e9' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
