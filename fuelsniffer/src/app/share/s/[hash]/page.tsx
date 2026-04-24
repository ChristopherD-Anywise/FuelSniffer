/**
 * SP-8: Share deep-link page — /share/s/[hash]
 *
 * Publicly accessible (no auth required — sharing is a public act).
 * Sets OG meta tags pointing at /api/og/fill for preview cards.
 * Shows a minimal station summary + CTA "Open in Fillip".
 */
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getPublicUrl } from '@/lib/config/publicUrl'
import { signParams } from '@/lib/share/sign'

interface PageProps {
  params: Promise<{ hash: string }>
}

type RenderRow = {
  price_cents: number
  radius_km: number | null
  station_id: number
  station_name: string
  brand: string | null
  suburb: string | null
  fuel_code: string
  fuel_type_id: number
  variant: string
}

async function getShareData(hash: string): Promise<RenderRow | null> {
  try {
    const rows = await db.execute(sql`
      SELECT
        scr.price_cents,
        scr.radius_km,
        scr.fuel_type_id,
        scr.variant,
        s.id         AS station_id,
        s.name       AS station_name,
        s.brand,
        s.suburb,
        ft.code      AS fuel_code
      FROM share_card_renders scr
      JOIN stations  s  ON s.id  = scr.station_id
      JOIN fuel_types ft ON ft.id = scr.fuel_type_id
      WHERE scr.hash = ${hash}
      LIMIT 1
    `) as unknown as RenderRow[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

function buildOgImageUrl(base: string, row: RenderRow): string {
  const params: Record<string, string> = {
    s: String(row.station_id),
    f: String(row.fuel_type_id),
    p: String(row.price_cents),
    v: row.variant,
  }
  if (row.radius_km) params.r = String(row.radius_km)
  const sig = signParams(params)
  const sp = new URLSearchParams({ ...params, sig })
  return `${base}/api/og/fill?${sp}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hash } = await params
  const base = getPublicUrl().href.replace(/\/$/, '')
  const row = await getShareData(hash)

  if (!row) {
    return {
      title: 'Fillip — Know before you fill',
      description: 'Real-time fuel prices across Australia.',
    }
  }

  const priceDisplay = `$${(row.price_cents / 100).toFixed(2)}`
  const stationLabel = `${row.brand ? `${row.brand} ` : ''}${row.station_name}`
  const title = `${priceDisplay}/L for ${row.fuel_code} at ${stationLabel}`
  const description = [
    `${priceDisplay}/L for ${row.fuel_code}`,
    row.radius_km ? `— cheapest within ${row.radius_km} km` : null,
    '· Fillip — know before you fill.',
  ].filter(Boolean).join(' ')

  const ogImageUrl = buildOgImageUrl(base, row)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${base}/share/s/${hash}`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function SharePage({ params }: PageProps) {
  const { hash } = await params
  const base = getPublicUrl().href.replace(/\/$/, '')
  const row = await getShareData(hash)

  if (!row) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          fontFamily: 'system-ui, sans-serif',
          background: '#111111',
          color: '#f5f5f5',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48, height: 48, background: '#f59e0b', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: '#111', marginBottom: 24,
          }}
        >
          F
        </div>
        <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Link expired or not found</h1>
        <p style={{ color: '#737373', margin: '0 0 32px' }}>
          This share link may have expired. Check Fillip for current prices.
        </p>
        <a
          href={base}
          style={{
            background: '#f59e0b', color: '#111', padding: '12px 28px',
            borderRadius: 8, fontWeight: 700, textDecoration: 'none', fontSize: 16,
          }}
        >
          Open Fillip
        </a>
      </main>
    )
  }

  const priceDisplay = `$${(row.price_cents / 100).toFixed(2)}`
  const stationLabel = `${row.brand ? `${row.brand} ` : ''}${row.station_name}`
  const dashboardUrl = `${base}/dashboard?station=${row.station_id}`

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: 'system-ui, sans-serif',
        background: '#111111',
        color: '#f5f5f5',
        textAlign: 'center',
      }}
    >
      {/* Wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <div
          style={{
            width: 48, height: 48, background: '#f59e0b', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: '#111',
          }}
        >
          F
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Fillip</span>
      </div>

      {/* Price */}
      <div style={{ fontSize: 72, fontWeight: 800, color: '#f59e0b', lineHeight: 1, marginBottom: 8 }}>
        {priceDisplay}
      </div>
      <div style={{ fontSize: 22, color: '#d4d4d4', marginBottom: 16 }}>
        /L for {row.fuel_code}
      </div>
      <div style={{ fontSize: 20, color: '#a3a3a3', marginBottom: 8 }}>
        at {stationLabel}
        {row.suburb ? `, ${row.suburb}` : ''}
      </div>
      {row.radius_km && (
        <div style={{ fontSize: 16, color: '#737373', marginBottom: 32 }}>
          Cheapest within {row.radius_km} km
        </div>
      )}

      {/* CTA */}
      <a
        href={dashboardUrl}
        style={{
          display: 'inline-block', background: '#f59e0b', color: '#111111',
          padding: '14px 32px', borderRadius: 10, fontWeight: 700,
          textDecoration: 'none', fontSize: 18, marginTop: 24,
        }}
      >
        Open station in Fillip →
      </a>

      <p style={{ marginTop: 32, fontSize: 14, color: '#404040' }}>
        fillip.com.au · know before you fill
      </p>
    </main>
  )
}
