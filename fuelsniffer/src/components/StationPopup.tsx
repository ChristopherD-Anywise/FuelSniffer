'use client'

import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'

interface ChartPoint {
  time: number
  label: string
  avg: number
}

const TIME_RANGES = [
  { hours: 24,  label: '24h' },
  { hours: 72,  label: '3d' },
  { hours: 168, label: '7d' },
] as const

interface StationPopupProps {
  station: PriceResult
  fuelId: string
}

const DEV_PLACEHOLDER = process.env.NODE_ENV === 'development'

function PopupAdBanner() {
  const pushed = useRef(false)
  useEffect(() => {
    if (DEV_PLACEHOLDER || pushed.current) return
    pushed.current = true
    try {
      // @ts-expect-error — adsbygoogle injected by script tag
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense not loaded
    }
  }, [])

  if (DEV_PLACEHOLDER) {
    return (
      <div style={{ margin: '10px 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: '300px', height: '50px',
          background: '#2a2a2a', border: '1px dashed #f59e0b', borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: '#f59e0b',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          Ad · 300×50
        </div>
      </div>
    )
  }

  return (
    <div style={{ margin: '10px 0', display: 'flex', justifyContent: 'center' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '300px', height: '50px' }}
        data-ad-client="ca-pub-REPLACE_WITH_YOUR_PUBLISHER_ID"
        data-ad-slot="REPLACE_WITH_YOUR_AD_SLOT_ID_2"
        data-ad-format="banner"
        data-full-width-responsive="false"
      />
    </div>
  )
}

export default function StationPopup({ station, fuelId }: StationPopupProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(168)

  const price = parseFloat(station.price_cents)
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'
  const addr = station.address || ''
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`
  const appleUrl  = `https://maps.apple.com/?daddr=${station.latitude},${station.longitude}`

  useEffect(() => {
    setLoading(true)
    fetch(`/api/prices/history?station=${station.id}&fuel=${fuelId}&hours=${hours}`)
      .then(r => r.json())
      .then((rows: Array<{ bucket: string; avg_price: string | number }>) => {
        setData(rows.map(r => ({
          time:  new Date(r.bucket).getTime(),
          label: format(new Date(r.bucket), 'EEE HH:mm'),
          avg:   Number(r.avg_price),
        })))
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [station.id, fuelId, hours])

  const domain: [number, number] = data.length > 0
    ? [Math.floor(Math.min(...data.map(d => d.avg)) - 2), Math.ceil(Math.max(...data.map(d => d.avg)) + 2)]
    : [0, 300]

  const periodChange = data.length >= 2 ? price - data[0].avg : null
  const periodLabel  = TIME_RANGES.find(t => t.hours === hours)?.label ?? '7d'

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', width: 300, padding: 4, color: '#ffffff' }}>
      {/* Price + time */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: '#ffffff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' } as React.CSSProperties}>{price.toFixed(1)}</span>
        <span style={{ fontSize: 14, color: '#555555', fontWeight: 500 }}>¢/L</span>
        <span style={{ fontSize: 12, color: '#555555', marginLeft: 'auto' }}>{ago}</span>
      </div>

      {/* Period change */}
      {periodChange !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 13, fontWeight: 600, marginBottom: 8,
          color: periodChange > 0 ? '#ef4444' : periodChange < 0 ? '#22c55e' : '#555555',
        }}>
          {periodChange !== 0 && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              {periodChange > 0
                ? <path d="M6 2L10 8H2L6 2Z" />
                : <path d="M6 10L2 4H10L6 10Z" />
              }
            </svg>
          )}
          <span>
            {periodChange === 0
              ? `No change / ${periodLabel}`
              : `${Math.abs(periodChange).toFixed(1)}¢ / ${periodLabel}`
            }
          </span>
        </div>
      )}

      {/* Station info */}
      <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', marginBottom: 1 }}>{station.name}</div>
      {station.brand && <div style={{ fontSize: 12, color: '#555555' }}>{station.brand}</div>}
      <div style={{ fontSize: 13, color: '#888888', marginBottom: 10 }}>{addr}</div>

      {/* Ad banner */}
      <PopupAdBanner />

      {/* Time range pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {TIME_RANGES.map(t => (
          <button
            key={t.hours}
            onClick={() => setHours(t.hours)}
            style={{
              padding: '3px 10px', borderRadius: 12,
              border: `1px solid ${hours === t.hours ? '#f59e0b' : '#2a2a2a'}`,
              background: hours === t.hours ? '#f59e0b' : '#1a1a1a',
              color: hours === t.hours ? '#000000' : '#555555',
              fontSize: 11, fontWeight: hours === t.hours ? 700 : 500, cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ marginBottom: 10 }}>
        {loading ? (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555555' }}>
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555555' }}>
            Not enough history yet
          </div>
        ) : (
          <AreaChart width={292} height={120} data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id={`pg-${station.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#555555' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={domain} tick={{ fontSize: 10, fill: '#555555' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}¢`} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as ChartPoint
              return (
                <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '6px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                  <div style={{ fontWeight: 600, color: '#ffffff' }}>{format(new Date(d.time), 'EEE d MMM, HH:mm')}</div>
                  <div style={{ color: '#f59e0b', marginTop: 2 }}>{d.avg.toFixed(1)}¢/L</div>
                </div>
              )
            }} />
            <Area
              type="monotone"
              dataKey="avg"
              stroke="#f59e0b"
              strokeWidth={2}
              fill={`url(#pg-${station.id})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 2, fill: '#111111', stroke: '#f59e0b' }}
            />
          </AreaChart>
        )}
      </div>

      {/* Nav buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <a href={googleUrl} target="_blank" rel="noopener"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0',
            background: '#f59e0b', color: '#000000', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Google Maps
        </a>
        <a href={appleUrl} target="_blank" rel="noopener"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0',
            background: '#1a1a1a', color: '#ffffff', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Apple Maps
        </a>
      </div>
    </div>
  )
}
