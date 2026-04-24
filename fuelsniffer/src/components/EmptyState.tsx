export default function EmptyState({ fuelLabel, radius }: { fuelLabel: string; radius: number }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      background: 'var(--color-bg)',
      color: 'var(--color-text-subtle)',
      height: '100%',
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }} aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6 }}>
        No stations found
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-subtle)', textAlign: 'center', maxWidth: 240 }}>
        No {fuelLabel} prices within {radius}km. Try increasing the radius.
      </div>
    </div>
  )
}
