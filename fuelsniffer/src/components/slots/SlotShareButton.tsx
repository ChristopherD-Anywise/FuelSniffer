'use client'
/**
 * SlotShareButton — reserved share button stub.
 *
 * SP-3: renders a disabled share icon button so the layout includes
 *       the button position. SP-8 wires the actual share action.
 */
import type { PriceResult } from '@/lib/db/queries/prices'

interface SlotShareButtonProps {
  station: PriceResult
  disabled?: boolean
  // SP-8 will add: onShare: (station: PriceResult) => void
}

export function SlotShareButton({ station: _station, disabled = true }: SlotShareButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Share station (coming soon)"
      data-slot="share"
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
      {/* Share icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    </button>
  )
}
