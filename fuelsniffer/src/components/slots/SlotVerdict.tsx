'use client'
/**
 * SlotVerdict — verdict chip for the cycle engine (SP-4).
 *
 * SP-3: reserved 56×22 pill footprint.
 * SP-4: renders actual FILL_NOW / WAIT_FOR_DROP pill when verdict data is provided.
 *
 * Renders nothing visible for HOLD, UNCERTAIN, or missing verdict (preserves footprint).
 * Accessible: uses role="status" and aria-label when content is shown.
 */
import type { PriceResult } from '@/lib/db/queries/prices'
import type { CycleSignalView } from '@/lib/cycle/types'

interface SlotVerdictProps {
  station: PriceResult
  verdict?: CycleSignalView | null
}

interface PillStyle {
  background: string
  color: string
  text: string
  ariaLabel: string
}

function getPillStyle(state: CycleSignalView['state']): PillStyle | null {
  switch (state) {
    case 'FILL_NOW':
      return {
        background: 'var(--color-price-down, #16a34a)',
        color:      '#ffffff',
        text:       'FILL NOW',
        ariaLabel:  'Fill now — suburb at cycle low',
      }
    case 'WAIT_FOR_DROP':
      return {
        background: 'var(--color-price-up, #ea580c)',
        color:      '#ffffff',
        text:       'WAIT',
        ariaLabel:  'Wait if possible — suburb near cycle peak',
      }
    case 'HOLD':
    case 'UNCERTAIN':
    default:
      return null
  }
}

export function SlotVerdict({ station: _station, verdict }: SlotVerdictProps) {
  const pill = verdict ? getPillStyle(verdict.state) : null

  // No verdict or neutral state — preserve layout footprint only
  if (!pill) {
    return (
      <div
        data-slot="verdict"
        aria-hidden="true"
        style={{
          minWidth:    56,
          minHeight:   22,
          display:     'inline-block',
        }}
      />
    )
  }

  // Render the verdict chip
  return (
    <div
      data-slot="verdict"
      role="status"
      aria-label={pill.ariaLabel}
      title={`${verdict!.label} — ${verdict!.suburb} (confidence ${(verdict!.confidence * 100).toFixed(0)}%)`}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        minWidth:        56,
        minHeight:       22,
        borderRadius:   '11px',
        background:      pill.background,
        color:           pill.color,
        fontSize:       '10px',
        fontWeight:      700,
        letterSpacing:  '0.05em',
        padding:        '0 8px',
        userSelect:     'none',
        whiteSpace:     'nowrap',
      }}
    >
      {pill.text}
    </div>
  )
}
