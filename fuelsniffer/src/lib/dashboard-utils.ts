import type { PriceResult } from '@/lib/db/queries/prices'

const STALE_THRESHOLD_MS = 60 * 60 * 1000  // 60 minutes

export function isStale(recordedAt: Date): boolean {
  return Date.now() - new Date(recordedAt).getTime() > STALE_THRESHOLD_MS
}

export type SortMode = 'price' | 'distance'

export function sortStations(stations: PriceResult[], sort: SortMode): PriceResult[] {
  return [...stations].sort((a, b) => {
    if (sort === 'distance') {
      return a.distance_km - b.distance_km
    }
    return parseFloat(a.price_cents) - parseFloat(b.price_cents)
  })
}
