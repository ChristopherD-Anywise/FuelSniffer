'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'
import { FUEL_TYPES } from '@/components/FuelSelect'
import { SlotVerdict, SlotTrueCost, SlotShareButton, SlotAlertButton } from '@/components/slots'

const PriceChart = dynamic(() => import('@/components/PriceChart'), { ssr: false })

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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--color-price-up)', fontSize: 14, fontWeight: 600 }}>
        ▲ {Math.abs(change).toFixed(1)}¢
      </span>
    )
  }
  if (change < 0) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--color-price-down)', fontSize: 14, fontWeight: 600 }}>
        ▼ {Math.abs(change).toFixed(1)}¢
      </span>
    )
  }
  return (
    <span style={{ color: 'var(--color-text-subtle)', fontSize: 14 }}>
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

  const domain: [number, number] = data.length > 0
    ? [Math.floor(Math.min(...data.map(d => d.min)) - 2), Math.ceil(Math.max(...data.map(d => d.max)) + 2)]
    : [0, 300]

  const nearby = allStations
    .filter(s => s.id !== station.id)
    .map(s => ({
      ...s,
      dist: approxDistKm(lat, lng, s.latitude, s.longitude),
    }))
    .filter(s => s.dist <= 2)
    .sort((a, b) => parseFloat(a.price_cents) - parseFloat(b.price_cents))
    .slice(0, 3)

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — desktop: right side, mobile: bottom sheet */}
      <aside
        aria-label={`Station details: ${station.name}`}
        style={{
          position: 'fixed',
          zIndex: 50,
          background: 'var(--color-bg)',
          overflowY: 'auto',
          // Mobile: bottom sheet
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: '85vh',
          borderRadius: '16px 16px 0 0',
          boxShadow: 'var(--shadow-md)',
        }}
        className="md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:top-0 md:w-[400px] md:max-h-none md:rounded-none md:border-l"
      >
        {/* Mobile grab handle */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 0 4px',
        }} className="md:hidden">
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: 'var(--color-border)',
          }} />
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          {/* Header */}
          <div style={{ position: 'relative', marginBottom: 20 }}>
            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close station detail"
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-subtle)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* SP-4 verdict slot */}
            <div style={{ marginBottom: 8 }}>
              <SlotVerdict station={station} />
            </div>

            {/* Hero price */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 48, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text)', lineHeight: 1 }}>
                {price.toFixed(1)}
              </span>
              <span style={{ fontSize: 18, color: 'var(--color-text-subtle)', fontWeight: 500, marginBottom: 6 }}>c/L</span>
            </div>

            {/* SP-6 true-cost slot */}
            <SlotTrueCost station={station} context="detail" />

            {/* 24h change + time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <PriceChangeIndicator change={station.price_change} />
              <span style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>{ago}</span>
            </div>

            {/* Action buttons row (SP-5, SP-8 stubs) */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <SlotAlertButton station={station} disabled />
              <SlotShareButton station={station} disabled />
            </div>

            {/* Station name + brand */}
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>{station.name}</div>
            {station.brand && (
              <div style={{ fontSize: 14, color: 'var(--color-text-subtle)', marginTop: 2 }}>{station.brand}</div>
            )}

            {/* Address + distance */}
            <div style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginTop: 4 }}>
              {addr}
              {station.distance_km != null && (
                <span> · {station.distance_km.toFixed(1)} km</span>
              )}
            </div>
          </div>

          {/* Fuel Type Tabs */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FUEL_TYPES.map(fuel => (
                <button
                  key={fuel.id}
                  onClick={() => onFuelChange(fuel.id)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: `1px solid ${fuel.id === fuelId ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: fuel.id === fuelId ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                    color: fuel.id === fuelId ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                    transition: 'all var(--motion-fast)',
                  }}
                >
                  {fuel.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price History Chart */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Price History</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {([24, 72, 168, 720, 2160] as const).map(h => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    style={{
                      padding: '2px 10px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: `1px solid ${hours === h ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: hours === h ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                      color: hours === h ? 'var(--color-accent-fg)' : 'var(--color-text-subtle)',
                    }}
                  >
                    {h === 24 ? '24h' : h === 72 ? '3d' : h === 168 ? '7d' : h === 720 ? '30d' : '90d'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--color-text-subtle)' }}>
                Loading...
              </div>
            ) : data.length === 0 ? (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--color-text-subtle)' }}>
                Not enough history yet
              </div>
            ) : (
              <PriceChart data={data} stationId={station.id} domain={domain} width={352} height={160} />
            )}
          </div>

          {/* Nearby Alternatives */}
          {nearby.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12, marginTop: 0 }}>Nearby Alternatives</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nearby.map(s => {
                  const sPrice = parseFloat(s.price_cents)
                  return (
                    <div key={s.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: 'var(--color-bg-elevated)',
                      borderRadius: 'var(--radius-md)',
                    }}>
                      <span style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text)' }}>
                        {sPrice.toFixed(1)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>{s.dist.toFixed(1)}km away</div>
                      </div>
                      {/* SP-4 verdict mini-chip slot */}
                      <SlotVerdict station={s} />
                      {sPrice < price ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-price-down)', flexShrink: 0 }}>
                          {(price - sPrice).toFixed(1)}¢ cheaper
                        </span>
                      ) : sPrice > price ? (
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-subtle)', flexShrink: 0 }}>
                          +{(sPrice - price).toFixed(1)}¢
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 0',
                background: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
                borderRadius: 'var(--radius-lg)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Google Maps
            </a>
            <a
              href={appleUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 0',
                background: 'var(--color-bg-elevated)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Apple Maps
            </a>
          </div>
        </div>
      </aside>
    </>
  )
}
