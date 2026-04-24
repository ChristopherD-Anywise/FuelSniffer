'use client'
/**
 * SlotVerdict — reserved verdict chip placeholder.
 *
 * SP-3: renders an empty footprint (56×22 pill) so the layout is stable.
 * SP-4: replaces this component's content with the actual verdict chip.
 *
 * Props contract is intentionally broad so SP-4 can add more without
 * breaking callers that only pass `station`.
 */
import type { PriceResult } from '@/lib/db/queries/prices'

interface SlotVerdictProps {
  station: PriceResult
  // SP-4 will add: verdict: VerdictResult | null
}

export function SlotVerdict({ station: _station }: SlotVerdictProps) {
  // SP-3: reserve layout footprint only — content is null until SP-4
  return (
    <div
      data-slot="verdict"
      aria-hidden="true"
      style={{
        minWidth: 56,
        minHeight: 22,
        display: 'inline-block',
      }}
    />
  )
}
