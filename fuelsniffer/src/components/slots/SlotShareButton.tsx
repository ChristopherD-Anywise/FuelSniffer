'use client'
/**
 * SlotShareButton — SP-8 enabled.
 *
 * Three-branch share flow:
 * 1. Web Share API with PNG file (mobile native sheet)
 * 2. Web Share API text-only (desktop Chrome, etc.)
 * 3. Clipboard fallback (Firefox desktop, embedded browsers)
 *
 * Calls POST /api/share/sign to get a signed OG image URL + deep-link.
 * No user identifiers are passed to the signing endpoint.
 */
import { useState } from 'react'
import type { PriceResult } from '@/lib/db/queries/prices'

interface SlotShareButtonProps {
  station: PriceResult
  fuelTypeId?: number
  radiusKm?: number
  disabled?: boolean
}

export function SlotShareButton({
  station,
  fuelTypeId,
  radiusKm,
  disabled = false,
}: SlotShareButtonProps) {
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    if (disabled || sharing) return
    setSharing(true)

    try {
      const res = await fetch('/api/share/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: station.id,
          fuel_type_id: fuelTypeId ?? 2, // default to U91 (id=2) if not provided
          price_cents: Math.round(parseFloat(station.price_cents) * 100),
          radius_km: radiusKm,
        }),
      })

      if (!res.ok) {
        await fallbackCopy(`${window.location.origin}/dashboard`)
        return
      }

      const { deepLink, ogUrl } = await res.json()
      const title = `Fillip — ${station.brand ?? station.name} fuel price`
      const text = `Check out this fuel price I found with Fillip!`

      // Branch 1: Native share with PNG attachment
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        try {
          const pngRes = await fetch(ogUrl)
          if (pngRes.ok) {
            const blob = await pngRes.blob()
            const file = new File([blob], 'fillip-share.png', { type: 'image/png' })
            if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
              await navigator.share({ title, text, url: deepLink, files: [file] })
              return
            }
          }
        } catch {
          // fall through to text-only share
        }

        // Branch 2: Native share without file
        try {
          await navigator.share({ title, text, url: deepLink })
          return
        } catch (err) {
          // User cancelled or share failed — fall through to clipboard
          if (err instanceof Error && err.name === 'AbortError') return
        }
      }

      // Branch 3: Clipboard fallback
      await fallbackCopy(deepLink)
    } catch {
      // Silent fail — don't break the UI
    } finally {
      setSharing(false)
    }
  }

  async function fallbackCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || sharing}
      aria-label={copied ? 'Link copied!' : 'Share station'}
      data-slot="share"
      data-testid="share-button"
      onClick={handleShare}
      style={{
        background: 'none',
        border: 'none',
        padding: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        color: copied ? 'var(--color-accent, #f59e0b)' : 'var(--color-text-subtle)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        minWidth: 28,
        minHeight: 28,
        transition: 'color 0.15s, opacity 0.15s',
      }}
      title={copied ? 'Link copied!' : 'Share station price'}
    >
      {copied ? (
        /* Checkmark icon */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        /* Share icon */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      )}
    </button>
  )
}
