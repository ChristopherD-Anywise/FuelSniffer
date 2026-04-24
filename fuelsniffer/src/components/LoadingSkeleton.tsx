export default function LoadingSkeleton() {
  return (
    <div style={{ background: 'var(--color-bg)' }} aria-busy="true" aria-label="Loading stations">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderBottom: '1px solid var(--color-bg-elevated)',
            minHeight: '72px',
          }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--color-bg-elevated)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: '60%', height: 14, background: 'var(--color-bg-elevated)', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ width: '40%', height: 11, background: 'var(--color-bg-elevated)', borderRadius: 4 }} />
          </div>
          <div style={{ width: 56, height: 24, background: 'var(--color-bg-elevated)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
