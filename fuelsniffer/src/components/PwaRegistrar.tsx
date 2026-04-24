'use client'
/**
 * PwaRegistrar — client-side service worker registration.
 *
 * Mounted in root layout. Handles:
 * - SW registration (skipped on localhost unless NEXT_PUBLIC_SW_DEV=1)
 * - beforeinstallprompt capture for deferred install UX
 * - Visit count tracking for install toast (shows on visit 3)
 * - New-SW update detection — shows "New version available" toast via
 *   messaging the waiting SW
 */
import { useEffect } from 'react'

const VISIT_COUNT_KEY = 'fillip-visit-count'
const INSTALL_DISMISSED_KEY = 'fillip-install-dismissed'

function incrementVisitCount(): number {
  try {
    const count = parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10) + 1
    localStorage.setItem(VISIT_COUNT_KEY, String(count))
    return count
  } catch {
    return 0
  }
}

function isDismissed(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(INSTALL_DISMISSED_KEY) ?? '0', 10)
    if (!ts) return false
    return Date.now() - ts < 60 * 24 * 60 * 60 * 1000 // 60 days
  } catch {
    return false
  }
}

export default function PwaRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const isDev = process.env.NODE_ENV === 'development'
    const swDevEnabled = process.env.NEXT_PUBLIC_SW_DEV === '1'
    if (isDev && !swDevEnabled) return

    // Register the service worker
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Poll for updates every 30 minutes
        setInterval(() => registration.update(), 30 * 60 * 1000)

        // Detect waiting SW (new version available)
        if (registration.waiting) {
          notifyNewVersion(registration.waiting)
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyNewVersion(newWorker)
            }
          })
        })
      })
      .catch((err) => {
        console.warn('[PwaRegistrar] SW registration failed:', err)
      })

    // Track visits for install-prompt UX (spec §4.3: show on visit 3)
    const visitCount = incrementVisitCount()
    if (visitCount === 3 && !isDismissed()) {
      // Dispatch a custom event — the install-prompt toast listens for this
      window.dispatchEvent(new CustomEvent('fillip:show-install-prompt'))
    }

    // Capture beforeinstallprompt for deferred install
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      window.dispatchEvent(
        new CustomEvent('fillip:beforeinstallprompt', { detail: e })
      )
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Track successful installs
    window.addEventListener('appinstalled', () => {
      console.debug('[Fillip] App installed successfully')
      // SP-3: analytics hook — wire to your analytics provider here
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  return null
}

function notifyNewVersion(worker: ServiceWorker) {
  // Dispatch event — a toast component can listen and prompt the user to refresh
  window.dispatchEvent(
    new CustomEvent('fillip:sw-update-available', { detail: { worker } })
  )
}
