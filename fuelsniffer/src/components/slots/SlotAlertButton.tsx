'use client'
/**
 * SlotAlertButton — reserved alert button stub.
 *
 * SP-3: renders a disabled bell icon button so the layout includes
 *       the button position. SP-5 wires the actual alert creation flow.
 */
import type { PriceResult } from '@/lib/db/queries/prices'

interface SlotAlertButtonProps {
  station: PriceResult
  disabled?: boolean
  // SP-5 will add: onCreateAlert: (station: PriceResult) => void
}

export function SlotAlertButton({ station: _station, disabled = true }: SlotAlertButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Create price alert (coming soon)"
      data-slot="alert"
      style={{
        background: 'none',
        border: 'none',
        padding: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        color: 'var(--color-text-subtle)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        minWidth: 28,
        minHeight: 28,
      }}
    >
      {/* Bell icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    </button>
  )
}
