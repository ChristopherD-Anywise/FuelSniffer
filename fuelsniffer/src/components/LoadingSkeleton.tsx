export default function LoadingSkeleton() {
  return (
    <div style={{ background: '#111111' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderBottom: '1px solid #1a1a1a',
            minHeight: '64px',
          }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 6, background: '#1a1a1a' }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: '60%', height: 14, background: '#1a1a1a', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ width: '40%', height: 11, background: '#1a1a1a', borderRadius: 4 }} />
          </div>
          <div style={{ width: 56, height: 24, background: '#1a1a1a', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
