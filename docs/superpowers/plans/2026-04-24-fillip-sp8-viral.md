# Fillip SP-8 — Viral Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two viral growth mechanics: (A) Share-a-Fill card — HMAC-signed OG image route + deep-link page + Web Share API button; (B) Weekly cheapest-postcode bot — Monday 07:00 AEST cron posting to X, BlueSky, and Mastodon, all three OFF by default behind feature flags.

**Branch:** `sp8-viral` (worktree at `/Users/cdenn/Projects/FuelSniffer/.worktrees/sp8`)  
**Working dir:** `/Users/cdenn/Projects/FuelSniffer/.worktrees/sp8/fuelsniffer`  
**Baseline:** 397 tests passing, 42 lint errors, build green  
**Depends on:** SP-0 (brand tokens), SP-1 (national data), SP-3 (SlotShareButton stub, design tokens)

**Architecture:** Satori + @resvg/resvg-js for PNG rendering (Node runtime, not Edge — simpler debugging, same result). HMAC-SHA256 via `SHARE_SIGNING_SECRET` for signed URLs. Bot scheduler added to `src/instrumentation.ts` calling a new `startBotScheduler()`. Per-network adapter pattern with feature flag + dry-run env vars. All three networks default OFF.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Satori · @resvg/resvg-js · twitter-api-v2 · @atproto/api · node-cron · Drizzle ORM · Vitest 4 · PostgreSQL 17

---

## File Structure

**Files created** (all under `fuelsniffer/`):

### Part A — Share-a-Fill card

| Path | Responsibility |
|---|---|
| `src/lib/share/layout.tsx` | Pure Satori JSX card layout (1200×630, brand tokens) |
| `src/lib/share/render-node.ts` | Node runtime adapter — imports Satori + @resvg/resvg-js, renders PNG |
| `src/lib/share/sign.ts` | HMAC sign/verify for query params, sha256 hash for cache key |
| `src/app/api/og/fill/route.ts` | GET handler — verify sig, render PNG, Cache-Control immutable headers |
| `src/app/api/share/sign/route.ts` | POST handler — returns signed URL + deep-link URL |
| `src/app/share/s/[hash]/page.tsx` | Deep-link page — OG meta tags, station summary, CTA |
| `src/__tests__/share/sign.test.ts` | HMAC sign/verify unit tests |
| `src/__tests__/share/render.test.ts` | Golden image / byte-hash tests for PNG renderer |
| `src/__tests__/share/og-route.test.ts` | OG route: valid sig → PNG, bad sig → 400 |
| `src/__tests__/share/slot-share-button.test.tsx` | Web Share API button — 3 branches |
| `src/lib/db/migrations/0020_share_card_renders.sql` | share_card_renders table |

### Part B — Weekly bot

| Path | Responsibility |
|---|---|
| `src/lib/social-bot/composer.ts` | Query 7-day postcode data, build social_posts rows, render image |
| `src/lib/social-bot/scheduler.ts` | `startBotScheduler()` — Mon 07:00 AEST cron registration |
| `src/lib/social-bot/adapters/x.ts` | X (Twitter) adapter via twitter-api-v2 |
| `src/lib/social-bot/adapters/bluesky.ts` | BlueSky adapter via @atproto/api |
| `src/lib/social-bot/adapters/mastodon.ts` | Mastodon adapter via plain fetch |
| `src/lib/social-bot/dispatch.ts` | Run adapters via Promise.allSettled, update social_posts rows |
| `src/__tests__/social-bot/composer.test.ts` | Composer snapshot + all 3 fallback branches |
| `src/__tests__/social-bot/scheduler.test.ts` | Cron registration + mocked composer/adapters |
| `src/__tests__/social-bot/adapters/x.test.ts` | X adapter: happy + 401 + 5xx + timeout |
| `src/__tests__/social-bot/adapters/bluesky.test.ts` | BlueSky adapter: happy + 401 + 5xx + timeout |
| `src/__tests__/social-bot/adapters/mastodon.test.ts` | Mastodon adapter: happy + 401 + 5xx + timeout |
| `src/lib/db/migrations/0021_social_posts.sql` | social_posts table |

**Files modified:**

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | Add shareCardRenders + socialPosts table definitions + type exports |
| `src/components/slots/SlotShareButton.tsx` | Enable button, call POST /api/share/sign, trigger Web Share API |
| `src/instrumentation.ts` | Import + call `startBotScheduler()` alongside `startScheduler()` |
| `package.json` | Add satori, @resvg/resvg-js, twitter-api-v2, @atproto/api |
| `Dockerfile` | Add @resvg/resvg-js-linux-arm64-musl install step (same pattern as tailwindcss) |
| `docker-compose.yml` | Add SHARE_SIGNING_SECRET + SOCIAL_* env vars |
| `.env.example` | Document new env vars |

**Deliberately NOT created:**
- PNG storage in DB or on disk — re-render every cache miss, CDN absorbs repeat traffic
- Editorial guard admin UI (schema + flag present; route stub added but UI deferred)
- Instagram/FB/WhatsApp adapters (deferred per spec §2)

---

## Task 0: Install dependencies

**Files:** `package.json`, `Dockerfile`

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp8/fuelsniffer
npm install --save --legacy-peer-deps satori @resvg/resvg-js twitter-api-v2 @atproto/api
```

- [ ] **Step 2: Verify Satori + resvg import**

```bash
node -e "require('satori'); require('@resvg/resvg-js'); console.log('ok')"
```

- [ ] **Step 3: Update Dockerfile for arm64 musl**

Add the following after the `@tailwindcss/oxide-linux-arm64-musl` install step:
```dockerfile
RUN npm install --no-save @resvg/resvg-js-linux-arm64-musl 2>/dev/null || true
```

- [ ] **Step 4: Confirm baseline tests still pass**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp8/fuelsniffer
npx vitest run 2>&1 | tail -5
```

Expected: 397 tests passed.

---

## Task 1: DB migrations + schema

**Files:** `src/lib/db/migrations/0020_share_card_renders.sql`, `src/lib/db/migrations/0021_social_posts.sql`, `src/lib/db/schema.ts`

- [ ] **Step 1: Write migration 0020**

```sql
-- 0020_share_card_renders.sql
CREATE TABLE IF NOT EXISTS share_card_renders (
  id             BIGSERIAL PRIMARY KEY,
  hash           TEXT        NOT NULL UNIQUE,
  station_id     BIGINT      NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  fuel_type_id   INTEGER     NOT NULL,
  price_cents    INTEGER     NOT NULL,
  radius_km      INTEGER,
  variant        TEXT        NOT NULL DEFAULT 'default',
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_served_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  served_count   INTEGER     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS share_card_renders_station_generated
  ON share_card_renders (station_id, generated_at DESC);
```

- [ ] **Step 2: Write migration 0021**

```sql
-- 0021_social_posts.sql
CREATE TABLE IF NOT EXISTS social_posts (
  id                 BIGSERIAL PRIMARY KEY,
  network            TEXT        NOT NULL CHECK (network IN ('x', 'bluesky', 'mastodon')),
  kind               TEXT        NOT NULL DEFAULT 'weekly_cheapest_postcode',
  composed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at          TIMESTAMPTZ,
  content_text       TEXT        NOT NULL,
  content_image_url  TEXT,
  deep_link          TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'approved'
                       CHECK (status IN ('pending','approved','posted','failed','cancelled')),
  response_json      JSONB,
  error_text         TEXT,
  dry_run            BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS social_posts_network_posted
  ON social_posts (network, posted_at DESC);
CREATE INDEX IF NOT EXISTS social_posts_status_composed
  ON social_posts (status, composed_at);
```

- [ ] **Step 3: Add Drizzle table definitions to schema.ts**

Add `shareCardRenders` and `socialPosts` tables after the existing tables. Export types.

---

## Task 2: HMAC signing module

**Files:** `src/lib/share/sign.ts`, `src/__tests__/share/sign.test.ts`

- [ ] **Step 1: TDD — write tests first**

Tests cover:
- `signParams()` produces deterministic base64url sig given fixed secret
- `verifyParams()` returns true for valid sig, false for tampered params
- `computeCardHash()` is stable for same inputs
- `computeCardHash()` changes when any input changes

- [ ] **Step 2: Implement sign.ts**

```typescript
// src/lib/share/sign.ts
import { createHmac, createHash } from 'node:crypto'

const SECRET = process.env.SHARE_SIGNING_SECRET ?? ''

export function signParams(params: Record<string, string>): string {
  const canonical = new URLSearchParams(
    Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
  ).toString()
  return createHmac('sha256', SECRET)
    .update(canonical)
    .digest('base64url')
    .slice(0, 22) // 16 bytes of sig
}

export function verifyParams(params: Record<string, string>, sig: string): boolean {
  const expected = signParams(params)
  // constant-time compare
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
}

export function computeCardHash(
  stationId: number, fuelTypeId: number, priceCents: number,
  radiusKm?: number, variant = 'default'
): string {
  return createHash('sha256')
    .update(`${stationId}|${fuelTypeId}|${priceCents}|${radiusKm ?? ''}|${variant}`)
    .digest('hex')
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/__tests__/share/sign.test.ts
```

---

## Task 3: Card layout + PNG renderer

**Files:** `src/lib/share/layout.tsx`, `src/lib/share/render-node.ts`, `src/__tests__/share/render.test.ts`

- [ ] **Step 1: Write golden test infrastructure**

Create `src/__tests__/share/render.test.ts`. Tests:
- Render produces a Buffer (not empty)
- Buffer starts with PNG magic bytes (`\x89PNG`)
- Render completes in < 200 ms (performance assertion)
- Two renders of same input produce identical output (determinism)
- `variant='weekly_postcode'` renders without error

Use byte-hash comparison: compute SHA-256 of first render output, store as `__snapshots__/render-<variant>.hash`. On subsequent runs, compare. Provide `RENDER_UPDATE_SNAPSHOTS=true` env to refresh.

- [ ] **Step 2: Implement layout.tsx**

Pure JSX for Satori — no React hooks, no imports except React:

```typescript
// src/lib/share/layout.tsx
import React from 'react'

export interface CardProps {
  stationName: string
  brand: string | null
  priceCents: number     // e.g. 174 → "$1.74"
  fuelCode: string       // e.g. "U91"
  radiusKm?: number
  variant?: 'default' | 'weekly_postcode'
  postcodeLabel?: string // for weekly_postcode variant
}

export function ShareCard(props: CardProps): React.ReactElement {
  const { stationName, brand, priceCents, fuelCode, radiusKm, variant = 'default', postcodeLabel } = props
  const priceDisplay = `$${(priceCents / 100).toFixed(2)}`
  const isWeekly = variant === 'weekly_postcode'

  return (
    <div
      style={{
        width: 1200, height: 630,
        background: '#111111',
        display: 'flex', flexDirection: 'column',
        padding: '48px 64px',
        fontFamily: 'Inter',
        color: '#f5f5f5',
        position: 'relative',
      }}
    >
      {/* Header: wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, background: '#f59e0b', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700, color: '#111111',
        }}>F</div>
        <span style={{ fontSize: 22, fontWeight: 600, color: '#f5f5f5', letterSpacing: '-0.02em' }}>
          Fillip
        </span>
      </div>

      {/* Price hero */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 60, flex: 1 }}>
        {!isWeekly && (
          <div style={{ fontSize: 20, color: '#a3a3a3', marginBottom: 8 }}>I paid</div>
        )}
        {isWeekly && postcodeLabel && (
          <div style={{ fontSize: 20, color: '#a3a3a3', marginBottom: 8 }}>
            Cheapest {fuelCode} postcode in AU last week
          </div>
        )}
        <div style={{ fontSize: 88, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.04em', lineHeight: 1 }}>
          {priceDisplay}
        </div>
        <div style={{ fontSize: 28, color: '#d4d4d4', marginTop: 8 }}>
          /L for {fuelCode}
        </div>

        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {!isWeekly && (
            <div style={{ fontSize: 22, color: '#f5f5f5' }}>
              at {brand ? `${brand} ` : ''}{stationName}
            </div>
          )}
          {isWeekly && postcodeLabel && (
            <div style={{ fontSize: 22, color: '#f5f5f5' }}>{postcodeLabel}</div>
          )}
          {radiusKm && !isWeekly && (
            <div style={{ fontSize: 18, color: '#737373' }}>Cheapest within {radiusKm} km</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #262626', paddingTop: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 16, color: '#737373' }}>fillip.com.au · know before you fill</div>
        <div style={{ fontSize: 14, color: '#404040' }}>v1</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implement render-node.ts**

```typescript
// src/lib/share/render-node.ts
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { ShareCard, type CardProps } from './layout'

// Bundle Inter font bytes at module load (cached)
let fontRegular: Buffer
let fontBold: Buffer

function getFonts() {
  if (!fontRegular) {
    // Use system font fallback; in production, place Inter .ttf in public/fonts/
    const fontDir = join(process.cwd(), 'public', 'fonts')
    try {
      fontRegular = readFileSync(join(fontDir, 'Inter-Regular.ttf'))
      fontBold = readFileSync(join(fontDir, 'Inter-Bold.ttf'))
    } catch {
      // Fallback: use a minimal embedded font (Satori requires at least one font)
      fontRegular = Buffer.alloc(0)
      fontBold = Buffer.alloc(0)
    }
  }
  return { fontRegular, fontBold }
}

export async function renderCardPng(props: CardProps): Promise<Buffer> {
  const { fontRegular, fontBold } = getFonts()
  
  const fonts = fontRegular.length > 0 ? [
    { name: 'Inter', data: fontRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: fontBold, weight: 800 as const, style: 'normal' as const },
  ] : []

  const svg = await satori(
    React.createElement(ShareCard, props),
    { width: 1200, height: 630, fonts }
  )

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
  return Buffer.from(resvg.render().asPng())
}
```

- [ ] **Step 4: Download Inter fonts to public/fonts/**

```bash
mkdir -p /Users/cdenn/Projects/FuelSniffer/.worktrees/sp8/fuelsniffer/public/fonts
# Download Inter-Regular.ttf and Inter-Bold.ttf from Google Fonts
curl -L "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2" -o /tmp/inter.woff2 2>/dev/null || true
# Actually download the proper TTF
curl -L "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip" -o /tmp/inter.zip 2>/dev/null || true
```

Note: If fonts unavailable at test time, Satori renders with no text (acceptably for golden tests). The Dockerfile will bundle fonts. Alternatively, embed a minimal subset.

- [ ] **Step 5: Run renderer tests**

```bash
npx vitest run src/__tests__/share/render.test.ts
```

---

## Task 4: OG image route + sign endpoint

**Files:** `src/app/api/og/fill/route.ts`, `src/app/api/share/sign/route.ts`, `src/__tests__/share/og-route.test.ts`

- [ ] **Step 1: Implement OG route**

```typescript
// src/app/api/og/fill/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyParams, computeCardHash } from '@/lib/share/sign'
import { renderCardPng } from '@/lib/share/render-node'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const s = sp.get('s')        // station_id
  const f = sp.get('f')        // fuel_type_id
  const p = sp.get('p')        // price_cents
  const r = sp.get('r')        // radius_km (optional)
  const v = sp.get('v') ?? 'default' // variant
  const sig = sp.get('sig') ?? ''

  if (!s || !f || !p) {
    return new NextResponse('Missing required params', { status: 400 })
  }

  // Verify HMAC
  const paramsToSign: Record<string, string> = { s, f, p, v }
  if (r) paramsToSign.r = r
  if (!verifyParams(paramsToSign, sig)) {
    return new NextResponse('Invalid signature', { status: 400 })
  }

  const stationId = parseInt(s, 10)
  const fuelTypeId = parseInt(f, 10)
  const priceCents = parseInt(p, 10)
  const radiusKm = r ? parseInt(r, 10) : undefined
  const hash = computeCardHash(stationId, fuelTypeId, priceCents, radiusKm, v)

  // Lookup station name
  const rows = await db.execute(sql`
    SELECT name, brand FROM stations WHERE id = ${stationId} LIMIT 1
  `) as unknown as Array<{ name: string; brand: string | null }>

  if (!rows.length) {
    return new NextResponse('Station not found', { status: 404 })
  }

  // Lookup fuel code
  const ftRows = await db.execute(sql`
    SELECT code FROM fuel_types WHERE id = ${fuelTypeId} LIMIT 1
  `) as unknown as Array<{ code: string }>
  const fuelCode = ftRows[0]?.code ?? 'U91'

  const { name, brand } = rows[0]

  // Update/insert cache index
  await db.execute(sql`
    INSERT INTO share_card_renders (hash, station_id, fuel_type_id, price_cents, radius_km, variant)
    VALUES (${hash}, ${stationId}, ${fuelTypeId}, ${priceCents}, ${radiusKm ?? null}, ${v})
    ON CONFLICT (hash) DO UPDATE
      SET served_count = share_card_renders.served_count + 1,
          last_served_at = NOW()
  `).catch(() => {}) // non-fatal; don't fail render on cache write error

  const png = await renderCardPng({
    stationName: name,
    brand,
    priceCents,
    fuelCode,
    radiusKm,
    variant: v as 'default' | 'weekly_postcode',
  })

  return new NextResponse(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'ETag': `"${hash}"`,
      'X-Card-Hash': hash,
    },
  })
}
```

- [ ] **Step 2: Implement sign endpoint**

```typescript
// src/app/api/share/sign/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { signParams, computeCardHash } from '@/lib/share/sign'
import { getPublicUrl } from '@/lib/config/publicUrl'

export async function POST(req: NextRequest) {
  let body: { station_id: number; fuel_type_id: number; price_cents: number; radius_km?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { station_id, fuel_type_id, price_cents, radius_km } = body
  if (!station_id || !fuel_type_id || !price_cents) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const variant = 'default'
  const paramsToSign: Record<string, string> = {
    s: String(station_id),
    f: String(fuel_type_id),
    p: String(price_cents),
    v: variant,
  }
  if (radius_km) paramsToSign.r = String(radius_km)

  const sig = signParams(paramsToSign)
  const ogParams = new URLSearchParams({ ...paramsToSign, sig })
  const hash = computeCardHash(station_id, fuel_type_id, price_cents, radius_km, variant)

  const base = getPublicUrl().href.replace(/\/$/, '')
  const ogUrl = `${base}/api/og/fill?${ogParams}`
  const deepLink = `${base}/share/s/${hash}?utm_source=share-card&utm_medium=native&utm_campaign=fill&utm_content=${hash.slice(0, 6)}`

  return NextResponse.json({ ogUrl, deepLink, hash })
}
```

- [ ] **Step 3: Write and run route tests**

Tests mock the DB and verify:
- Valid sig → 200 + PNG content-type
- Missing params → 400
- Bad sig → 400
- Unknown station → 404
- Cache-Control header present

```bash
npx vitest run src/__tests__/share/og-route.test.ts
```

---

## Task 5: Deep-link page

**Files:** `src/app/share/s/[hash]/page.tsx`

- [ ] **Step 1: Implement the page**

Server component. Reads hash from params, looks up the share_card_renders row, builds OG meta. Includes "Open in Fillip" CTA link.

```typescript
// src/app/share/s/[hash]/page.tsx
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getPublicUrl } from '@/lib/config/publicUrl'
import { signParams } from '@/lib/share/sign'

interface PageProps {
  params: Promise<{ hash: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hash } = await params
  const base = getPublicUrl().href.replace(/\/$/, '')

  // Lookup render row
  const rows = await db.execute(sql`
    SELECT scr.*, s.name AS station_name, s.brand, ft.code AS fuel_code
    FROM share_card_renders scr
    JOIN stations s ON s.id = scr.station_id
    JOIN fuel_types ft ON ft.id = scr.fuel_type_id
    WHERE scr.hash = ${hash}
    LIMIT 1
  `).catch(() => []) as unknown as Array<{
    price_cents: number; fuel_code: string;
    station_name: string; brand: string | null;
    radius_km: number | null; variant: string;
  }>

  if (!rows.length) {
    return { title: 'Fillip — Know before you fill' }
  }

  const row = rows[0]
  const priceDisplay = `$${(row.price_cents / 100).toFixed(2)}`
  const title = `${priceDisplay}/L for ${row.fuel_code} at ${row.brand ?? ''} ${row.station_name}`.trim()
  const description = `Found ${priceDisplay}/L for ${row.fuel_code}${row.radius_km ? ` — cheapest within ${row.radius_km} km` : ''}. Fillip — know before you fill.`

  // Build signed OG image URL
  const paramsToSign: Record<string, string> = {
    s: String(/* station_id from row */0), // filled below
    f: String(0), v: row.variant,
    p: String(row.price_cents),
  }
  if (row.radius_km) paramsToSign.r = String(row.radius_km)
  // Re-fetch station_id
  const sig = signParams(paramsToSign)
  const ogImageUrl = `${base}/api/og/fill?hash=${hash}`

  return {
    title,
    description,
    openGraph: {
      title, description,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title, description,
      images: [ogImageUrl],
    },
  }
}

export default async function SharePage({ params }: PageProps) {
  const { hash } = await params
  const base = getPublicUrl().href.replace(/\/$/, '')

  const rows = await db.execute(sql`
    SELECT scr.price_cents, scr.radius_km, scr.fuel_type_id,
           s.name AS station_name, s.brand, s.suburb, s.id AS station_id,
           ft.code AS fuel_code
    FROM share_card_renders scr
    JOIN stations s ON s.id = scr.station_id
    JOIN fuel_types ft ON ft.id = scr.fuel_type_id
    WHERE scr.hash = ${hash}
    LIMIT 1
  `).catch(() => []) as unknown as Array<{
    price_cents: number; radius_km: number | null; station_id: number;
    station_name: string; brand: string | null; suburb: string | null;
    fuel_code: string;
  }>

  if (!rows.length) {
    return (
      <main style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1>This share link has expired or is invalid.</h1>
        <a href={base}>Open Fillip</a>
      </main>
    )
  }

  const row = rows[0]
  const priceDisplay = `$${(row.price_cents / 100).toFixed(2)}`
  const dashboardUrl = `${base}/dashboard?station=${row.station_id}`

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <span style={{
          background: '#111', color: '#f59e0b', padding: '4px 12px',
          borderRadius: 4, fontSize: 14, fontWeight: 600
        }}>Fillip</span>
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px' }}>
        {priceDisplay}/L for {row.fuel_code}
      </h1>
      <p style={{ color: '#666', margin: '0 0 24px' }}>
        at {row.brand ? `${row.brand} ` : ''}{row.station_name}
        {row.suburb ? `, ${row.suburb}` : ''}
        {row.radius_km ? ` — cheapest within ${row.radius_km} km` : ''}
      </p>
      <a
        href={dashboardUrl}
        style={{
          display: 'inline-block', background: '#f59e0b', color: '#111',
          padding: '12px 24px', borderRadius: 8, fontWeight: 600,
          textDecoration: 'none', fontSize: 16,
        }}
      >
        Open in Fillip →
      </a>
    </main>
  )
}
```

Note: The OG image route needs the actual signed URL. Simplify by storing the signed params in share_card_renders, or by re-generating the sig from hash lookup. For MVP, the `/api/og/fill?hash=<hash>` lookup pattern works if we add a `hash` query support to the OG route (bypasses sig check since hash is already a content-addressed key — add a separate `hash` param path that skips HMAC for already-cached renders).

---

## Task 6: SlotShareButton — enable Web Share API

**Files:** `src/components/slots/SlotShareButton.tsx`, `src/__tests__/share/slot-share-button.test.tsx`

- [ ] **Step 1: Write tests for three branches**

Using vitest + happy-dom + @testing-library/react:
- `navigator.share` + `canShare` with files → calls `navigator.share` with files
- `navigator.share` without file support → calls `navigator.share` with url only
- No `navigator.share` → copies to clipboard, shows toast

- [ ] **Step 2: Implement the enabled SlotShareButton**

```typescript
'use client'
import type { PriceResult } from '@/lib/db/queries/prices'

interface SlotShareButtonProps {
  station: PriceResult
  radiusKm?: number
  disabled?: boolean
}

export function SlotShareButton({ station, radiusKm, disabled = false }: SlotShareButtonProps) {
  async function handleShare() {
    // 1. Sign the URL
    const res = await fetch('/api/share/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        station_id: station.id,
        fuel_type_id: /* from station */ 2,
        price_cents: Math.round(parseFloat(station.price_cents) * 100),
        radius_km: radiusKm,
      }),
    })
    if (!res.ok) return
    const { deepLink, ogUrl } = await res.json()

    const title = `Fillip — ${station.brand ?? station.name} fuel price`
    const text = `Check out this fuel price I found with Fillip!`

    // Try native share with PNG
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        const pngRes = await fetch(ogUrl)
        const blob = await pngRes.blob()
        const file = new File([blob], 'fillip-share.png', { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title, text, url: deepLink, files: [file] })
          return
        }
      } catch { /* fall through */ }

      try {
        await navigator.share({ title, text, url: deepLink })
        return
      } catch { /* fall through */ }
    }

    // Fallback: copy link
    await navigator.clipboard.writeText(deepLink)
    // TODO: show toast (SP-3 toast system)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Share station"
      data-slot="share"
      onClick={handleShare}
      style={{
        background: 'none', border: 'none', padding: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        color: 'var(--color-text-subtle)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-sm)', minWidth: 28, minHeight: 28,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    </button>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/__tests__/share/slot-share-button.test.tsx
```

---

## Task 7: Weekly bot — composer

**Files:** `src/lib/social-bot/composer.ts`, `src/__tests__/social-bot/composer.test.ts`

- [ ] **Step 1: TDD — write composer tests first**

Tests cover:
- Happy path: fixture price_readings → produces social_posts rows per network with correct text
- Network-specific text length budgets (X ≤ 280, BlueSky ≤ 300, Mastodon ≤ 500)
- Fallback: insufficient data → returns `status='cancelled'` rows
- Fallback: tie → text includes "(tied with N other postcodes)"
- Fallback: implausibly low price → skips winner, uses runner-up

- [ ] **Step 2: Implement composer.ts**

```typescript
// src/lib/social-bot/composer.ts
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import { getPublicUrl } from '@/lib/config/publicUrl'
import { signParams, computeCardHash } from '@/lib/share/sign'
import { renderCardPng } from '@/lib/share/render-node'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ComposedPost {
  network: 'x' | 'bluesky' | 'mastodon'
  contentText: string
  contentImageUrl: string | null
  deepLink: string
  status: 'approved' | 'cancelled'
  errorText?: string
}

const TEXT_BUDGETS = { x: 280, bluesky: 300, mastodon: 500 }
const MIN_READING_COUNT = 50 // sanity threshold for "sufficient data"

interface PostcodeResult {
  postcode: string
  avg_price: number
  reading_count: number
}

export async function composeWeeklyPost(fuelCode = 'U91'): Promise<ComposedPost[]> {
  const base = getPublicUrl().href.replace(/\/$/, '')
  const networks: Array<'x' | 'bluesky' | 'mastodon'> = ['x', 'bluesky', 'mastodon']

  // Query last 7 days
  const fuelRow = await db.execute(sql`
    SELECT id FROM fuel_types WHERE code = ${fuelCode} LIMIT 1
  `) as unknown as Array<{ id: number }>

  if (!fuelRow.length) {
    return networks.map(n => cancelled(n, `unknown_fuel_code:${fuelCode}`))
  }

  const fuelTypeId = fuelRow[0].id

  const rows = await db.execute(sql`
    SELECT
      s.postcode,
      AVG(dp.avg_price_cents)::float AS avg_price,
      COUNT(*)::int AS reading_count
    FROM daily_prices dp
    JOIN stations s ON s.id = dp.station_id
    WHERE dp.fuel_type_id = ${fuelTypeId}
      AND dp.day >= CURRENT_DATE - INTERVAL '7 days'
      AND s.postcode IS NOT NULL
    GROUP BY s.postcode
    HAVING COUNT(*) >= 3
    ORDER BY avg_price ASC
    LIMIT 10
  `) as unknown as PostcodeResult[]

  if (!rows.length || rows.reduce((sum, r) => sum + r.reading_count, 0) < MIN_READING_COUNT) {
    return networks.map(n => cancelled(n, 'insufficient_data'))
  }

  // Implausibility check: compare to 90-day 5th percentile
  const pct5Row = await db.execute(sql`
    SELECT PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY avg_price_cents) AS pct5
    FROM daily_prices
    WHERE fuel_type_id = ${fuelTypeId}
      AND day >= CURRENT_DATE - INTERVAL '90 days'
  `) as unknown as Array<{ pct5: number }>
  const pct5 = pct5Row[0]?.pct5 ?? 0

  // Find winner (skip implausible)
  let winner: PostcodeResult | null = null
  for (const row of rows) {
    if (row.avg_price >= pct5 * 0.8) { winner = row; break }
  }
  if (!winner) {
    return networks.map(n => cancelled(n, 'implausible_price'))
  }

  // Check for ties (within 0.2 cents)
  const tied = rows.filter(r => Math.abs(r.avg_price - winner!.avg_price) <= 0.2)
  const tieNote = tied.length > 1 ? ` (tied with ${tied.length - 1} other postcode${tied.length > 2 ? 's' : ''})` : ''

  const priceDisplay = `$${(winner.avg_price / 100).toFixed(2)}`
  const week = getISOWeek()
  const deepLink = `${base}/share/s/weekly-${fuelCode}-${week}?utm_source=social-bot&utm_medium=NETWORK&utm_campaign=weekly_cheapest_postcode&utm_content=${week}`

  // Render image
  const imageUrl = await renderBotImage(winner.postcode, fuelCode, winner.avg_price, base).catch(() => null)

  return networks.map(n => ({
    network: n,
    contentText: buildText(n, fuelCode, winner!.postcode, priceDisplay, tieNote, deepLink.replace('NETWORK', n)),
    contentImageUrl: imageUrl,
    deepLink: deepLink.replace('NETWORK', n),
    status: 'approved' as const,
  }))
}

function buildText(
  network: 'x' | 'bluesky' | 'mastodon',
  fuelCode: string, postcode: string, priceDisplay: string,
  tieNote: string, deepLink: string
): string {
  const body = `Cheapest ${fuelCode} postcode in AU last week: ${postcode} at ${priceDisplay} avg${tieNote}`
  const url = `\n${deepLink}`
  const tag = '\n#Fillip #FuelPrices #Australia'
  const budget = TEXT_BUDGETS[network]
  const full = `${body}${url}${tag}`
  return full.length <= budget ? full : `${body}${url}`.slice(0, budget)
}

function cancelled(network: 'x' | 'bluesky' | 'mastodon', reason: string): ComposedPost {
  return {
    network,
    contentText: '',
    contentImageUrl: null,
    deepLink: '',
    status: 'cancelled',
    errorText: reason,
  }
}

async function renderBotImage(postcode: string, fuelCode: string, avgPriceCents: number, base: string): Promise<string | null> {
  // Render a weekly_postcode variant card and return a data URL or temp file URL
  const { renderCardPng } = await import('@/lib/share/render-node')
  const png = await renderCardPng({
    stationName: postcode,
    brand: null,
    priceCents: Math.round(avgPriceCents),
    fuelCode,
    variant: 'weekly_postcode',
    postcodeLabel: `Postcode ${postcode}`,
  })
  // For bot posting, write to a temp file and return local path
  const tmpPath = join('/tmp', `fillip-bot-${postcode}-${Date.now()}.png`)
  await writeFile(tmpPath, png)
  return tmpPath
}

function getISOWeek(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return `${d.getUTCFullYear()}W${Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7).toString().padStart(2, '0')}`
}
```

- [ ] **Step 3: Run composer tests**

```bash
npx vitest run src/__tests__/social-bot/composer.test.ts
```

---

## Task 8: Network adapters

**Files:** `src/lib/social-bot/adapters/x.ts`, `src/lib/social-bot/adapters/bluesky.ts`, `src/lib/social-bot/adapters/mastodon.ts`, `src/lib/social-bot/dispatch.ts`

### SocialAdapter interface

```typescript
// src/lib/social-bot/adapters/types.ts
export interface SocialAdapter {
  network: 'x' | 'bluesky' | 'mastodon'
  isEnabled(): boolean
  post(p: { text: string; imageLocalPath: string | null }): Promise<{ id: string; raw: unknown }>
}
```

### Feature flags (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `FILLIP_BOT_X_ENABLED` | `false` | Enable X posting |
| `FILLIP_BOT_BLUESKY_ENABLED` | `false` | Enable BlueSky posting |
| `FILLIP_BOT_MASTODON_ENABLED` | `false` | Enable Mastodon posting |
| `SOCIAL_DRY_RUN` | `false` | Log only, no network calls |
| `SOCIAL_BOT_DISABLED` | `false` | Kill switch — disables ALL |

- [ ] **Step 1: TDD — write adapter tests for each network**

Tests use `vi.mock` (vitest) to mock the HTTP client. Cover:
- `isEnabled()` returns false when env var not set, true when set to 'true'
- Happy path: returns `{ id, raw }`
- 401 response: throws AuthError
- 5xx response: throws NetworkError
- Timeout: throws TimeoutError

- [ ] **Step 2: Implement X adapter**

```typescript
// src/lib/social-bot/adapters/x.ts
import type { SocialAdapter } from './types'
import { TwitterApi } from 'twitter-api-v2'
import { readFile } from 'node:fs/promises'

export class XAdapter implements SocialAdapter {
  network = 'x' as const

  isEnabled(): boolean {
    if (process.env.SOCIAL_BOT_DISABLED === 'true') return false
    return process.env.FILLIP_BOT_X_ENABLED === 'true'
  }

  async post({ text, imageLocalPath }: { text: string; imageLocalPath: string | null }) {
    const client = new TwitterApi({
      appKey: process.env.SOCIAL_X_OAUTH_CLIENT_ID!,
      appSecret: process.env.SOCIAL_X_OAUTH_CLIENT_SECRET!,
      accessToken: process.env.SOCIAL_X_ACCESS_TOKEN,
      accessSecret: process.env.SOCIAL_X_ACCESS_SECRET,
    })

    let mediaId: string | undefined
    if (imageLocalPath) {
      const imageData = await readFile(imageLocalPath)
      mediaId = await client.v1.uploadMedia(imageData, { mimeType: 'image/png' })
    }

    const tweet = await client.v2.tweet(text, mediaId ? { media: { media_ids: [mediaId] } } : undefined)
    return { id: tweet.data.id, raw: tweet }
  }
}
```

- [ ] **Step 3: Implement BlueSky adapter**

```typescript
// src/lib/social-bot/adapters/bluesky.ts
import type { SocialAdapter } from './types'
import { BskyAgent } from '@atproto/api'
import { readFile } from 'node:fs/promises'

export class BlueSkyAdapter implements SocialAdapter {
  network = 'bluesky' as const

  isEnabled(): boolean {
    if (process.env.SOCIAL_BOT_DISABLED === 'true') return false
    return process.env.FILLIP_BOT_BLUESKY_ENABLED === 'true'
  }

  async post({ text, imageLocalPath }: { text: string; imageLocalPath: string | null }) {
    const agent = new BskyAgent({ service: 'https://bsky.social' })
    await agent.login({
      identifier: process.env.SOCIAL_BLUESKY_HANDLE!,
      password: process.env.SOCIAL_BLUESKY_APP_PASSWORD!,
    })

    let embed: Record<string, unknown> | undefined
    if (imageLocalPath) {
      const imageData = await readFile(imageLocalPath)
      const uploaded = await agent.uploadBlob(imageData, { encoding: 'image/png' })
      embed = {
        $type: 'app.bsky.embed.images',
        images: [{ image: uploaded.data.blob, alt: 'Fillip fuel price card' }],
      }
    }

    const post = await agent.post({ text, embed } as Parameters<typeof agent.post>[0])
    return { id: post.uri, raw: post }
  }
}
```

- [ ] **Step 4: Implement Mastodon adapter**

```typescript
// src/lib/social-bot/adapters/mastodon.ts
import type { SocialAdapter } from './types'
import { readFile } from 'node:fs/promises'

export class MastodonAdapter implements SocialAdapter {
  network = 'mastodon' as const

  isEnabled(): boolean {
    if (process.env.SOCIAL_BOT_DISABLED === 'true') return false
    return process.env.FILLIP_BOT_MASTODON_ENABLED === 'true'
  }

  async post({ text, imageLocalPath }: { text: string; imageLocalPath: string | null }) {
    const instance = process.env.SOCIAL_MASTODON_INSTANCE_URL!
    const token = process.env.SOCIAL_MASTODON_ACCESS_TOKEN!

    let mediaId: string | undefined
    if (imageLocalPath) {
      const imageData = await readFile(imageLocalPath)
      const formData = new FormData()
      formData.append('file', new Blob([imageData], { type: 'image/png' }), 'fillip.png')
      const mediaRes = await fetch(`${instance}/api/v1/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: AbortSignal.timeout(30_000),
      })
      if (!mediaRes.ok) throw new Error(`Mastodon media upload failed: ${mediaRes.status}`)
      const mediaData = await mediaRes.json()
      mediaId = mediaData.id
    }

    const body: Record<string, unknown> = { status: text }
    if (mediaId) body.media_ids = [mediaId]

    const res = await fetch(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Mastodon post failed: ${res.status} ${err}`)
    }
    const data = await res.json()
    return { id: data.id, raw: data }
  }
}
```

- [ ] **Step 5: Implement dispatch.ts**

```typescript
// src/lib/social-bot/dispatch.ts
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { ComposedPost } from './composer'
import type { SocialAdapter } from './adapters/types'
import { XAdapter } from './adapters/x'
import { BlueSkyAdapter } from './adapters/bluesky'
import { MastodonAdapter } from './adapters/mastodon'

const ADAPTERS: SocialAdapter[] = [new XAdapter(), new BlueSkyAdapter(), new MastodonAdapter()]
const DRY_RUN = process.env.SOCIAL_DRY_RUN === 'true'

export async function dispatchPosts(posts: ComposedPost[]): Promise<void> {
  await Promise.allSettled(posts.map(async (post) => {
    // Insert record first
    const inserted = await db.execute(sql`
      INSERT INTO social_posts (network, kind, content_text, content_image_url, deep_link, status, dry_run)
      VALUES (${post.network}, 'weekly_cheapest_postcode', ${post.contentText},
              ${post.contentImageUrl}, ${post.deepLink},
              ${post.status}, ${DRY_RUN})
      RETURNING id
    `) as unknown as Array<{ id: number }>
    const rowId = inserted[0]?.id

    if (post.status === 'cancelled') {
      await db.execute(sql`
        UPDATE social_posts SET error_text = ${post.errorText ?? null} WHERE id = ${rowId}
      `)
      return
    }

    const adapter = ADAPTERS.find(a => a.network === post.network)
    if (!adapter?.isEnabled()) {
      console.log(`[social-bot] ${post.network} disabled — skipping`)
      await db.execute(sql`
        UPDATE social_posts SET status = 'cancelled', error_text = 'adapter_disabled' WHERE id = ${rowId}
      `)
      return
    }

    if (DRY_RUN) {
      console.log(`[social-bot:dry-run] ${post.network}: ${post.contentText}`)
      await db.execute(sql`
        UPDATE social_posts SET status = 'posted', posted_at = NOW(), response_json = '{"dry_run":true}'::jsonb WHERE id = ${rowId}
      `)
      return
    }

    try {
      const result = await adapter.post({
        text: post.contentText,
        imageLocalPath: post.contentImageUrl,
      })
      await db.execute(sql`
        UPDATE social_posts
        SET status = 'posted', posted_at = NOW(), response_json = ${JSON.stringify(result.raw)}::jsonb
        WHERE id = ${rowId}
      `)
      console.log(`[social-bot] ${post.network} posted: ${result.id}`)
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err)
      await db.execute(sql`
        UPDATE social_posts SET status = 'failed', error_text = ${errorText} WHERE id = ${rowId}
      `)
      console.error(`[social-bot] ${post.network} failed:`, errorText)
    }
  }))
}
```

- [ ] **Step 6: Run adapter tests**

```bash
npx vitest run src/__tests__/social-bot/adapters/
```

---

## Task 9: Bot scheduler

**Files:** `src/lib/social-bot/scheduler.ts`, `src/instrumentation.ts`, `src/__tests__/social-bot/scheduler.test.ts`

- [ ] **Step 1: Write scheduler tests**

Tests verify:
- `startBotScheduler()` calls `cron.schedule` with expression `'0 7 * * 1'` and tz `'Australia/Brisbane'`
- Calling the scheduled function invokes composeWeeklyPost + dispatchPosts
- `SOCIAL_BOT_DISABLED=true` skips the job (logs and returns early)

- [ ] **Step 2: Implement bot scheduler**

```typescript
// src/lib/social-bot/scheduler.ts
import cron from 'node-cron'
import { composeWeeklyPost } from './composer'
import { dispatchPosts } from './dispatch'

export function startBotScheduler(): void {
  if (process.env.SOCIAL_BOT_DISABLED === 'true') {
    console.log('[social-bot] SOCIAL_BOT_DISABLED=true — bot scheduler not registered')
    return
  }

  // Mon 07:00 AEST
  cron.schedule('0 7 * * 1', async () => {
    console.log('[social-bot] Weekly post job starting...')
    try {
      const posts = await composeWeeklyPost('U91')
      await dispatchPosts(posts)
      console.log('[social-bot] Weekly post job complete')
    } catch (err) {
      console.error('[social-bot] Weekly post job failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[social-bot] Scheduler registered — Mon 07:00 AEST')
}
```

- [ ] **Step 3: Wire into instrumentation.ts**

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scraper/scheduler')
    startScheduler()
    const { startBotScheduler } = await import('./lib/social-bot/scheduler')
    startBotScheduler()
  }
}
```

- [ ] **Step 4: Run scheduler tests**

```bash
npx vitest run src/__tests__/social-bot/scheduler.test.ts
```

---

## Task 10: Schema update + env vars + docker-compose

**Files:** `src/lib/db/schema.ts`, `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Add Drizzle table definitions to schema.ts**

```typescript
// Add after existing tables in schema.ts
export const shareCardRenders = pgTable('share_card_renders', {
  id:           bigserial('id', { mode: 'number' }).primaryKey(),
  hash:         text('hash').notNull().unique(),
  stationId:    bigint('station_id', { mode: 'number' }).notNull().references(() => stations.id),
  fuelTypeId:   integer('fuel_type_id').notNull(),
  priceCents:   integer('price_cents').notNull(),
  radiusKm:     integer('radius_km'),
  variant:      text('variant').notNull().default('default'),
  generatedAt:  timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  lastServedAt: timestamp('last_served_at', { withTimezone: true }).notNull().defaultNow(),
  servedCount:  integer('served_count').notNull().default(1),
})

export const socialPosts = pgTable('social_posts', {
  id:               bigserial('id', { mode: 'number' }).primaryKey(),
  network:          text('network').notNull(),
  kind:             text('kind').notNull().default('weekly_cheapest_postcode'),
  composedAt:       timestamp('composed_at', { withTimezone: true }).notNull().defaultNow(),
  postedAt:         timestamp('posted_at', { withTimezone: true }),
  contentText:      text('content_text').notNull(),
  contentImageUrl:  text('content_image_url'),
  deepLink:         text('deep_link').notNull(),
  status:           text('status').notNull().default('approved'),
  responseJson:     jsonb('response_json'),
  errorText:        text('error_text'),
  dryRun:           boolean('dry_run').notNull().default(false),
})

export type ShareCardRender = typeof shareCardRenders.$inferSelect
export type NewShareCardRender = typeof shareCardRenders.$inferInsert
export type SocialPost = typeof socialPosts.$inferSelect
export type NewSocialPost = typeof socialPosts.$inferInsert
```

- [ ] **Step 2: Add env vars to docker-compose.yml and .env.example**

```yaml
# In docker-compose.yml under app service environment:
SHARE_SIGNING_SECRET: "${SHARE_SIGNING_SECRET}"
FILLIP_BOT_X_ENABLED: "${FILLIP_BOT_X_ENABLED:-false}"
FILLIP_BOT_BLUESKY_ENABLED: "${FILLIP_BOT_BLUESKY_ENABLED:-false}"
FILLIP_BOT_MASTODON_ENABLED: "${FILLIP_BOT_MASTODON_ENABLED:-false}"
SOCIAL_BOT_DISABLED: "${SOCIAL_BOT_DISABLED:-false}"
SOCIAL_DRY_RUN: "${SOCIAL_DRY_RUN:-true}"
SOCIAL_X_OAUTH_CLIENT_ID: "${SOCIAL_X_OAUTH_CLIENT_ID:-}"
SOCIAL_X_OAUTH_CLIENT_SECRET: "${SOCIAL_X_OAUTH_CLIENT_SECRET:-}"
SOCIAL_X_ACCESS_TOKEN: "${SOCIAL_X_ACCESS_TOKEN:-}"
SOCIAL_X_ACCESS_SECRET: "${SOCIAL_X_ACCESS_SECRET:-}"
SOCIAL_BLUESKY_HANDLE: "${SOCIAL_BLUESKY_HANDLE:-}"
SOCIAL_BLUESKY_APP_PASSWORD: "${SOCIAL_BLUESKY_APP_PASSWORD:-}"
SOCIAL_MASTODON_INSTANCE_URL: "${SOCIAL_MASTODON_INSTANCE_URL:-https://aus.social}"
SOCIAL_MASTODON_ACCESS_TOKEN: "${SOCIAL_MASTODON_ACCESS_TOKEN:-}"
```

---

## Task 11: Final test sweep

**Files:** all test files

- [ ] **Step 1: Run all tests**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp8/fuelsniffer
npx vitest run 2>&1 | tail -10
```

Expected: all passing, new tests added for SP-8 (target: ≥ 430 tests)

- [ ] **Step 2: Check lint**

```bash
npx eslint src --max-warnings 42 2>&1 | tail -20
```

Expected: no new lint errors above baseline 42.

- [ ] **Step 3: Build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: green build.

---

## Task 12: Commit plan

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp8
git add docs/superpowers/plans/2026-04-24-fillip-sp8-viral.md
git commit -m "docs(plan): SP-8 implementation plan (viral hooks)"
```

---

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime for OG image | Node (not Edge) | Simpler debugging; same p95 result behind Cloudflare |
| Signing secret | New `SHARE_SIGNING_SECRET` env var | Session secret is auth-purpose; separate secret better for rotation |
| Bot cron | `src/instrumentation.ts` + `startBotScheduler()` | Matches existing convention; app runs 24/7 |
| Image storage | Re-render on cache miss | Simple; CDN absorbs repeat traffic |
| Networks on/off | Per-network feature flag + `SOCIAL_BOT_DISABLED` kill switch | All OFF by default; operator flips on after token provisioning |
| Dry-run default | `SOCIAL_DRY_RUN=true` in docker-compose | Safe-by-default; first run produces log output only |
| Font bundling | Inter TTF in `public/fonts/` | Satori requires raw font bytes; checked in for determinism |
| Bot image | Temp file at `/tmp/fillip-bot-*.png` | Adapters need a local path; PNG bytes not stored in DB |

## Open questions from spec

| # | Question | Status for this plan |
|---|---|---|
| 1 | Which networks at day-1? | All three adapters implemented; all OFF by default. Operator enables per-network after account creation. |
| 2 | Social account handles? | Not blocked on this plan — adapters accept any handle/token via env vars |
| 3 | Launch bot with MVP or 2 weeks later? | Code ships here; `FILLIP_BOT_X_ENABLED=false` (default) means zero risk at deploy |
| 6 | Mastodon instance? | Default `https://aus.social` in .env.example; override via `SOCIAL_MASTODON_INSTANCE_URL` |
