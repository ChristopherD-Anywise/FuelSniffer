/**
 * Offline fallback page.
 *
 * Served by the service worker when:
 * - Navigation request fails (no network), AND
 * - No cached shell page is available for the requested URL.
 *
 * This page itself is pre-cached by the service worker's app-shell strategy.
 */
export default function OfflinePage() {
  return (
    <main
      id="main-content"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '24px',
        textAlign: 'center',
        gap: '16px',
      }}
    >
      {/* Offline icon */}
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8, marginTop: 0 }}>
          You&apos;re offline
        </h1>
        <p style={{ color: 'var(--color-text-subtle)', lineHeight: 1.5, maxWidth: 320, margin: '0 auto 20px' }}>
          No internet connection. If you&apos;ve visited Fillip before, your last price data may still be available.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <a
          href="/dashboard"
          style={{
            padding: '10px 20px',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-fg)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Try dashboard
        </a>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    </main>
  )
}
