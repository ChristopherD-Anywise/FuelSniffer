# FuelSniffer UI Redesign — Direction B (High-Vis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the FuelSniffer dashboard to the "High-Vis / Petrol Station" design direction — dark background, amber (#f59e0b) accent, bold white prices, ranked station list, stat bar, SVG bottom-nav, and two non-intrusive ad slots (between-card list injection after row 3, and a banner on the station detail popup).

**Architecture:** All changes are purely presentational — no API, database, or routing changes. We replace Tailwind class names and inline styles throughout the existing component tree, introduce a new `AdCard` component that StationList injects between rows, and update the map's cluster/pin colour scheme to match the new palette. A new `globals.css` design token layer sets the dark background and removes the white/slate base. The ad slots use `window.adsbygoogle` (Google AdSense) — the script tag is added to the root layout; if AdSense is not yet configured the slots render empty divs gracefully.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Leaflet + leaflet.markercluster, Recharts, TypeScript 5

**Working directory:** `fuelsniffer/` — all paths below are relative to this directory.

---

## Design System Reference

Keep these constants in your head throughout. Every colour decision maps back to this table.

| Token | Value | Use |
|---|---|---|
| `bg-base` | `#111111` | Page / component background |
| `bg-surface` | `#1a1a1a` | Cards, filter bar, stat bar |
| `bg-border` | `#2a2a2a` | Dividers, borders |
| `amber` | `#f59e0b` | Active states, borders, rank #1, live badge, tab underline |
| `text-primary` | `#ffffff` | Station names, large prices |
| `text-muted` | `#555555` | Labels, meta, secondary text |
| `price-cheap` | `#22c55e` | Cheapest prices / positive delta |
| `price-mid` | `#f59e0b` | Mid-range prices |
| `price-dear` | `#ef4444` | Expensive prices / negative delta |
| `rank-1-bg` | `#f59e0b` | Rank badge background for #1 |
| `rank-other-bg` | `#2a2a2a` | Rank badge background for #2+ |

**Typography rule:** All price numbers must be `font-weight: 900` (Tailwind: `font-black`) and `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`). Station names are `font-bold`. Labels/meta are `font-bold text-xs uppercase tracking-wider`.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/app/globals.css` | Modify | Add dark base background, remove white default, Tailwind layer for design tokens |
| `src/app/layout.tsx` | Modify | Add AdSense `<Script>` tag |
| `src/components/FilterBar.tsx` | Modify | Full restyle — dark bg, amber border, fuel tabs replacing select + sort buttons, SVG icons |
| `src/components/FuelSelect.tsx` | Replace | Replaced by inline tab row in FilterBar (no longer a standalone component) |
| `src/components/StationCard.tsx` | Modify | Dark bg, rank badge, bold white prices, amber/green delta, larger touch target |
| `src/components/StationList.tsx` | Modify | Inject `<AdCard>` after row index 2 (= after the 3rd station) |
| `src/components/AdCard.tsx` | Create | Google AdSense banner card, styled to match station card height |
| `src/components/StationPopup.tsx` | Modify | Dark theme, amber accents, ad banner slot between fuel list and chart |
| `src/components/MapView.tsx` | Modify | Cluster icon colour `#f59e0b` amber, user location dot amber, pin label colour unchanged (already HSL green→red) |
| `src/app/dashboard/DashboardClient.tsx` | Modify | Dark bg wrapper, stat bar restyle, bottom nav (mobile), remove `isMobileMapVisible` toggle button (replaced by bottom nav) |
| `src/components/DistanceSlider.tsx` | No change | Already correct from previous PR |
| `src/components/LocationSearch.tsx` | No change | Styling will inherit from FilterBar dark theme |
| `src/lib/map-utils.ts` | No change | HSL green→red is correct |

---

## Task 1: Dark base — globals.css + layout

**Goal:** Set the dark background across the whole app so every component starts from the correct base rather than white.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Read current globals.css**

```bash
cat src/app/globals.css
```

- [ ] **Step 2: Replace globals.css content**

The current file sets white background on body. Replace it entirely with:

```css
@import "tailwindcss";

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
  background: #111111;
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Leaflet popup — dark theme override */
.leaflet-popup-content-wrapper {
  background: #1a1a1a !important;
  border: 1px solid #2a2a2a !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6) !important;
}

.leaflet-popup-tip {
  background: #1a1a1a !important;
}

.leaflet-popup-close-button {
  color: #555555 !important;
}

/* Station list scrollbar */
.station-list::-webkit-scrollbar {
  width: 4px;
}
.station-list::-webkit-scrollbar-track {
  background: #111111;
}
.station-list::-webkit-scrollbar-thumb {
  background: #2a2a2a;
  border-radius: 2px;
}
```

- [ ] **Step 3: Read current layout.tsx**

```bash
cat src/app/layout.tsx
```

- [ ] **Step 4: Add AdSense script to layout.tsx**

Find the `<head>` section (or `<body>`) and add the `next/script` import and AdSense tag. The `data-ad-client` value is a placeholder — the user will replace it when they get their AdSense publisher ID.

The file currently imports metadata and renders `{children}`. Add the Script import and the tag. Example — adapt to the actual file structure you see:

```tsx
import Script from 'next/script'

// Inside the <html> or <body> element, add:
<Script
  async
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-REPLACE_WITH_YOUR_PUBLISHER_ID"
  crossOrigin="anonymous"
  strategy="lazyOnload"
/>
```

> **Note:** `strategy="lazyOnload"` means AdSense loads after the page is interactive — it will not block rendering.

- [ ] **Step 5: Verify the app compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` (or equivalent). Fix any TypeScript errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: dark base theme + AdSense script tag"
```

---

## Task 2: FilterBar — dark header with amber fuel tabs

**Goal:** Replace the white sticky header with a dark `#111` header, amber bottom border, horizontal scrollable fuel type tabs (replacing the `<select>` element), and SVG icons for the bottom nav actions. Keep all existing props and callbacks — only the visual output changes.

**Files:**
- Modify: `src/components/FilterBar.tsx`

**Critical context:** `FilterBar` currently renders TWO separate trees — one for `md:` desktop and one for mobile. In the new design there is a single unified top bar (the design is the same at all breakpoints — fuel tabs scroll horizontally on both). The mobile-only "Map/List" toggle button will be removed from this component because navigation will be handled by the bottom nav in `DashboardClient` (Task 5). Keep all props in the interface — just don't render `isMobileMapVisible` / `onToggleMobileMap` from this component any more (the props stay so `DashboardClient` doesn't need changes yet).

- [ ] **Step 1: Write the new FilterBar.tsx**

Replace the entire file with:

```tsx
'use client'

import FuelSelect from '@/components/FuelSelect'
import DistanceSlider from '@/components/DistanceSlider'
import LocationSearch from '@/components/LocationSearch'

interface FilterBarProps {
  activeFuel: string
  radius: number
  onFuelChange: (id: string) => void
  onRadiusChange: (km: number) => void
  sortMode: 'price' | 'distance'
  onSortChange: (mode: 'price' | 'distance') => void
  isMobileMapVisible: boolean
  onToggleMobileMap: () => void
  onLocateMe?: () => void
  locationStatus?: 'idle' | 'loading' | 'active' | 'denied'
  onLocationSelect?: (location: { lat: number; lng: number; label: string }) => void
}

// Fuel tab labels — short versions for the tab row
const FUEL_TABS = [
  { id: '2',  label: 'ULP 91' },
  { id: '5',  label: 'PULP 95' },
  { id: '8',  label: 'PULP 98' },
  { id: '12', label: 'E10' },
  { id: '3',  label: 'Diesel' },
  { id: '14', label: 'Prem Diesel' },
  { id: '4',  label: 'LPG' },
]

export default function FilterBar({
  activeFuel,
  onFuelChange,
  radius,
  onRadiusChange,
  sortMode,
  onSortChange,
  onLocateMe,
  locationStatus = 'idle',
  onLocationSelect,
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-20 flex-shrink-0">
      {/* ── Top bar ── */}
      <div
        style={{ background: '#111111', borderBottom: '3px solid #f59e0b' }}
        className="flex items-center justify-between px-4 h-[52px]"
      >
        {/* Logo */}
        <span className="text-lg font-black uppercase tracking-tight text-white">
          FUEL<span style={{ color: '#f59e0b' }}>SNIFFER</span>
        </span>

        <div className="flex items-center gap-2">
          {/* Location search */}
          {onLocationSelect && (
            <LocationSearch onSelect={onLocationSelect} />
          )}

          {/* Locate me */}
          {onLocateMe && (
            <button
              onClick={onLocateMe}
              style={{
                background: locationStatus === 'active' ? 'rgba(245,158,11,0.15)' : '#1a1a1a',
                border: `1px solid ${locationStatus === 'active' ? '#f59e0b' : '#2a2a2a'}`,
                color: locationStatus === 'active' ? '#f59e0b' : '#888888',
              }}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
              title={locationStatus === 'active' ? 'Clear location' : 'Use my location'}
            >
              {/* Crosshair / location icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              </svg>
            </button>
          )}

          {/* Radius slider */}
          <DistanceSlider value={radius} onChange={onRadiusChange} />

          {/* Sort toggle */}
          <div
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            className="flex items-center rounded-lg p-0.5 shrink-0"
          >
            {(['price', 'distance'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onSortChange(mode)}
                style={{
                  background: sortMode === mode ? '#f59e0b' : 'transparent',
                  color: sortMode === mode ? '#000000' : '#666666',
                }}
                className="h-7 px-3 rounded-md text-xs font-bold uppercase tracking-wide transition-all"
              >
                {mode === 'price' ? 'Price' : 'Near'}
              </button>
            ))}
          </div>

          {/* Live badge */}
          <span
            style={{ background: '#f59e0b', color: '#000000' }}
            className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded"
          >
            LIVE
          </span>
        </div>
      </div>

      {/* ── Fuel type tab row ── */}
      <div
        style={{ background: '#1a1a1a', borderBottom: '2px solid #2a2a2a' }}
        className="flex overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {FUEL_TABS.map((fuel) => (
          <button
            key={fuel.id}
            onClick={() => onFuelChange(fuel.id)}
            style={{
              borderBottom: activeFuel === fuel.id ? '3px solid #f59e0b' : '3px solid transparent',
              color: activeFuel === fuel.id ? '#f59e0b' : '#555555',
              marginBottom: '-2px',
            }}
            className="flex-shrink-0 px-5 py-3 text-[13px] font-black uppercase tracking-wide transition-colors whitespace-nowrap"
          >
            {fuel.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Important notes on this implementation:**
- `FUEL_TABS` is defined locally in FilterBar — it mirrors `FUEL_TYPES` from `FuelSelect` but with shorter display labels for the tab row. The existing `FuelSelect` component is NOT deleted — it is simply no longer rendered by FilterBar. `DashboardClient` uses `FUEL_TYPES` from `FuelSelect` for the `fuelLabel()` helper and that must remain.
- The `isMobileMapVisible` and `onToggleMobileMap` props are kept in the interface but not rendered — this avoids breaking `DashboardClient`'s prop usage until Task 5 replaces the mobile nav.
- The `style={{ scrollbarWidth: 'none' }}` on the fuel tab div — there is a TypeScript quirk where `style` is declared twice. Fix by merging: use `className="flex overflow-x-auto [scrollbar-width:none]"` and remove the second `style` attribute.

- [ ] **Step 2: Fix the duplicate style attribute**

The code above has a bug — two `style` attributes on the fuel tab row div. Fix it:

```tsx
<div
  style={{ background: '#1a1a1a', borderBottom: '2px solid #2a2a2a' }}
  className="flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
>
```

Remove the second `style={{ scrollbarWidth: 'none' }}` line.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If you see errors about `isMobileMapVisible` being unused — that's fine, TypeScript won't complain about unused props that are defined in the interface.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterBar.tsx
git commit -m "feat: restyle FilterBar — dark header, amber fuel tabs, SVG icons"
```

---

## Task 3: StationCard + StationList — dark cards with rank badges

**Goal:** Restyle each station card to the dark High-Vis design: dark background, rank badge (gold #1, grey for others), large bold white price number, green/red 7-day delta, amber selected state. Inject an `<AdCard>` after the 3rd station in the list.

**Files:**
- Modify: `src/components/StationCard.tsx`
- Modify: `src/components/StationList.tsx`
- Create: `src/components/AdCard.tsx`

### 3a. Create AdCard.tsx

- [ ] **Step 1: Create src/components/AdCard.tsx**

```tsx
'use client'

import { useEffect, useRef } from 'react'

/**
 * Google AdSense banner card.
 * Renders a 320x50 mobile banner ad slot.
 * Falls back to an empty div if AdSense is not configured.
 *
 * The data-ad-slot value must be replaced with a real Ad Unit ID
 * from the user's AdSense account (https://adsense.google.com).
 */
export default function AdCard() {
  const adRef = useRef<HTMLDivElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    if (pushed.current) return
    pushed.current = true
    try {
      // @ts-expect-error — adsbygoogle is injected by the AdSense script
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense not loaded — silently ignore
    }
  }, [])

  return (
    <div
      ref={adRef}
      style={{
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        minHeight: '68px',
      }}
    >
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
```

- [ ] **Step 2: Run the test suite to confirm nothing is broken**

```bash
npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: same pass/fail count as before this task. The pre-existing 2 failures in `prices-api.test.ts` are known and unrelated.

### 3b. Restyle StationCard.tsx

The card currently uses `bg-sky-50/80` for selected state and `hover:bg-slate-50`. We're replacing the entire Tailwind class approach with inline styles for precise colour control (Tailwind purge can sometimes strip dynamically-constructed class strings).

- [ ] **Step 3: Replace StationCard.tsx**

```tsx
'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationCardProps {
  station: PriceResult
  isSelected: boolean
  onClick: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  rank: number  // 1-based position in the sorted list
}

export default function StationCard({ station, isSelected, onClick, cardRef, rank }: StationCardProps) {
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const price = parseFloat(station.price_cents)
  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'
  const change = station.price_change != null ? Number(station.price_change) : null

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderBottom: '1px solid #1a1a1a',
        borderLeft: isSelected ? '3px solid #f59e0b' : '3px solid transparent',
        paddingLeft: isSelected ? '13px' : '16px',
        background: isSelected ? '#1a0d00' : '#111111',
        cursor: 'pointer',
        transition: 'background 0.1s',
        minHeight: '64px',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#1a1a1a'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#111111'
      }}
    >
      {/* Rank badge */}
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '6px',
          background: rank === 1 ? '#f59e0b' : '#2a2a2a',
          color: rank === 1 ? '#000000' : '#888888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {rank}
      </div>

      {/* Station info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#ffffff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginBottom: '2px',
        }}>
          {station.name}
        </div>
        <div style={{ fontSize: '11px', color: '#555555' }}>
          {station.distance_km.toFixed(1)} km · {ago}
        </div>
      </div>

      {/* Price column */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: '24px',
          fontWeight: 900,
          fontVariantNumeric: 'tabular-nums',
          color: '#ffffff',
          lineHeight: 1,
          marginBottom: '3px',
        }}>
          {price.toFixed(1)}<span style={{ fontSize: '13px', color: '#555555', fontWeight: 600 }}>¢</span>
        </div>
        {change !== null && change !== 0 && (
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: change < 0 ? '#22c55e' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '2px',
          }}>
            <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
              {change < 0
                ? <path d="M5 8L1.5 3H8.5L5 8Z" />
                : <path d="M5 2L8.5 7H1.5L5 2Z" />
              }
            </svg>
            {Math.abs(change).toFixed(1)}¢ / 7d
          </div>
        )}
      </div>
    </div>
  )
}
```

**Key change:** `StationCard` now accepts a `rank` prop (number). `StationList` must pass this. Note: `change < 0` = price went DOWN = good = green. `change > 0` = price went UP = bad = red. The existing code had this correct; double-check the triangle direction: down-triangle for decrease, up-triangle for increase.

### 3c. Update StationList.tsx

- [ ] **Step 4: Replace StationList.tsx**

```tsx
'use client'

import StationCard from '@/components/StationCard'
import AdCard from '@/components/AdCard'
import type { PriceResult } from '@/lib/db/queries/prices'

interface StationListProps {
  stations: PriceResult[]
  selectedId: number | null
  onSelect: (id: number) => void
  cardRefsMap?: Map<number, HTMLElement>
}

/**
 * Ad is injected after the 3rd station (index 2).
 * If there are 3 or fewer stations, no ad is shown.
 */
const AD_AFTER_INDEX = 2

export default function StationList({ stations, selectedId, onSelect, cardRefsMap }: StationListProps) {
  return (
    <div className="overflow-y-auto" style={{ background: '#111111' }}>
      {stations.map((station, index) => (
        <>
          <StationCard
            key={station.id}
            station={station}
            isSelected={station.id === selectedId}
            onClick={() => onSelect(station.id)}
            rank={index + 1}
            cardRef={cardRefsMap ? (el) => {
              if (el) cardRefsMap.set(station.id, el)
              else cardRefsMap.delete(station.id)
            } : undefined}
          />
          {index === AD_AFTER_INDEX && stations.length > AD_AFTER_INDEX + 1 && (
            <AdCard key="ad-card" />
          )}
        </>
      ))}
    </div>
  )
}
```

**Note on React key warning:** Wrapping in a Fragment with the station card and ad card will cause a React key warning because the Fragment itself needs a key. Fix by using `React.Fragment` with an explicit key:

```tsx
import React from 'react'
// ...
{stations.map((station, index) => (
  <React.Fragment key={station.id}>
    <StationCard ... />
    {index === AD_AFTER_INDEX && stations.length > AD_AFTER_INDEX + 1 && (
      <AdCard />
    )}
  </React.Fragment>
))}
```

- [ ] **Step 5: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If you see `Property 'rank' does not exist on type 'StationCardProps'` — you forgot to add `rank` to the interface in StationCard.tsx.

- [ ] **Step 6: Commit**

```bash
git add src/components/AdCard.tsx src/components/StationCard.tsx src/components/StationList.tsx
git commit -m "feat: dark station cards with rank badges + AdCard injection after row 3"
```

---

## Task 4: StationPopup — dark theme + ad banner slot

**Goal:** Restyle the map popup to match the dark design. Replace the sky-blue chart line and button colours with amber/dark. Add a Google AdSense banner between the "Other fuels" table and the sparkline chart.

**Files:**
- Modify: `src/components/StationPopup.tsx`

The popup currently renders inline `style` objects (not Tailwind classes) because Leaflet mounts it outside the React tree in a DOM container. Keep using inline styles for this component.

- [ ] **Step 1: Replace StationPopup.tsx**

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { format, formatDistanceToNowStrict } from 'date-fns'
import type { PriceResult } from '@/lib/db/queries/prices'

interface ChartPoint {
  time: number
  label: string
  avg: number
}

const TIME_RANGES = [
  { hours: 24,  label: '24h' },
  { hours: 72,  label: '3d' },
  { hours: 168, label: '7d' },
] as const

interface StationPopupProps {
  station: PriceResult
  fuelId: string
}

/** Push a single AdSense ad unit. Called once per popup mount. */
function PopupAdBanner() {
  const pushed = useRef(false)
  useEffect(() => {
    if (pushed.current) return
    pushed.current = true
    try {
      // @ts-expect-error — adsbygoogle injected by script tag
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense not loaded
    }
  }, [])

  return (
    <div style={{ margin: '10px 0', display: 'flex', justifyContent: 'center' }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '300px', height: '50px' }}
        data-ad-client="ca-pub-REPLACE_WITH_YOUR_PUBLISHER_ID"
        data-ad-slot="REPLACE_WITH_YOUR_AD_SLOT_ID_2"
        data-ad-format="banner"
        data-full-width-responsive="false"
      />
    </div>
  )
}

export default function StationPopup({ station, fuelId }: StationPopupProps) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [hours, setHours] = useState(168)

  const price = parseFloat(station.price_cents)
  const priceTime = station.source_ts ? new Date(station.source_ts) : new Date(station.recorded_at)
  const ago = formatDistanceToNowStrict(priceTime, { addSuffix: false }) + ' ago'
  const addr = station.address || ''
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`
  const appleUrl  = `https://maps.apple.com/?daddr=${station.latitude},${station.longitude}`

  useEffect(() => {
    setLoading(true)
    fetch(`/api/prices/history?station=${station.id}&fuel=${fuelId}&hours=${hours}`)
      .then(r => r.json())
      .then((rows: Array<{ bucket: string; avg_price: string | number }>) => {
        setData(rows.map(r => ({
          time:  new Date(r.bucket).getTime(),
          label: format(new Date(r.bucket), 'EEE HH:mm'),
          avg:   Number(r.avg_price),
        })))
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [station.id, fuelId, hours])

  const domain: [number, number] = data.length > 0
    ? [Math.floor(Math.min(...data.map(d => d.avg)) - 2), Math.ceil(Math.max(...data.map(d => d.avg)) + 2)]
    : [0, 300]

  const periodChange = data.length >= 2 ? price - data[0].avg : null
  const periodLabel  = TIME_RANGES.find(t => t.hours === hours)?.label ?? '7d'

  const styles = {
    root:       { fontFamily: 'Inter, system-ui, sans-serif', width: 300, padding: 4, color: '#ffffff' },
    priceRow:   { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 },
    priceBig:   { fontSize: 32, fontWeight: 900, color: '#ffffff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' } as React.CSSProperties,
    priceUnit:  { fontSize: 14, color: '#555555', fontWeight: 500 },
    ago:        { fontSize: 12, color: '#555555', marginLeft: 'auto' },
    changeLine: (up: boolean) => ({ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, marginBottom: 8, color: up ? '#ef4444' : '#22c55e' }),
    name:       { fontSize: 15, fontWeight: 700, color: '#ffffff', marginBottom: 1 },
    brand:      { fontSize: 12, color: '#555555' },
    addr:       { fontSize: 13, color: '#888888', marginBottom: 10 },
    pills:      { display: 'flex', gap: 4, marginBottom: 6 },
    pill:       (active: boolean) => ({
                  padding: '3px 10px', borderRadius: 12,
                  border: `1px solid ${active ? '#f59e0b' : '#2a2a2a'}`,
                  background: active ? '#f59e0b' : '#1a1a1a',
                  color: active ? '#000000' : '#555555',
                  fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer',
                }),
    chartWrap:  { marginBottom: 10 },
    chartEmpty: { height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#555555' },
    btnRow:     { display: 'flex', gap: 8, marginTop: 4 },
    btnGoogle:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0',
                  background: '#f59e0b', color: '#000000', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' },
    btnApple:   { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 0',
                  background: '#1a1a1a', color: '#ffffff', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' },
  } as const

  return (
    <div style={styles.root}>
      {/* Price + time */}
      <div style={styles.priceRow}>
        <span style={styles.priceBig}>{price.toFixed(1)}</span>
        <span style={styles.priceUnit}>¢/L</span>
        <span style={styles.ago}>{ago}</span>
      </div>

      {/* Period change */}
      {periodChange !== null && (
        <div style={styles.changeLine(periodChange > 0)}>
          {periodChange !== 0 && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              {periodChange > 0
                ? <path d="M6 2L10 8H2L6 2Z" />
                : <path d="M6 10L2 4H10L6 10Z" />
              }
            </svg>
          )}
          <span>
            {periodChange === 0
              ? `No change / ${periodLabel}`
              : `${Math.abs(periodChange).toFixed(1)}¢ / ${periodLabel}`
            }
          </span>
        </div>
      )}

      {/* Station info */}
      <div style={styles.name}>{station.name}</div>
      {station.brand && <div style={styles.brand}>{station.brand}</div>}
      <div style={styles.addr}>{addr}</div>

      {/* Ad banner — between info and chart */}
      <PopupAdBanner />

      {/* Time range pills */}
      <div style={styles.pills}>
        {TIME_RANGES.map(t => (
          <button key={t.hours} onClick={() => setHours(t.hours)} style={styles.pill(hours === t.hours)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={styles.chartWrap}>
        {loading ? (
          <div style={styles.chartEmpty}>Loading...</div>
        ) : data.length === 0 ? (
          <div style={styles.chartEmpty}>Not enough history yet</div>
        ) : (
          <AreaChart width={292} height={120} data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id={`pg-${station.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#555555' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={domain} tick={{ fontSize: 10, fill: '#555555' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}¢`} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as ChartPoint
              return (
                <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '6px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                  <div style={{ fontWeight: 600, color: '#ffffff' }}>{format(new Date(d.time), 'EEE d MMM, HH:mm')}</div>
                  <div style={{ color: '#f59e0b', marginTop: 2 }}>{d.avg.toFixed(1)}¢/L</div>
                </div>
              )
            }} />
            <Area
              type="monotone"
              dataKey="avg"
              stroke="#f59e0b"
              strokeWidth={2}
              fill={`url(#pg-${station.id})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 2, fill: '#111111', stroke: '#f59e0b' }}
            />
          </AreaChart>
        )}
      </div>

      {/* Nav buttons */}
      <div style={styles.btnRow}>
        <a href={googleUrl} target="_blank" rel="noopener" style={styles.btnGoogle}>Google Maps</a>
        <a href={appleUrl}  target="_blank" rel="noopener" style={styles.btnApple}>Apple Maps</a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/StationPopup.tsx
git commit -m "feat: dark StationPopup with amber chart + ad banner slot"
```

---

## Task 5: DashboardClient — dark layout, stat bar, bottom nav (mobile)

**Goal:** Update the main layout wrapper to dark background, restyle the stat bar to match the High-Vis design (big numbers, amber/green colouring), and replace the mobile Map/List toggle button with a bottom navigation bar (Map / List / Trends icons).

**Files:**
- Modify: `src/app/dashboard/DashboardClient.tsx`

**Context on current structure:**
- `DashboardClient` renders `FilterBar` → stat bar → content area (list + map side-by-side on desktop, toggled on mobile).
- On mobile, `isMobileMapVisible` controls which panel is shown. The current toggle is a button inside `FilterBar`. We're moving that toggle to a bottom nav bar inside `DashboardClient`.
- The `isMobileMapVisible` state and `onToggleMobileMap` callback still exist — we just render the bottom nav ourselves instead of delegating to FilterBar.

- [ ] **Step 1: Replace DashboardClient.tsx**

```tsx
'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FilterBar from '@/components/FilterBar'
import { FUEL_TYPES } from '@/components/FuelSelect'
import StationList from '@/components/StationList'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import { sortStations } from '@/lib/dashboard-utils'
import type { PriceResult } from '@/lib/db/queries/prices'
import type { SortMode } from '@/lib/dashboard-utils'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

function fuelLabel(id: string): string {
  return FUEL_TYPES.find(f => f.id === id)?.label ?? id
}

/** Map icon — simple outlined map/compass */
function IconMap({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#f59e0b' : '#555555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/>
      <line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  )
}

/** List icon — three horizontal lines */
function IconList({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#f59e0b' : '#555555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <circle cx="3" cy="6" r="1" fill={active ? '#f59e0b' : '#555555'} stroke="none"/>
      <circle cx="3" cy="12" r="1" fill={active ? '#f59e0b' : '#555555'} stroke="none"/>
      <circle cx="3" cy="18" r="1" fill={active ? '#f59e0b' : '#555555'} stroke="none"/>
    </svg>
  )
}

/** Trends icon — line chart upward */
function IconTrends({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#f59e0b' : '#555555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}

type MobileTab = 'map' | 'list' | 'trends'

export default function DashboardClient() {
  const params = useSearchParams()
  const router = useRouter()

  const activeFuel  = params.get('fuel')   ?? '2'
  const radius      = parseInt(params.get('radius') ?? '20', 10)
  const sortMode    = (params.get('sort') ?? 'price') as SortMode

  const [stations,         setStations]         = useState<PriceResult[]>([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState(false)
  const [selectedId,       setSelectedId]       = useState<number | null>(null)
  const [mobileTab,        setMobileTab]        = useState<MobileTab>('map')
  const [userLocation,     setUserLocation]     = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus,   setLocationStatus]   = useState<'idle' | 'loading' | 'active' | 'denied'>('idle')

  const cardRefsMap = useRef<Map<number, HTMLElement>>(new Map())

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      let url = `/api/prices?fuel=${activeFuel}&radius=${radius}`
      if (userLocation) url += `&lat=${userLocation.lat}&lng=${userLocation.lng}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('API error')
      const data: PriceResult[] = await res.json()
      setStations(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeFuel, radius, userLocation])

  useEffect(() => { fetchPrices() }, [fetchPrices])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.replace(`/dashboard?${next.toString()}`)
  }

  function handleRadiusChange(km: number) {
    updateParam('radius', String(km))
  }

  function handleCardSelect(id: number) {
    setSelectedId(prev => prev === id ? null : id)
    // On mobile, switch to map tab when a card is tapped
    setMobileTab('map')
  }

  function handlePinClick(id: number) {
    setSelectedId(prev => prev === id ? null : id)
  }

  function handleLocationSelect(location: { lat: number; lng: number; label: string }) {
    setUserLocation({ lat: location.lat, lng: location.lng })
    setLocationStatus('active')
  }

  function handleLocateMe() {
    if (locationStatus === 'loading') return
    if (locationStatus === 'active') {
      setUserLocation(null)
      setLocationStatus('idle')
      return
    }
    setLocationStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationStatus('active')
      },
      () => {
        setLocationStatus('denied')
        setTimeout(() => setLocationStatus('idle'), 3000)
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }

  const sortedStations = sortStations(stations, sortMode)
  const cheapest   = sortedStations.length > 0 ? parseFloat(sortedStations[0].price_cents) : null
  const dearest    = sortedStations.length > 0 ? parseFloat(sortedStations[sortedStations.length - 1].price_cents) : null
  const avg        = sortedStations.length > 0
    ? sortedStations.reduce((s, st) => s + parseFloat(st.price_cents), 0) / sortedStations.length
    : null
  const stationCount = sortedStations.length

  // isMobileMapVisible is derived from mobileTab for backwards-compat with FilterBar prop
  const isMobileMapVisible = mobileTab === 'map'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#111111' }}>
      <FilterBar
        activeFuel={activeFuel}
        radius={radius}
        onFuelChange={id => updateParam('fuel', id)}
        onRadiusChange={handleRadiusChange}
        sortMode={sortMode}
        onSortChange={mode => updateParam('sort', mode)}
        isMobileMapVisible={isMobileMapVisible}
        onToggleMobileMap={() => setMobileTab(t => t === 'map' ? 'list' : 'map')}
        onLocateMe={handleLocateMe}
        locationStatus={locationStatus}
        onLocationSelect={handleLocationSelect}
      />

      {/* ── Stat bar ── */}
      {!loading && !error && stationCount > 0 && (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #2a2a2a',
          background: '#1a1a1a',
          flexShrink: 0,
        }}>
          {[
            { label: 'Cheapest',  value: cheapest != null ? `${cheapest.toFixed(1)}¢`  : '—', color: '#22c55e' },
            { label: 'Area avg',  value: avg      != null ? `${avg.toFixed(1)}¢`       : '—', color: '#f59e0b' },
            { label: 'Stations', value: String(stationCount),                                  color: '#f59e0b' },
            { label: 'Dearest',  value: dearest  != null ? `${dearest.toFixed(1)}¢`   : '—', color: '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 0',
              borderRight: '1px solid #2a2a2a',
            }}
            className="last:border-r-0"
            >
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#444444', marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Content area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'grid' }}
        className="md:grid-cols-[320px_1fr]"
      >
        {/* Station list */}
        <div
          className={`station-list absolute inset-0 md:relative md:inset-auto h-full overflow-y-auto border-r ${mobileTab === 'list' ? 'block' : 'hidden md:block'}`}
          style={{ borderColor: '#2a2a2a' }}
        >
          {loading && <LoadingSkeleton />}
          {!loading && error && <ErrorState onRetry={fetchPrices} />}
          {!loading && !error && sortedStations.length === 0 && (
            <EmptyState fuelLabel={fuelLabel(activeFuel)} radius={radius} />
          )}
          {!loading && !error && sortedStations.length > 0 && (
            <StationList
              stations={sortedStations}
              selectedId={selectedId}
              onSelect={handleCardSelect}
              cardRefsMap={cardRefsMap.current}
            />
          )}
        </div>

        {/* Map */}
        <div
          className={`absolute inset-0 md:relative md:inset-auto h-full ${mobileTab === 'map' ? 'block' : 'hidden md:block'}`}
        >
          <MapView
            stations={sortedStations}
            selectedId={selectedId}
            activeFuel={activeFuel}
            onPinClick={handlePinClick}
            userLocation={userLocation}
            isVisible={mobileTab === 'map'}
          />
        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
      <div
        className="md:hidden flex-shrink-0 flex"
        style={{ background: '#111111', borderTop: '1px solid #2a2a2a' }}
      >
        {([
          { tab: 'map'    as MobileTab, label: 'Map',    Icon: IconMap    },
          { tab: 'list'   as MobileTab, label: 'List',   Icon: IconList   },
          { tab: 'trends' as MobileTab, label: 'Trends', Icon: IconTrends },
        ]).map(({ tab, label, Icon }) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            style={{ flex: 1, padding: '10px 0 8px', textAlign: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon active={mobileTab === tab} />
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: mobileTab === tab ? '#f59e0b' : '#444444',
              marginTop: 2,
            }}>
              {label}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Notes on this implementation:**
- `mobileTab === 'trends'` shows the map on desktop (because on desktop both panels are always visible via `md:block`). On mobile, tapping "Trends" will show neither the map nor the list. For now this is acceptable — the Trends tab is a placeholder. The plan for a dedicated trends view is out of scope for this task.
- `100dvh` (dynamic viewport height) prevents the layout from being pushed under the mobile browser chrome.
- The stat bar's last item uses `className="last:border-r-0"` — ensure Tailwind v4 supports `last:` variants (it does).

- [ ] **Step 2: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: same pass/fail count as baseline.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/DashboardClient.tsx
git commit -m "feat: dark layout, stat bar, mobile bottom nav with SVG icons"
```

---

## Task 6: MapView — amber cluster icons + user location dot

**Goal:** Update the cluster group icon colour from sky-blue `#0ea5e9` to amber `#f59e0b`, and the user location dot from sky-blue to amber. The price pin colours on individual markers are already correct (HSL green→red via `getPinColour` — do not change this).

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Find and replace cluster icon colour**

In `src/components/MapView.tsx`, find the `iconCreateFunction` in the `L.markerClusterGroup` call (approximately lines 62–79). It contains:

```ts
background:#0ea5e9;color:white;
```

Replace with:

```ts
background:#f59e0b;color:#000000;
```

The full replacement HTML string:

```ts
html: `<div style="
  width:36px;height:36px;border-radius:50%;
  background:#f59e0b;color:#000000;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:13px;font-family:Inter,system-ui,sans-serif;
  box-shadow:0 2px 6px rgba(0,0,0,0.4);
  border:2px solid #111111;
">${count}</div>`,
```

- [ ] **Step 2: Find and replace user location dot colour**

In `src/components/MapView.tsx`, find the user location marker HTML (approximately lines 163–167):

```ts
html: `<div style="width:14px;height:14px;border-radius:50%;background:#0ea5e9;
        border:3px solid white;box-shadow:0 0 0 2px #0ea5e9,0 2px 6px rgba(0,0,0,0.3);"></div>`,
```

Replace with:

```ts
html: `<div style="width:14px;height:14px;border-radius:50%;background:#f59e0b;
        border:3px solid #111111;box-shadow:0 0 0 2px #f59e0b,0 2px 6px rgba(0,0,0,0.4);"></div>`,
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat: amber cluster icons and user location dot in MapView"
```

---

## Task 7: LoadingSkeleton + EmptyState + ErrorState — dark theme

**Goal:** Read and restyle the three state components so they don't flash white during loading.

**Files:**
- Modify: `src/components/LoadingSkeleton.tsx`
- Modify: `src/components/EmptyState.tsx`
- Modify: `src/components/ErrorState.tsx`

- [ ] **Step 1: Read the three files**

```bash
cat src/components/LoadingSkeleton.tsx
cat src/components/EmptyState.tsx
cat src/components/ErrorState.tsx
```

- [ ] **Step 2: Restyle LoadingSkeleton.tsx**

Replace whatever the current content is with:

```tsx
export default function LoadingSkeleton() {
  return (
    <div style={{ background: '#111111' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            borderBottom: '1px solid #1a1a1a',
            minHeight: '64px',
          }}
        >
          {/* Rank placeholder */}
          <div style={{ width: 26, height: 26, borderRadius: 6, background: '#1a1a1a' }} />
          {/* Name + meta */}
          <div style={{ flex: 1 }}>
            <div style={{ width: '60%', height: 14, background: '#1a1a1a', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ width: '40%', height: 11, background: '#1a1a1a', borderRadius: 4 }} />
          </div>
          {/* Price */}
          <div style={{ width: 56, height: 24, background: '#1a1a1a', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Restyle EmptyState.tsx**

Read the file first, then replace its JSX output with a dark-themed equivalent. Keep any props it accepts. The new output:

```tsx
// Replace the return statement — keep any existing interface/props unchanged
return (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    background: '#111111',
    color: '#555555',
    height: '100%',
  }}>
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#666666', marginBottom: 6 }}>
      No stations found
    </div>
    <div style={{ fontSize: 13, color: '#444444', textAlign: 'center', maxWidth: 240 }}>
      No {fuelLabel} prices within {radius}km. Try increasing the radius.
    </div>
  </div>
)
```

> The `EmptyState` component may accept `fuelLabel` and `radius` props — check the current file and keep those props in the interface. Use them in the message above.

- [ ] **Step 4: Restyle ErrorState.tsx**

Read the file first. Replace the return statement:

```tsx
// Keep existing props (onRetry callback)
return (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    background: '#111111',
    height: '100%',
  }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
      Failed to load prices
    </div>
    <button
      onClick={onRetry}
      style={{
        marginTop: 12,
        padding: '10px 24px',
        background: '#f59e0b',
        color: '#000000',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      Try again
    </button>
  </div>
)
```

- [ ] **Step 5: Commit**

```bash
git add src/components/LoadingSkeleton.tsx src/components/EmptyState.tsx src/components/ErrorState.tsx
git commit -m "feat: dark loading, empty, and error states"
```

---

## Task 8: LocationSearch dark theme

**Goal:** The `LocationSearch` component renders a search input and dropdown. It currently uses white/slate Tailwind classes. Update it to use the dark palette.

**Files:**
- Modify: `src/components/LocationSearch.tsx`

- [ ] **Step 1: Read current LocationSearch.tsx**

```bash
cat src/components/LocationSearch.tsx
```

- [ ] **Step 2: Update styles**

The component uses Tailwind classes for its input, dropdown container, and result items. Replace the relevant classes:

| Current class(es) | Replace with |
|---|---|
| `bg-white` on input | `style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#ffffff' }}` |
| `border-slate-200` / `border-slate-300` | `border: '1px solid #2a2a2a'` |
| `text-slate-700` / `text-slate-900` | `color: '#ffffff'` |
| `text-slate-500` / `text-slate-400` | `color: '#555555'` |
| `bg-white` on dropdown | `background: '#1a1a1a'` |
| `hover:bg-slate-50` on result items | `onMouseEnter` → `background: '#2a2a2a'`, `onMouseLeave` → `background: '#1a1a1a'` |
| `focus:ring-sky-500` / `focus:border-sky-400` | remove ring, or use amber: `outline: '2px solid #f59e0b'` on focus |
| `text-sky-600` / `bg-sky-50` (area label) | `color: '#f59e0b'` |
| `divide-slate-100` | `borderColor: '#2a2a2a'` |

Apply these changes by reading the actual class names in the file and converting them. Use inline `style` props where the conversion is clearest, or replace Tailwind classes that are straightforwardly equivalent.

- [ ] **Step 3: Verify TypeScript + visual check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/LocationSearch.tsx
git commit -m "feat: dark LocationSearch input and dropdown"
```

---

## Task 9: DistanceSlider dark theme

**Goal:** The slider's label text and range input thumb currently use the default browser/Tailwind palette. Update the label to white and the thumb to amber.

**Files:**
- Modify: `src/components/DistanceSlider.tsx`

- [ ] **Step 1: Read current DistanceSlider.tsx**

```bash
cat src/components/DistanceSlider.tsx
```

The file was recently rewritten (in a previous PR) and looks like:

```tsx
'use client'
import { useState, useEffect } from 'react'
// ...
<span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
  {dragValue}km
</span>
```

- [ ] **Step 2: Update the label colour**

Change `text-slate-500` to `text-white` and style the range input with accent colour:

```tsx
<input
  type="range"
  min={1}
  max={50}
  step={1}
  value={dragValue}
  onChange={(e) => setDragValue(Number(e.target.value))}
  onMouseUp={(e) => onChange(Number((e.target as HTMLInputElement).value))}
  onTouchEnd={(e) => onChange(Number((e.target as HTMLInputElement).value))}
  className="w-[100px]"
  style={{ accentColor: '#f59e0b' }}
/>
<span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
  {dragValue}km
</span>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DistanceSlider.tsx
git commit -m "feat: amber slider thumb + white label in DistanceSlider"
```

---

## Task 10: Final integration check

**Goal:** Build the app, run all tests, do a quick visual smoke-check, and confirm the Playwright E2E suite still passes.

- [ ] **Step 1: Full production build**

```bash
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully`. If there are TypeScript errors, fix them before proceeding.

- [ ] **Step 2: Run unit tests**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass/fail as before. The 2 pre-existing failures in `prices-api.test.ts` are expected.

- [ ] **Step 3: Start dev server and run Playwright**

```bash
npm run dev &
sleep 5
BASE_URL=http://localhost:3000 npx playwright test --reporter=list 2>&1 | tail -30
```

Expected: all 9 Playwright tests pass (they use API mocking so the database being unavailable locally is fine).

Kill the dev server after:
```bash
kill %1
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete High-Vis UI redesign — dark theme, amber accent, ad slots"
```

---

## Ad Slot Configuration (user action required after deploy)

After the redesign is deployed, the user must:

1. Go to [https://adsense.google.com](https://adsense.google.com) and create an account (or log in).
2. Add FuelSniffer's domain to AdSense.
3. Create two ad units:
   - **List banner** — format: Banner (320×50)
   - **Popup banner** — format: Banner (300×50)
4. Replace all `ca-pub-REPLACE_WITH_YOUR_PUBLISHER_ID` occurrences with the publisher ID (e.g. `ca-pub-1234567890123456`).
5. Replace `REPLACE_WITH_YOUR_AD_SLOT_ID` in `AdCard.tsx` with the list banner's slot ID.
6. Replace `REPLACE_WITH_YOUR_AD_SLOT_ID_2` in `StationPopup.tsx` with the popup banner's slot ID.

Files to update:
- `src/app/layout.tsx` — publisher ID in script src
- `src/components/AdCard.tsx` — publisher ID + slot ID
- `src/components/StationPopup.tsx` — publisher ID + slot ID 2

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/app/globals.css` | Dark background, Leaflet popup dark override, scrollbar styles |
| `src/app/layout.tsx` | AdSense script tag |
| `src/components/FilterBar.tsx` | Full restyle — dark header, amber fuel tabs, SVG locate icon |
| `src/components/AdCard.tsx` | New — AdSense banner card for list injection |
| `src/components/StationCard.tsx` | Dark card, rank badge, bold white price, amber selected state |
| `src/components/StationList.tsx` | Inject AdCard after row 3, pass rank prop to StationCard |
| `src/components/StationPopup.tsx` | Dark theme, amber chart, PopupAdBanner slot |
| `src/app/dashboard/DashboardClient.tsx` | Dark layout, stat bar redesign, mobile bottom nav with SVG icons |
| `src/components/MapView.tsx` | Amber cluster icon + user location dot |
| `src/components/LoadingSkeleton.tsx` | Dark skeleton placeholders |
| `src/components/EmptyState.tsx` | Dark empty state |
| `src/components/ErrorState.tsx` | Dark error state with amber retry button |
| `src/components/LocationSearch.tsx` | Dark input + dropdown |
| `src/components/DistanceSlider.tsx` | Amber slider thumb + white label |
