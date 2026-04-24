/**
 * SP-4 Cycle Engine — stable type contracts (Phase A → B compatible).
 *
 * CycleSignalView is the wire shape consumed by UI components and SP-5 alerts.
 * The contract MUST NOT change when Phase B (forecast-v1) ships.
 */

export type SignalState = 'FILL_NOW' | 'HOLD' | 'WAIT_FOR_DROP' | 'UNCERTAIN'

/**
 * Supporting statistics stored in the cycle_signals.supporting JSONB column.
 * Consumers MUST tolerate unknown keys (Phase B will add forecast fields).
 */
export interface SupportingStats {
  windowMinCents:    number
  windowMaxCents:    number
  todayMedianCents:  number
  cheapestNowCents:  number
  cheapestStationId?: number
  positionInRange:   number
  slope3dCents:      number
  stationCountAvg:   number
  daysWithData:      number
  trigger?:          string   // which classification rule fired
  // Phase B will add: forecast7dCents, forecastCiLow, forecastCiHigh
  [key: string]: unknown
}

/**
 * Wire shape returned by query layer (getSignal, getSignalForStation).
 * Maps 1:1 to a cycle_signals row (camelCase).
 */
export interface CycleSignalView {
  state:        SignalState
  label:        string
  confidence:   number       // 0..1
  suburb:       string       // display name e.g. 'Chermside'
  suburbKey:    string       // canonical key e.g. 'chermside|qld'
  fuelTypeId:   number
  computedFor:  string       // ISO date YYYY-MM-DD
  computedAt:   string       // ISO timestamptz
  algoVersion:  string
  supporting:   SupportingStats
}

/**
 * Human-readable labels for each signal state.
 * SP-3 may override the copy; these are sensible defaults.
 */
export const SIGNAL_LABELS: Record<SignalState, string> = {
  FILL_NOW:      'Cycle low',
  HOLD:          'Hold steady',
  WAIT_FOR_DROP: 'Prices likely to fall',
  UNCERTAIN:     'Not enough data',
}
