/**
 * Share card layout for Satori.
 *
 * Pure JSX — no React hooks, no dynamic imports, no fragments (Satori limitation).
 * Every container div with multiple children must have display: flex.
 * Used by both the OG image route (Node runtime) and the weekly bot.
 *
 * Variants:
 * - 'default':          "I paid $1.74/L for U91 at Shell Chermside"
 * - 'weekly_postcode':  "Cheapest U91 postcode in AU last week: 4000 at $1.74 avg"
 *
 * Brand tokens from SP-3:
 * - Background: #111111 (--color-bg-primary)
 * - Accent:     #f59e0b (--color-accent)
 * - Text:       #f5f5f5 (--color-text-primary)
 * - Muted:      #737373 (--color-text-subtle)
 */
import React from 'react'

export interface CardProps {
  stationName: string
  brand: string | null
  priceCents: number        // e.g. 174 renders as "$1.74"
  fuelCode: string          // e.g. "U91"
  radiusKm?: number
  variant?: 'default' | 'weekly_postcode'
  postcodeLabel?: string    // used in weekly_postcode variant
}

export function ShareCard(props: CardProps): React.ReactElement {
  const { stationName, brand, priceCents, fuelCode, radiusKm, variant = 'default', postcodeLabel } = props
  const priceDisplay = `$${(priceCents / 100).toFixed(2)}`
  const isWeekly = variant === 'weekly_postcode'
  const locationLine = isWeekly
    ? (postcodeLabel ?? stationName)
    : `at ${brand ? `${brand} ` : ''}${stationName}`

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: '#111111',
        display: 'flex',
        flexDirection: 'column',
        padding: '48px 64px',
        fontFamily: 'Inter',
        color: '#f5f5f5',
      }}
    >
      {/* Header: wordmark */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            background: '#f59e0b',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            fontWeight: 800,
            color: '#111111',
          }}
        >
          F
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#f5f5f5',
            letterSpacing: '-0.02em',
            display: 'flex',
          }}
        >
          Fillip
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56, flex: 1 }}>
        {/* Eyebrow text */}
        <div style={{ display: 'flex', fontSize: 22, color: '#a3a3a3', marginBottom: 12 }}>
          {isWeekly ? `Cheapest ${fuelCode} postcode in AU last week` : 'I paid'}
        </div>

        {/* Price hero */}
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontWeight: 800,
            color: '#f59e0b',
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          {priceDisplay}
        </div>

        {/* Fuel type */}
        <div style={{ display: 'flex', fontSize: 30, color: '#d4d4d4', marginTop: 10 }}>
          {`/L for ${fuelCode}`}
        </div>

        {/* Station / postcode info */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 36, gap: 6 }}>
          <div style={{ display: 'flex', fontSize: 26, color: '#f5f5f5' }}>
            {locationLine}
          </div>
          {!isWeekly && radiusKm ? (
            <div style={{ display: 'flex', fontSize: 20, color: '#737373' }}>
              {`Cheapest within ${radiusKm} km`}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #262626',
          paddingTop: 20,
        }}
      >
        <div style={{ display: 'flex', fontSize: 18, color: '#737373' }}>
          fillip.com.au · know before you fill
        </div>
        <div style={{ display: 'flex', fontSize: 14, color: '#404040' }}>v1</div>
      </div>
    </div>
  )
}
