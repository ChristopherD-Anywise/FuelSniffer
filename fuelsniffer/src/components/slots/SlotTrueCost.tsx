'use client'
/**
 * SlotTrueCost — SP-6 True-Cost price display.
 *
 * card context:
 *   - When a programme applies: shows "You pay {effective}¢ · {programme}" with
 *     struck-through pylon beneath the station name.
 *   - When no programme: reserves layout footprint (18px height) so the card
 *     height stays stable when switching between enrolled/unenrolled users.
 *
 * popup context:
 *   - Renders null (the popup has its own two-line price block).
 *
 * detail context:
 *   - Renders null.
 *
 * Disclaimer: "Discounts shown are typical; actual savings depend on programme terms."
 * Shown in tooltip on info icon click per spec §11.1 requirement.
 */

import { useState } from 'react'
import type { PriceResult } from '@/lib/db/queries/prices'

interface SlotTrueCostProps {
  station: PriceResult
  context?: 'card' | 'popup' | 'detail'
}

// Programme type → chip colour (background, text)
const CHIP_COLOURS: Record<string, { bg: string; text: string }> = {
  membership: { bg: '#f59e0b22', text: '#b45309' },
  docket:     { bg: '#10b98122', text: '#047857' },
  rewards:    { bg: '#6366f122', text: '#4338ca' },
}

function ProgrammeChip({ name }: { name: string }) {
  // Derive type from programme name is not possible here; use default colour
  const colour = CHIP_COLOURS.membership
  const truncated = name.length > 14 ? name.slice(0, 13) + '…' : name
  return (
    <span
      title={name}
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: '4px',
        background: colour.bg,
        color: colour.text,
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {truncated}
    </span>
  )
}

function InfoTooltip() {
  const [open, setOpen] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        aria-label="Discount disclaimer"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          cursor: 'pointer',
          color: 'var(--color-text-subtle)',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" fill="none"/>
          <text x="6" y="9" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">i</text>
        </svg>
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '11px',
            color: 'var(--color-text)',
            width: '220px',
            zIndex: 100,
            lineHeight: 1.4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          Discounts shown are typical; actual savings depend on programme terms.
        </div>
      )}
    </span>
  )
}

export function SlotTrueCost({ station, context = 'card' }: SlotTrueCostProps) {
  if (context !== 'card') return null

  const applied = station.applied_programme_id
  const programmeName = station.applied_programme_name
  const effectiveCents = station.effective_price_cents
  const pylonCents = parseFloat(station.price_cents)
  const discountCents = station.applied_discount_cents ?? 0

  // No programme applied — reserve layout footprint only
  if (!applied || !programmeName || effectiveCents === null || discountCents === 0) {
    return (
      <div
        data-slot="truecost"
        aria-hidden="true"
        style={{
          minHeight: 18,
          display: 'block',
        }}
      />
    )
  }

  return (
    <div
      data-slot="truecost"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        minHeight: 18,
        marginTop: '1px',
      }}
    >
      {/* Struck-through pylon */}
      <span
        style={{
          fontSize: '11px',
          color: 'var(--color-text-subtle)',
          textDecoration: 'line-through',
          fontVariantNumeric: 'tabular-nums',
        }}
        aria-label={`Pylon price ${pylonCents.toFixed(1)} cents`}
      >
        {pylonCents.toFixed(1)}¢
      </span>

      {/* Savings label */}
      <span style={{ fontSize: '11px', color: 'var(--color-price-down)', fontWeight: 600 }}>
        −{discountCents}¢
      </span>

      {/* Programme chip */}
      <ProgrammeChip name={programmeName} />

      {/* Disclaimer info icon */}
      <InfoTooltip />
    </div>
  )
}
