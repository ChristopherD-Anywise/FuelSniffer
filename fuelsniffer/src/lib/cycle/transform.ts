/**
 * SP-4 Cycle Engine — pure transformation helpers (no DB dependency).
 *
 * Extracted from compute.ts so they can be unit-tested without a DATABASE_URL.
 */

import type { DailyEntry } from './detector'

export interface SuburbSeriesRow {
  station_id:     number | string
  suburb_key:     string
  suburb_display: string
  state_code:     string
  day:            string          // 'YYYY-MM-DD'
  day_min:        number | string
  latest_price:   number | string
  is_today:       boolean | string
}

/**
 * Transform flat DB rows into DailyEntry[] expected by the detector.
 * Groups rows by day, collects per-station day-mins and latest prices.
 *
 * Note: suburb_key in rows is already lower()-ed by the SQL query.
 */
export function rowsToDailyEntries(rows: SuburbSeriesRow[]): DailyEntry[] {
  // Group by day
  const byDay = new Map<string, { stationMins: number[]; latestPrices: number[]; isToday: boolean }>()

  for (const row of rows) {
    const day = row.day
    const isToday = row.is_today === true || row.is_today === 't' || row.is_today === '1'
    if (!byDay.has(day)) {
      byDay.set(day, { stationMins: [], latestPrices: [], isToday })
    }
    const entry = byDay.get(day)!
    entry.stationMins.push(Number(row.day_min))
    entry.latestPrices.push(Number(row.latest_price))
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { stationMins, latestPrices, isToday }]) => ({
      date,
      stationMins,
      latestPrices: isToday ? latestPrices : undefined,
    }))
}
