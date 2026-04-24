import Link from 'next/link'

export default function TripDisabled() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ minHeight: '100dvh', background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <div style={{ background: 'var(--color-bg)', borderBottom: '3px solid var(--color-accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: '52px' }}>
          <Link href="/dashboard" style={{ color: 'var(--color-text-subtle)', textDecoration: 'none', fontSize: '13px' }}>
            ← Back
          </Link>
          <span style={{ color: 'var(--color-border)', margin: '0 12px' }}>|</span>
          <span style={{ fontSize: '16px', fontWeight: 900, color: 'var(--color-text)' }}>
            FILLIP<span style={{ color: 'var(--color-accent)' }}>.</span>
            <span style={{ color: 'var(--color-text-subtle)', fontWeight: 600, fontSize: '14px' }}> · Trip Planner</span>
          </span>
        </div>
      </div>
      <div style={{ maxWidth: 680, margin: '48px auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12, color: 'var(--color-text)' }}>
          Trip planner requires Mapbox configuration
        </h1>
        <p style={{ color: 'var(--color-text-subtle)', lineHeight: 1.5, marginBottom: 16 }}>
          This feature needs a <code style={{ background: 'var(--color-bg-elevated)', padding: '2px 6px', borderRadius: 4, color: 'var(--color-text)' }}>MAPBOX_TOKEN</code> environment variable to
          look up addresses and calculate routes. Once configured, the trip planner will be available.
        </p>
        <p style={{ color: 'var(--color-text-subtle)', lineHeight: 1.5 }}>
          See <code style={{ background: 'var(--color-bg-elevated)', padding: '2px 6px', borderRadius: 4, color: 'var(--color-text)' }}>docs/setup/mapbox-token.md</code> for setup instructions.
        </p>
      </div>
    </main>
  )
}
