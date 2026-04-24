/**
 * SP-4 Cycle Engine — tunable constants (Phase A, rule-v1).
 *
 * All defaults live here so they are overridable per-environment for tests.
 * Phase B: add 'forecast-v1' to ALGO_PRIORITY to prefer it over rule-v1.
 */

export interface CycleConfig {
  /** Days of lookback for the rolling window. Default: 14 (one full QLD cycle). */
  LOOKBACK_DAYS: number
  /** Trailing window for smoothing daily medians. Default: 3. */
  SMOOTH_WINDOW: number
  /** Bottom fraction of range that counts as trough-adjacent. Default: 0.15. */
  TROUGH_BAND: number
  /** Top fraction of range that counts as peak-adjacent. Default: 0.85. */
  PEAK_BAND: number
  /** Min gap between cheapest station and suburb median to fire FILL_NOW. Default: 0.03 (3%). */
  GAP_PCT_FOR_FILL: number
  /** Within ±N cents/L over 3 days = flat slope. Default: 0.5. */
  SLOPE_FLAT_CENTS: number
  /** ≥N cents/L rise over 3 days = clearly climbing. Default: 2.0. */
  SLOPE_RISING_CENTS: number
  /** <N cents/L range over lookback window = flat market → HOLD. Default: 4.0. */
  MIN_RANGE_CENTS: number
  /** Minimum average distinct stations per day to avoid UNCERTAIN. Default: 3. */
  MIN_STATIONS: number
  /** Minimum days with data out of LOOKBACK_DAYS to avoid UNCERTAIN. Default: 10. */
  MIN_DAYS_WITH_DATA: number
}

export const DEFAULT_CONFIG: CycleConfig = {
  LOOKBACK_DAYS:       14,
  SMOOTH_WINDOW:        3,
  TROUGH_BAND:          0.15,
  PEAK_BAND:            0.85,
  GAP_PCT_FOR_FILL:     0.03,
  SLOPE_FLAT_CENTS:     0.5,
  SLOPE_RISING_CENTS:   2.0,
  MIN_RANGE_CENTS:      4.0,
  MIN_STATIONS:         3,
  MIN_DAYS_WITH_DATA:  10,
}

/**
 * Algo version priority — higher index = higher priority.
 * The query layer uses this to prefer forecast-v1 over rule-v1 when both exist.
 * Phase B: append 'forecast-v1' to this array.
 */
export const ALGO_PRIORITY: string[] = ['rule-v1', 'forecast-v1']

export const CURRENT_ALGO_VERSION = 'rule-v1'
