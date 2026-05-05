import Link from 'next/link'

export default function TripDisabled() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ minHeight: '100dvh', background: '#111111', color: '#ffffff' }}
    >
      <div style={{ background: '#111111', borderBottom: '3px solid #f59e0b' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: '52px' }}>
          <Link href="/dashboard" style={{ color: '#8a8a8a', textDecoration: 'none', fontSize: '13px' }}>
            ← Back
          </Link>
          <span style={{ color: '#2a2a2a', margin: '0 12px' }}>|</span>
          <span style={{ fontSize: '16px', fontWeight: 900 }}>
            FUEL<span style={{ color: '#f59e0b' }}>SNIFFER</span>
            <span style={{ color: '#8a8a8a', fontWeight: 600, fontSize: '14px' }}> · Trip Planner</span>
          </span>
        </div>
      </div>
      <div style={{ maxWidth: 680, margin: '48px auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>
          Trip planner requires Mapbox configuration
        </h1>
        <p style={{ color: '#8a8a8a', lineHeight: 1.5, marginBottom: 16 }}>
          This feature needs a <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>MAPBOX_TOKEN</code> environment variable to
          look up addresses and calculate routes. Once configured, the trip planner will be available.
        </p>
        <p style={{ color: '#8a8a8a', lineHeight: 1.5 }}>
          See <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>docs/setup/mapbox-token.md</code> for setup instructions.
        </p>
      </div>
    </main>
  )
}
