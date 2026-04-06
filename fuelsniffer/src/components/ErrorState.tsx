'use client'

export default function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      background: '#111111',
      height: '100%',
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
        Failed to load prices
      </div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 12,
          padding: '10px 24px',
          background: '#f59e0b',
          color: '#000000',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
