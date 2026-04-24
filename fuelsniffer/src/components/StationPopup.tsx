'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'
import { SlotVerdict, SlotTrueCost, SlotShareButton } from '@/components/slots'

const PriceChart = dynamic(() => import('@/components/PriceChart'), { ssr: false })

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
          background: 'var(--color-bg-elevated)',
          border: '1px dashed var(--color-accent)',
          borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)',
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
  // SP-6: Show effective price as headline when a programme applies; fall back to pylon.
  const displayPrice = (station.effective_price_cents != null && station.applied_discount_cents > 0)
    ? station.effective_price_cents
    : price
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
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', width: 300, padding: 4, color: 'var(--color-text)' }}>
      {/* Price row + slots */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 2 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' } as React.CSSProperties}>{displayPrice.toFixed(1)}</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-subtle)', fontWeight: 500 }}>¢/L</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-subtle)', marginLeft: 'auto' }}>{ago}</span>
          </div>
          {/* SP-6: Struck pylon + programme name when a discount applies */}
          {station.applied_programme_id && station.applied_discount_cents > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-subtle)', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                {price.toFixed(1)}¢
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-price-down)' }}>
                −{station.applied_discount_cents}¢
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-subtle)', fontWeight: 600 }}>
                {station.applied_programme_name}
              </span>
              <span
                title="Discounts shown are typical; actual savings depend on programme terms."
                style={{ cursor: 'help', color: 'var(--color-text-subtle)', display: 'inline-flex', alignItems: 'center' }}
                aria-label="Discount disclaimer"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" fill="none"/>
                  <text x="6" y="9" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">i</text>
                </svg>
              </span>
            </div>
          )}
          {/* SP-6 true-cost slot — collapses in popup context */}
          <SlotTrueCost station={station} context="popup" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
          {/* SP-4 verdict slot */}
          <SlotVerdict station={station} />
          {/* SP-8 share button slot */}
          <SlotShareButton station={station} disabled />
        </div>
      </div>

      {/* Period change */}
      {periodChange !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 13, fontWeight: 600, marginBottom: 8,
          color: periodChange > 0 ? 'var(--color-price-up)' : periodChange < 0 ? 'var(--color-price-down)' : 'var(--color-text-subtle)',
        }}>
          {periodChange !== 0 && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
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
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 1 }}>{station.name}</div>
      {station.brand && <div style={{ fontSize: 12, color: 'var(--color-text-subtle)' }}>{station.brand}</div>}
      <div style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginBottom: 10 }}>{addr}</div>

      {/* Time range pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {TIME_RANGES.map(t => (
          <button
            key={t.hours}
            onClick={() => setHours(t.hours)}
            style={{
              padding: '3px 10px', borderRadius: 12,
              border: `1px solid ${hours === t.hours ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: hours === t.hours ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: hours === t.hours ? 'var(--color-accent-fg)' : 'var(--color-text-subtle)',
              fontSize: 11, fontWeight: hours === t.hours ? 700 : 500, cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart — dynamically loaded Recharts (code-split) */}
      <div style={{ marginBottom: 10 }}>
        {loading ? (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-text-subtle)' }}>
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-text-subtle)' }}>
            Not enough history yet
          </div>
        ) : (
          <PriceChart data={data} stationId={station.id} domain={domain} />
        )}
      </div>

      {/* Ad banner — moved below chart per spec §6.3 */}
      <PopupAdBanner />

      {/* Nav buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <a href={googleUrl} target="_blank" rel="noopener"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0',
            background: 'var(--color-accent)', color: 'var(--color-accent-fg)', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Google Maps
        </a>
        <a href={appleUrl} target="_blank" rel="noopener"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0',
            background: 'var(--color-bg-elevated)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Apple Maps
        </a>
      </div>
    </div>
  )
}
