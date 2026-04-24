/// <reference lib="WebWorker" />
/**
 * Fillip service worker — SP-3
 *
 * Built with Serwist (Workbox fork). Strategies per spec §4.4.
 *
 * SP-5 push handlers are stubbed here so the SW already has push
 * capability when SP-5 ships — avoids forcing a user re-grant.
 */
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, CacheFirst, NetworkFirst, StaleWhileRevalidate, ExpirationPlugin, NetworkOnly, RangeRequestsPlugin } from 'serwist'

// This syntax is needed to get the correct type declarations.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const REVISION = process.env.NEXT_PUBLIC_BUILD_ID || 'v1'
const BUILD = REVISION

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // We control skipWaiting via message (no surprise reloads)
  clientsClaim: true,
  navigationPreload: true,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
  runtimeCaching: [
    // App shell HTML — NetworkFirst with cache fallback
    {
      matcher: ({ request }) =>
        request.mode === 'navigate' &&
        ['/dashboard', '/', '/login', '/offline'].some(p =>
          request.url.includes(p)
        ),
      handler: new NetworkFirst({
        cacheName: `fillip-shell-${BUILD}`,
        plugins: [
          new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    // Static Next.js assets (immutable — content-addressed)
    {
      matcher: ({ url }) => url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: `fillip-static-${BUILD}`,
        plugins: [
          new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
      }),
    },
    // Images and Leaflet assets
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/leaflet/') ||
        url.pathname.startsWith('/icons/') ||
        /\.(png|jpg|jpeg|svg|gif|webp|avif|ico)$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: 'fillip-img-v1',
        plugins: [
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
          new RangeRequestsPlugin(),
        ],
      }),
    },
    // OSM tiles — stale-while-revalidate
    {
      matcher: ({ url }) => url.hostname.endsWith('.tile.openstreetmap.org'),
      handler: new StaleWhileRevalidate({
        cacheName: 'fillip-tiles-v1',
        plugins: [
          new ExpirationPlugin({ maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 7 }),
        ],
      }),
    },
    // Price API — SWR with stale indicator
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/api/prices') &&
        !url.pathname.startsWith('/api/prices/history'),
      handler: new StaleWhileRevalidate({
        cacheName: 'fillip-prices-v1',
        plugins: [
          new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    // Price history API
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/prices/history'),
      handler: new StaleWhileRevalidate({
        cacheName: 'fillip-history-v1',
        plugins: [
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 }),
        ],
      }),
    },
    // Auth and search — network only (never cache)
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/api/auth/') ||
        url.pathname.startsWith('/api/search'),
      handler: new NetworkOnly(),
    },
    // Default cache strategies from Serwist
    ...defaultCache,
  ],
})

serwist.addEventListeners()

// ──────────────────────────────────────────────────────────────────────────────
// SP-5 reserved: push notification handlers
// These are no-ops in SP-3 but must be registered so the SW version that SP-5
// ships doesn't require users to re-grant notification permission.
// ──────────────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return

  interface PushData {
    title: string
    body: string
    url?: string
    icon?: string
    badge?: string
    tag?: string
  }

  let data: PushData
  try {
    data = event.data.json() as PushData
  } catch {
    console.warn('[Fillip SW] push event: failed to parse JSON payload')
    return
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? '/icons/fillip-192.png',
      badge: data.badge ?? '/icons/fillip-badge.png',
      tag: data.tag,
      data: { url: data.url ?? '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url: string = (event.notification.data as { url?: string })?.url || '/dashboard'
  event.waitUntil(
    self.clients.openWindow(url)
  )
})

self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const pushEvent = event as PushSubscriptionChangeEvent & { waitUntil: (p: Promise<unknown>) => void }
  pushEvent.waitUntil(
    (async () => {
      try {
        const vapidPublicKey = self.__SW_MANIFEST
          ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '')
          : ''

        if (!vapidPublicKey) {
          console.warn('[Fillip SW] pushsubscriptionchange: no VAPID key, cannot re-subscribe')
          return
        }

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey,
        })

        // Notify the server about the new subscription
        await fetch('/api/push/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...new Uint8Array(newSub.getKey('p256dh') ?? new ArrayBuffer(0)))),
              auth: btoa(String.fromCharCode(...new Uint8Array(newSub.getKey('auth') ?? new ArrayBuffer(0)))),
            },
          }),
        })
      } catch (err) {
        console.error('[Fillip SW] pushsubscriptionchange: re-subscribe failed', err)
      }
    })()
  )
})

// Allow clients to trigger skipWaiting explicitly (no surprise reloads)
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
