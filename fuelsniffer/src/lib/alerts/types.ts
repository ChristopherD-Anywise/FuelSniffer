/**
 * SP-5 Alerts — shared TypeScript types.
 *
 * DB types come from schema.ts; these are the runtime/domain types
 * used across evaluators, dispatcher, and API routes.
 */

export type AlertType = 'price_threshold' | 'cycle_low' | 'favourite_drop' | 'weekly_digest'

export type DeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'suppressed_quiet_hours'
  | 'suppressed_rate_limit'
  | 'bounced'

export interface Alert {
  id: number
  userId: string
  type: AlertType
  criteriaJson: unknown
  channels: string[]
  paused: boolean
  createdAt: Date
  lastFiredAt: Date | null
  lastEvaluatedAt: Date | null
  label: string | null
}

export interface AlertDelivery {
  id: number
  alertId: number
  firedAt: Date
  channel: string
  payloadHash: string
  dedupKey: string
  status: DeliveryStatus
  providerMessageId: string | null
  error: string | null
  retryCount: number
}

export interface WebPushSubscription {
  id: number
  userId: string
  endpoint: string
  keysP256dh: string
  keysAuth: string
  ua: string | null
  createdAt: Date
  lastSeenAt: Date
  revokedAt: Date | null
}

/** A delivery candidate produced by an evaluator — not yet dispatched. */
export interface DeliveryCandidate {
  alert: Alert
  dedupKey: string
  payloadData: Record<string, unknown>
  /** Station or context info for template rendering */
  context: AlertRenderContext
}

export interface AlertRenderContext {
  fuelCode?: string
  fuelName?: string
  stationName?: string
  stationId?: number
  priceCents?: number
  dropCents?: number
  distanceKm?: number
  suburbDisplay?: string
  signalState?: string
  topStations?: Array<{ name: string; priceCents: number; distanceKm: number }>
  bestDayToFill?: string
  userEmail?: string
  userName?: string | null
  alertLabel?: string | null
}

/** Web push notification payload */
export interface PushPayload {
  title: string
  body: string
  url: string
  icon?: string
  badge?: string
  tag: string
}

/** Result from dispatcher per channel */
export interface DispatchResult {
  channel: string
  status: DeliveryStatus
  providerMessageId?: string
  error?: string
}
