'use client'

import { useEffect, useRef } from 'react'

// Set to true to show a placeholder in dev instead of the real AdSense tag
const DEV_PLACEHOLDER = process.env.NODE_ENV === 'development'

export default function AdCard() {
  const pushed = useRef(false)

  useEffect(() => {
    if (DEV_PLACEHOLDER || pushed.current) return
    pushed.current = true
    try {
      // @ts-expect-error — adsbygoogle is injected by the AdSense script
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense not loaded — silently ignore
    }
  }, [])

  if (DEV_PLACEHOLDER) {
    return (
      <div style={{
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        minHeight: '68px',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '320px',
          height: '50px',
          background: '#2a2a2a',
          border: '1px dashed #f59e0b',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 700,
          color: '#f59e0b',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Ad · 320×50
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: '#1a1a1a',
      borderBottom: '1px solid #2a2a2a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 16px',
      minHeight: '68px',
    }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', maxWidth: '320px', height: '50px' }}
        data-ad-client="ca-pub-REPLACE_WITH_YOUR_PUBLISHER_ID"
        data-ad-slot="REPLACE_WITH_YOUR_AD_SLOT_ID"
        data-ad-format="banner"
        data-full-width-responsive="false"
      />
    </div>
  )
}
