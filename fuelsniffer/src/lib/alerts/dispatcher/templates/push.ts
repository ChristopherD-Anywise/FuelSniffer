/**
 * SP-5 Alerts — Web push payload builder per alert type.
 */
import type { AlertRenderContext, AlertType, PushPayload } from '../../types'

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(1)}`
}

export function buildPushPayload(
  alertId: number,
  type: AlertType,
  ctx: AlertRenderContext
): PushPayload {
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

  switch (type) {
    case 'price_threshold': {
      const price = ctx.priceCents !== undefined ? formatPrice(ctx.priceCents) : 'low'
      const dist = ctx.distanceKm !== undefined ? ` · ${ctx.distanceKm.toFixed(1)} km` : ''
      return {
        title: `${ctx.fuelName ?? 'Fuel'} — ${price} near you`,
        body: `${ctx.stationName ?? 'Nearby station'}${dist}`,
        url: ctx.stationId
          ? `${BASE_URL}/dashboard/station/${ctx.stationId}?utm_source=push`
          : `${BASE_URL}/dashboard?utm_source=push`,
        icon: '/icons/fillip-192.png',
        badge: '/icons/fillip-badge.png',
        tag: `fillip:pt:${alertId}:${ctx.stationId ?? 0}`,
      }
    }

    case 'cycle_low': {
      return {
        title: `Fill now — cycle low for ${ctx.suburbDisplay ?? 'your area'}`,
        body: `${ctx.fuelName ?? 'Fuel'} prices are at a cycle low. Best time to fill up.`,
        url: `${BASE_URL}/dashboard?utm_source=push`,
        icon: '/icons/fillip-192.png',
        badge: '/icons/fillip-badge.png',
        tag: `fillip:cl:${alertId}`,
      }
    }

    case 'favourite_drop': {
      const price = ctx.priceCents !== undefined ? formatPrice(ctx.priceCents) : ''
      const drop = ctx.dropCents !== undefined ? ` — down ${ctx.dropCents}¢` : ''
      return {
        title: `${ctx.stationName ?? 'Favourite station'} price drop`,
        body: `${ctx.fuelName ?? 'Fuel'}: ${price}${drop}`,
        url: ctx.stationId
          ? `${BASE_URL}/dashboard/station/${ctx.stationId}?utm_source=push`
          : `${BASE_URL}/dashboard?utm_source=push`,
        icon: '/icons/fillip-192.png',
        badge: '/icons/fillip-badge.png',
        tag: `fillip:fd:${alertId}`,
      }
    }

    case 'weekly_digest': {
      return {
        title: 'Your weekly fuel outlook',
        body: `${ctx.fuelName ?? 'Fuel'} near ${ctx.suburbDisplay ?? 'you'} — tap to view`,
        url: `${BASE_URL}/dashboard?utm_source=push`,
        icon: '/icons/fillip-192.png',
        badge: '/icons/fillip-badge.png',
        tag: `fillip:wd:${alertId}`,
      }
    }
  }
}
