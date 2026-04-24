'use client'
/**
 * SlotTrueCost — reserved true-cost line placeholder.
 *
 * SP-3: reserves a 1-line space in StationCard so layout is stable.
 *       In popup/detail this collapses (display:none) to avoid empty space.
 * SP-6: replaces this component's content with "Pay X¢ · saves Y¢" line.
 *
 * Per spec §6.6 / §11 Q15: reserve space in card, collapse in popup/detail.
 */
import type { PriceResult } from '@/lib/db/queries/prices'

interface SlotTrueCostProps {
  station: PriceResult
  /**
   * 'card'   → reserve 1-line height so StationCard doesn't shift when SP-6 lands
   * 'popup'  → collapse (display:none) — popup layout shifts are acceptable
   * 'detail' → collapse (display:none)
   */
  context?: 'card' | 'popup' | 'detail'
  // SP-6 will add: trueCost: TrueCostResult | null
}

export function SlotTrueCost({ station: _station, context = 'card' }: SlotTrueCostProps) {
  if (context !== 'card') return null

  // SP-3: reserve layout footprint only
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
