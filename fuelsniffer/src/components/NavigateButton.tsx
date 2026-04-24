'use client'

import { buildGoogleMapsUrl, buildAppleMapsUrl } from '@/lib/trip/maps-deeplink'

interface Coord {
  lat: number
  lng: number
}

interface StationCoord extends Coord {
  name: string
}

interface NavigateButtonProps {
  start: Coord
  station: StationCoord
  end: Coord
}

function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)
}

export default function NavigateButton({ start, station, end }: NavigateButtonProps) {
  const apple = isApplePlatform()

  const primaryUrl  = apple ? buildAppleMapsUrl(start, station, end) : buildGoogleMapsUrl(start, station, end)
  const secondaryUrl = apple ? buildGoogleMapsUrl(start, station, end) : buildAppleMapsUrl(start, station, end)
  const primaryLabel  = apple ? 'Apple Maps' : 'Google Maps'
  const secondaryLabel = apple ? 'Google Maps' : 'Apple Maps'

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <a
        href={primaryUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: '36px',
          paddingLeft: '14px',
          paddingRight: '14px',
          borderRadius: '8px',
          background: 'var(--color-accent)',
          color: 'var(--color-accent-fg)',
          fontSize: '12px',
          fontWeight: 800,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
        aria-label={`Navigate to ${station.name} via ${primaryLabel}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="3 11 22 2 13 21 11 13 3 11"/>
        </svg>
        {primaryLabel}
      </a>

      <a
        href={secondaryUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: '36px',
          paddingLeft: '10px',
          paddingRight: '10px',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          background: 'transparent',
          color: 'var(--color-text-subtle)',
          fontSize: '11px',
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        aria-label={`Navigate to ${station.name} via ${secondaryLabel}`}
      >
        {secondaryLabel}
      </a>
    </div>
  )
}
