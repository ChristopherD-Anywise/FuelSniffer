'use client'
/**
 * PriceChart — Recharts area chart for station price history.
 *
 * This component is dynamically imported in StationPopup and StationDetail
 * so Recharts (~110kB gzipped) is not included in the initial JS bundle.
 * It only loads when a popup or detail panel opens.
 */
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { format } from 'date-fns'

interface ChartPoint {
  time: number
  label: string
  avg: number
}

interface PriceChartProps {
  data: ChartPoint[]
  stationId: number
  domain: [number, number]
  width?: number
  height?: number
}

export default function PriceChart({ data, stationId, domain, width = 292, height = 120 }: PriceChartProps) {
  return (
    <AreaChart width={width} height={height} data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
      <defs>
        <linearGradient id={`pg-${stationId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor="var(--color-accent)" stopOpacity={0.25} />
          <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 10, fill: 'var(--color-text-subtle)' }}
        tickLine={false}
        axisLine={false}
        interval="preserveStartEnd"
      />
      <YAxis
        domain={domain}
        tick={{ fontSize: 10, fill: 'var(--color-text-subtle)' }}
        tickLine={false}
        axisLine={false}
        tickFormatter={v => `${v}¢`}
      />
      <Tooltip content={({ active, payload }) => {
        if (!active || !payload?.length) return null
        const d = payload[0].payload as ChartPoint
        return (
          <div style={{
            background: 'var(--color-popup-bg)',
            border: '1px solid var(--color-popup-border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{format(new Date(d.time), 'EEE d MMM, HH:mm')}</div>
            <div style={{ color: 'var(--color-accent)', marginTop: 2 }}>{d.avg.toFixed(1)}¢/L</div>
          </div>
        )
      }} />
      <Area
        type="monotone"
        dataKey="avg"
        stroke="var(--color-accent)"
        strokeWidth={2}
        fill={`url(#pg-${stationId})`}
        dot={false}
        activeDot={{ r: 3, strokeWidth: 2, fill: 'var(--color-bg)', stroke: 'var(--color-accent)' }}
      />
    </AreaChart>
  )
}
