'use client'

/**
 * SP-5 Alerts — AlertWizard client component.
 *
 * Form for creating a new alert with:
 * - Type selector (4 types)
 * - Dynamic criteria fields per type
 * - Channel checkboxes (email + push)
 * - Push permission request on submit (only if push channel selected)
 * - Spec §8: permission requested only after first push-enabled alert is created
 */
import React, { useState } from 'react'

type AlertType = 'price_threshold' | 'cycle_low' | 'favourite_drop' | 'weekly_digest'

interface AlertWizardProps {
  onCreated?: (alert: unknown) => void
  onCancel?: () => void
}

export function AlertWizard({ onCreated, onCancel }: AlertWizardProps) {
  const [type, setType] = useState<AlertType>('price_threshold')
  const [channels, setChannels] = useState<string[]>(['email', 'push'])
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Price threshold fields
  const [fuelTypeId, setFuelTypeId] = useState(2)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radiusKm, setRadiusKm] = useState('5')
  const [maxPriceCents, setMaxPriceCents] = useState('')

  // Cycle low fields
  const [suburbKey, setSuburbKey] = useState('')

  // Favourite drop fields
  const [stationId, setStationId] = useState('')
  const [minDropCents, setMinDropCents] = useState('5')
  const [windowMinutes, setWindowMinutes] = useState('60')

  // Weekly digest — uses same lat/lng/radius/fuelTypeId as threshold

  function toggleChannel(ch: string) {
    setChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    )
  }

  async function requestPushPermission(): Promise<string | null> {
    if (typeof window === 'undefined' || !('Notification' in window)) return null

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey || !('serviceWorker' in navigator)) return null

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })

      // Register with server
      const resp = await fetch('/api/push/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh') ?? new ArrayBuffer(0)))),
            auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth') ?? new ArrayBuffer(0)))),
          },
          ua: navigator.userAgent,
        }),
      })

      if (!resp.ok) return null
      return sub.endpoint
    } catch {
      return null
    }
  }

  function buildCriteria(): unknown {
    switch (type) {
      case 'price_threshold':
        return {
          fuel_type_id: fuelTypeId,
          centre: { lat: parseFloat(lat), lng: parseFloat(lng) },
          radius_km: parseFloat(radiusKm),
          max_price_cents: parseFloat(maxPriceCents),
        }
      case 'cycle_low':
        return { suburb_key: suburbKey, fuel_type_id: fuelTypeId }
      case 'favourite_drop':
        return {
          station_id: parseInt(stationId, 10),
          fuel_type_id: fuelTypeId,
          min_drop_cents: parseFloat(minDropCents),
          window_minutes: parseInt(windowMinutes, 10),
        }
      case 'weekly_digest':
        return {
          fuel_type_id: fuelTypeId,
          centre: { lat: parseFloat(lat), lng: parseFloat(lng) },
          radius_km: parseFloat(radiusKm),
        }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      // If push channel selected, request permission first
      if (channels.includes('push')) {
        await requestPushPermission()
        // Don't fail if permission denied — just fall through (push will be silently skipped)
      }

      const resp = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          criteria: buildCriteria(),
          channels,
          label: label || undefined,
        }),
      })

      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Failed to create alert')
        return
      }

      onCreated?.(data.alert)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Alert type</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as AlertType)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="price_threshold">Price threshold — fuel drops below a price</option>
          <option value="cycle_low">Cycle low — fill-now signal for your suburb</option>
          <option value="favourite_drop">Favourite station drop</option>
          <option value="weekly_digest">Weekly digest (Sunday 6am)</option>
        </select>
      </div>

      {/* Dynamic criteria fields */}
      {(type === 'price_threshold' || type === 'weekly_digest') && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
              <input
                type="number" step="any" required
                value={lat} onChange={e => setLat(e.target.value)}
                placeholder="-27.43"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
              <input
                type="number" step="any" required
                value={lng} onChange={e => setLng(e.target.value)}
                placeholder="153.04"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Radius (km)</label>
            <input
              type="number" min="1" max="100" required
              value={radiusKm} onChange={e => setRadiusKm(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      {type === 'price_threshold' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Max price (cents, e.g. 174.9)</label>
          <input
            type="number" step="0.1" min="1" required
            value={maxPriceCents} onChange={e => setMaxPriceCents(e.target.value)}
            placeholder="174.9"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {type === 'cycle_low' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Suburb key (lower suburb|lower state)</label>
          <input
            type="text" required
            value={suburbKey} onChange={e => setSuburbKey(e.target.value)}
            placeholder="chermside|qld"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {type === 'favourite_drop' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Station ID</label>
            <input
              type="number" min="1" required
              value={stationId} onChange={e => setStationId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min drop (cents)</label>
              <input
                type="number" min="1" required
                value={minDropCents} onChange={e => setMinDropCents(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Window (minutes)</label>
              <input
                type="number" min="1" max="1440" required
                value={windowMinutes} onChange={e => setWindowMinutes(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Fuel type ID</label>
        <input
          type="number" min="1" required
          value={fuelTypeId} onChange={e => setFuelTypeId(parseInt(e.target.value, 10))}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Channels */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Notification channels</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={channels.includes('email')}
              onChange={() => toggleChannel('email')}
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={channels.includes('push')}
              onChange={() => toggleChannel('push')}
            />
            Push notification
            {typeof window !== 'undefined' && Notification?.permission === 'denied' && (
              <span className="text-xs text-slate-400">(blocked in browser settings)</span>
            )}
          </label>
        </div>
        {channels.length === 0 && (
          <p className="text-xs text-red-500 mt-1">Select at least one channel</p>
        )}
      </div>

      {/* Optional label */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Label (optional)</label>
        <input
          type="text"
          value={label} onChange={e => setLabel(e.target.value)}
          placeholder="My home suburb threshold"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting || channels.length === 0}
          className="flex-1 bg-sky-500 text-white font-semibold py-2 px-4 rounded-lg text-sm disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create alert'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
