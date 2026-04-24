# Fillip SP-3 — UX Core Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship production-quality dark + light themes (token migration across 21 components), a PWA manifest + Serwist service worker skeleton, performance budget tooling, redesigned StationCard/StationPopup/StationDetail with reserved slot components for downstream SPs, a WCAG 2.2 AA accessibility pass, themed ad slots, and Storybook 8 with axe integration.

**Architecture:** SP-0 already delivered the token contract (`src/styles/tokens.css`), ThemeProvider, ThemeToggle, and FOUC prevention. SP-3 extends those tokens with the full semantic vocabulary, migrates 204 inline hex literals across 21 components to `var(--color-*)` references, redesigns three station surfaces, builds the PWA shell, and wires performance + a11y tooling.

**Foundation assumption:** Dark theme tokens in `tokens.css` already map to the exact hex values used in all inline-styled components. The migration therefore produces zero visual change in dark mode and correctly lights up light mode.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Serwist (`@serwist/next`) · Storybook 8 (`@storybook/nextjs`) · Vitest 4 · Playwright 1.59 · `@next/bundle-analyzer` · `@lhci/cli` · `next/font/local` (Inter self-hosted).

---

## Hex literal inventory (baseline count)

| File | Hex count |
|---|---|
| `src/components/StationPopup.tsx` | 27 |
| `src/app/dashboard/DashboardClient.tsx` | 20 |
| `src/app/dashboard/trip/TripClient.tsx` | 16 |
| `src/components/LocationSearch.tsx` | 15 |
| `src/components/TripStationList.tsx` | 14 |
| `src/components/TripForm.tsx` | 13 |
| `src/components/StationDetail.tsx` | 12 |
| `src/components/StationCard.tsx` | 12 |
| `src/components/FilterBar.tsx` | 12 |
| `src/components/TripDisabled.tsx` | 10 |
| `src/components/TripMap.tsx` | 7 |
| `src/components/AddressSearch.tsx` | 7 |
| `src/components/AdCard.tsx` | 7 |
| `src/components/LoadingSkeleton.tsx` | 6 |
| `src/components/RouteChipStrip.tsx` | 5 |
| `src/components/MapView.tsx` | 5 |
| `src/components/EmptyState.tsx` | 5 |
| `src/components/NavigateButton.tsx` | 4 |
| `src/components/ErrorState.tsx` | 4 |
| `src/components/DistanceSlider.tsx` | 2 |
| `src/components/StationList.tsx` | 1 |
| **Total** | **~192 confirmed + ~12 in FuelSelect/ThemeToggle** |

---

## Hex → Token mapping reference

When migrating, use this table (dark-mode values are the exact legacy hex values):

| Hex | Token | Dark value | Light value |
|---|---|---|---|
| `#111111` | `var(--color-bg)` | `#111111` | `#ffffff` |
| `#1a1a1a` | `var(--color-bg-elevated)` | `#1a1a1a` | `#f5f5f7` |
| `#2a2a2a` | `var(--color-border)` | `#2a2a2a` | `#e4e4e7` |
| `#ffffff` | `var(--color-text)` | `#ffffff` | `#0f172a` |
| `#cccccc` | `var(--color-text-muted)` | `#cccccc` | `#475569` |
| `#8a8a8a` / `#888888` | `var(--color-text-subtle)` | `#8a8a8a` | `#64748b` |
| `#f59e0b` | `var(--color-accent)` | `#f59e0b` | `#f59e0b` |
| `#000000` (on amber) | `var(--color-accent-fg)` | `#000000` (on amber) | `#111111` |
| `#22c55e` / `#16a34a` | `var(--color-success)` | `#16a34a` | `#16a34a` |
| `#ef4444` / `#dc2626` | `var(--color-danger)` | `#dc2626` | `#dc2626` |
| `#1a0d00` (selected bg) | `var(--color-accent-muted)` | needs adding to tokens | |

**Note:** `#1a0d00` (amber-tinted dark bg for selected state in StationCard) needs to be added to `tokens.css` as `--color-accent-muted`. In light mode this becomes something like `#fef3c7`.

---

## Phase 1 — Token system extension + token migration (all 21 files)

### Task 1.1 — Extend tokens.css with full semantic vocabulary

**Files modified:** `src/styles/tokens.css`

Add missing tokens to both `[data-theme='light']` and `[data-theme='dark']` blocks:
- `--color-accent-muted` (selected-card bg: `#1a0d00` dark / `#fef3c7` light)
- `--color-price-down` (good: `#22c55e` both themes)
- `--color-price-up` (bad: `#ef4444` both themes)
- `--color-price-flat` (`#8a8a8a` dark / `#64748b` light)
- `--map-tile-filter` (dark: `invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)` / light: `none`)
- `--map-cluster-bg` = `var(--color-accent)`
- `--map-cluster-text` = `var(--color-accent-fg)`
- `--map-cluster-border` = `var(--color-bg)`
- Verdict reserved: `--verdict-fill-now`, `--verdict-hold`, `--verdict-wait`, `--verdict-uncertain`
- True-cost reserved: `--truecost-bg`, `--truecost-border`, `--truecost-saving`
- Motion: `--motion-fast: 120ms`, `--motion-base: 200ms`, `--motion-slow: 320ms`

Tests: none needed for tokens alone (visual regression catches regressions).

### Task 1.2 — Token migration: StationCard

**File:** `src/components/StationCard.tsx`

Replace 12 hex literals:
- `#1a1a1a` (border-bottom) → `var(--color-border)`
- `#f59e0b` (selected left border) → `var(--color-accent)`
- `#1a0d00` (selected bg) → `var(--color-accent-muted)`
- `#111111` (default bg, mouseLeave) → `var(--color-bg)`
- `#1a1a1a` (hover bg) → `var(--color-bg-elevated)`
- `#f59e0b` (rank=1 bg) → `var(--color-accent)`
- `#000000` (rank=1 color) → `var(--color-accent-fg)`
- `#2a2a2a` (rank>1 bg) → `var(--color-border)`
- `#888888` (rank>1 color) → `var(--color-text-subtle)`
- `#ffffff` (name text) → `var(--color-text)`
- `#8a8a8a` (subtitle text) → `var(--color-text-subtle)`
- `#22c55e` / `#ef4444` (price change) → `var(--color-price-down)` / `var(--color-price-up)`

Also implement the redesigned layout from spec §6.2:
- Increase `minHeight` from 64px to 72px
- Add `<div data-slot="verdict" />` placeholder (56×22 reserved footprint via min-width/min-height)
- Add `<div data-slot="truecost" />` placeholder (collapsed, reserved space via `min-height: 18px`)
- Import `SlotVerdict` and `SlotTrueCost` from `@/components/slots/`
- Update `aria-label` to include rank: `"Ranked {n}, {name}, {price} cents, {dist} km"`
- Add `aria-pressed={isSelected}`
- Add `:focus-visible` ring via CSS (handled by globals — verify token references work)

### Task 1.3 — Token migration: StationPopup

**File:** `src/components/StationPopup.tsx`

Replace 27 hex literals:
- All `#ffffff` text → `var(--color-text)`
- `#8a8a8a` text → `var(--color-text-subtle)`
- `#888888` → `var(--color-text-subtle)`
- `#ef4444` / `#22c55e` → `var(--color-danger)` / `var(--color-success)`
- `#f59e0b` (period pill active bg, chart stroke, chart dot, nav button bg, ad placeholder border+text) → `var(--color-accent)`
- `#2a2a2a` (period pill inactive border, chart grid, ad placeholder bg, Apple Maps button bg) → `var(--color-border)`
- `#1a1a1a` (period pill inactive bg, tooltip bg, Apple Maps border bg) → `var(--color-bg-elevated)`
- `#000000` (nav button text on accent) → `var(--color-accent-fg)`

Add redesign elements from spec §6.3:
- Add `<SlotVerdict station={station} />` in price row
- Add `<SlotTrueCost station={station} />` under price
- Add `<SlotShareButton station={station} disabled />` in price row
- Move ad banner below chart, above nav buttons (currently between station info and chart)

### Task 1.4 — Token migration: StationDetail

**File:** `src/components/StationDetail.tsx`

This component uses Tailwind classes, not inline styles. Migration is different:
- `bg-white` → `bg-[var(--color-bg)]` or add token Tailwind class mapping
- `text-slate-900` → `text-[var(--color-text)]`
- `bg-sky-500` → `bg-[var(--color-accent)]`
- `text-red-500` → `text-[var(--color-danger)]`
- `text-emerald-600` → `text-[var(--color-success)]`
- `text-slate-500` → `text-[var(--color-text-subtle)]`
- `border-slate-200` → `border-[var(--color-border)]`
- `bg-slate-50` → `bg-[var(--color-bg-elevated)]`

Add redesign elements from spec §6.4:
- Add `<SlotVerdict station={station} />` above hero price
- Add `<SlotTrueCost station={station} />` under hero price
- Add `<SlotShareButton station={station} disabled />` button
- Add `<SlotAlertButton station={station} disabled />` button
- Convert to inline styles (consistent with other components) using `var(--color-*)` throughout

### Task 1.5 — Token migration: DashboardClient

**File:** `src/app/dashboard/DashboardClient.tsx`

Replace 20 hex literals in SVG icon components (IconMap, IconList, IconTrends):
- `#f59e0b` (active stroke) → `var(--color-accent)`
- `#555555` (inactive stroke) → `var(--color-text-subtle)`

Also update all other inline style hex literals to tokens.

### Task 1.6 — Token migration: TripClient

**File:** `src/app/dashboard/trip/TripClient.tsx`

Replace 16 hex literals following same pattern.

### Task 1.7 — Token migration: remaining components

Apply token migration to all remaining files in sequence:
1. `FilterBar.tsx` (12 hits)
2. `LocationSearch.tsx` (15 hits)
3. `TripStationList.tsx` (14 hits)
4. `TripForm.tsx` (13 hits)
5. `TripDisabled.tsx` (10 hits)
6. `TripMap.tsx` (7 hits)
7. `AddressSearch.tsx` (7 hits)
8. `AdCard.tsx` (7 hits)
9. `LoadingSkeleton.tsx` (6 hits)
10. `RouteChipStrip.tsx` (5 hits)
11. `MapView.tsx` (5 hits — plus `getMapPalette()` JS object)
12. `EmptyState.tsx` (5 hits)
13. `NavigateButton.tsx` (4 hits)
14. `ErrorState.tsx` (4 hits)
15. `DistanceSlider.tsx` (2 hits)
16. `StationList.tsx` (1 hit)

For `MapView.tsx`: in addition to the HTML template string literals, add a `getMapPalette()` helper that reads CSS vars at runtime and is re-read on theme change. Update cluster icon HTML template and price pin style to use the palette object. Add `--map-tile-filter` CSS filter on the tile layer container.

**Verification step:** After all 21 files migrated, run:
```
grep -rn '#[0-9a-fA-F]\{3,6\}' src/components/ src/app/dashboard/ --include="*.tsx" | grep -v "//.*#" | grep -v "spec"
```
Target: zero non-comment hex literals remaining.

---

## Phase 2 — Slot components

### Task 2.1 — Create slot components

**Files created:**
- `src/components/slots/SlotVerdict.tsx` — reserved 56×22 pill, renders `null` content, `data-slot="verdict"`, `aria-label="Verdict loading"` (SP-4 replaces)
- `src/components/slots/SlotTrueCost.tsx` — reserved under price, renders `null` content, `min-height: 18px`, `data-slot="truecost"` (SP-6 replaces)
- `src/components/slots/SlotShareButton.tsx` — share icon button, `disabled` prop, `aria-label="Share station (coming soon)"` (SP-8 wires)
- `src/components/slots/SlotAlertButton.tsx` — bell icon button, `disabled` prop, `aria-label="Create alert (coming soon)"` (SP-5 wires)
- `src/components/slots/index.ts` — barrel export

Props signature for all slot components: `{ station: PriceResult }` so downstream SPs can fill them without layout re-negotiation.

Tests: `src/__tests__/slots/SlotComponents.test.tsx` — renders without throwing, slot divs have correct `data-slot` attributes, disabled buttons have `aria-disabled="true"`.

---

## Phase 3 — PWA

### Task 3.1 — Install Serwist and dependencies

```bash
npm install @serwist/next serwist
```

Check if `next-pwa` already in `package.json` — if present, remove (don't mix SW libraries).

### Task 3.2 — PWA manifest

**File created:** `public/manifest.webmanifest`

Content per spec §4.1:
```json
{
  "name": "Fillip — fuel prices that decide for you",
  "short_name": "Fillip",
  "description": "Real-time Queensland fuel prices. Find the cheapest nearby and plan fuel stops for your trips.",
  "start_url": "/dashboard?utm_source=pwa",
  "id": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone"],
  "orientation": "any",
  "background_color": "#111111",
  "theme_color": "#f59e0b",
  "categories": ["navigation", "travel", "utilities", "finance"],
  "dir": "ltr",
  "lang": "en-AU",
  "prefer_related_applications": false,
  "icons": [...see §4.2],
  "shortcuts": [
    { "name": "Cheapest near me", "url": "/dashboard?sort=price" },
    { "name": "Trip planner", "url": "/dashboard/trip" },
    { "name": "My alerts", "url": "/dashboard?alerts=1" }
  ]
}
```

Add `<link rel="manifest" href="/manifest.webmanifest" />` and dual `<meta name="theme-color" ...>` tags in `layout.tsx`.

### Task 3.3 — PWA icons

Generate icon set from `public/file.svg` (existing) or `src/app/icon.svg` using Sharp or ImageMagick available on the system. Required outputs in `public/icons/`:
- `icon-192.png`, `icon-512.png`
- `icon-192-maskable.png`, `icon-512-maskable.png`
- `icon-monochrome-512.png`
- `apple-touch-icon-180.png`

**Approach:** Use a Node.js script `scripts/generate-icons.ts` that uses the `sharp` package. Run once. Commit the generated PNGs.

### Task 3.4 — Service worker (Serwist)

**Files created:**
- `src/app/sw.ts` — Serwist SW entry point with cache strategies from spec §4.4
- `src/components/PwaRegistrar.tsx` — client component that registers the SW, handles `beforeinstallprompt`, exports `usePwaInstall()` hook
- `src/lib/pwa/installContext.tsx` — React context for install-prompt deferred event

**SW cache strategies:**
```
- App shell HTML: NetworkFirst → fillip-shell-v{BUILD}
- /_next/static/*: CacheFirst (immutable)
- Images/leaflet/*: CacheFirst, 30d, 60 entries
- OSM tiles: StaleWhileRevalidate, 7d, 800 entries
- /api/prices*: StaleWhileRevalidate, 24h, 30 entries (with X-Fillip-Stale header on offline fallback)
- /api/prices/history*: StaleWhileRevalidate, 24h, 60 entries
- /api/search*, /api/auth/*: NetworkOnly
```

**Push handler stubs (SP-5 reserved):**
```js
self.addEventListener('push', (event) => {
  // SP-5: handle VAPID push notification here
});
self.addEventListener('notificationclick', (event) => {
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/dashboard'));
});
self.addEventListener('pushsubscriptionchange', (event) => {
  // SP-5: re-subscribe via /api/push/subscribe
});
```

**Wire into `next.config.mjs`:** wrap with `withSerwist({ ... })`.

**Mount `<PwaRegistrar />` in `layout.tsx`.**

### Task 3.5 — Install-prompt UX

Add `InstallPrompt` context. On 3rd dashboard visit (tracked via `localStorage.getItem('fillip-visit-count')`), show a dismissable toast with "Install Fillip" CTA. Toast uses existing inline-styled patterns, token-aware.

### Task 3.6 — Offline page

**File created:** `src/app/offline/page.tsx` — simple dark-themed branded page. SW serves as fallback navigation page.

---

## Phase 4 — Accessibility

### Task 4.1 — ARIA and semantic HTML

Update `DashboardClient.tsx`:
- Add `<h1>` to the dashboard (screen-reader only: `className="sr-only"`)
- Add `role="application"` + `aria-roledescription` to the map container
- Add skip-link completion (already in layout — verify target `id="main-content"` exists on `<main>`)
- Add `role="status" aria-live="polite" aria-atomic="true"` to stat bar cells
- Add `role="radiogroup"` semantics to theme toggle (already in ThemeToggle.tsx — verify)

Update `StationCard.tsx` (partially done in 1.2):
- Verify `role="button"`, `aria-pressed`, full `aria-label` with rank, price, distance

Update `MapView.tsx`:
- Each `L.marker` gets `keyboard: true`, `alt` text with price + station name
- Cluster icon gets `aria-label="{count} stations, double-click to expand"`
- "Skip map, go to list" visually-hidden link before map region

Update `FilterBar.tsx`:
- All filter chips are `<button>` elements (verify)
- Slider is `<input type="range">` with `<label>` (verify)

### Task 4.2 — Focus ring audit

Verify `globals.css` `*:focus-visible` rule covers all interactive elements. Special-case: inside inline-styled components the focus ring needs `outline-offset: -2px` for inset ring on StationCard.

### Task 4.3 — Keyboard navigation completion

In `DashboardClient.tsx`, complete the arrow-key navigation:
- `Home` → first card
- `End` → last card
- `Enter`/`Space` → activate card

### Task 4.4 — Reduced-motion

Add to `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

For Leaflet map: in `MapView.tsx`, check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and pass `{ animate: false }` to `panTo`.

### Task 4.5 — Touch targets

Ensure mobile-nav icons (in DashboardClient tab bar) are `min-height: 48px min-width: 48px`.

### Task 4.6 — Install axe-core in dev + install vitest-axe

```bash
npm install --save-dev @axe-core/react vitest-axe
```

Add `@axe-core/react` initialisation in `src/app/layout.tsx` (dev-only, dynamic import).

---

## Phase 5 — Performance

### Task 5.1 — Self-host Inter font

Replace `Geist` + `Geist_Mono` in `layout.tsx` with Inter via `next/font/google` (`display: 'swap'`, subsets: `['latin']`, weights: `[400, 600, 700, 900]`). The spec calls for `next/font/local` but `next/font/google` self-hosts automatically in Next.js — use this approach for simplicity. Assign to `--font-sans` CSS variable.

### Task 5.2 — Code-split Recharts

In `StationPopup.tsx` and `StationDetail.tsx`, replace:
```tsx
import { AreaChart, Area, ... } from 'recharts'
```
with:
```tsx
const { AreaChart, Area, ... } = await import('recharts')
```

Actually: use `dynamic()` + a thin wrapper component `PriceChart.tsx` that is dynamically imported only when needed.

### Task 5.3 — Defer AdSense script

In `layout.tsx`, add AdSense script with `strategy="lazyOnload"`. Each `<ins>` reserves explicit dimensions.

### Task 5.4 — Bundle analyzer

```bash
npm install --save-dev @next/bundle-analyzer
```

Wrap `next.config.mjs` with `withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })`.
Add `"analyze": "ANALYZE=true npm run build"` script to `package.json`.

### Task 5.5 — Lighthouse CI config

**Files created:**
- `.lighthouserc.json` — config with mobile profile, 3 runs, thresholds: performance ≥ 90, accessibility ≥ 95, best-practices ≥ 90, seo ≥ 90
- `scripts/lhci.sh` — script to run LHCI locally against `http://localhost:3000`

```bash
npm install --save-dev @lhci/cli
```

Add `"lighthouse": "lhci autorun"` script to `package.json`.

### Task 5.6 — size-limit config

```bash
npm install --save-dev @size-limit/preset-app size-limit
```

Add to `package.json`:
```json
"size-limit": [
  { "path": ".next/static/chunks/pages/dashboard*.js", "limit": "180 kB" }
]
```

---

## Phase 6 — Storybook

### Task 6.1 — Install Storybook 8

```bash
npx storybook@latest init --type nextjs --skip-install
npm install --save-dev @storybook/nextjs @storybook/addon-a11y @storybook/test-runner
```

Configure `.storybook/main.ts` to use `@storybook/nextjs` framework, import `globals.css`.

### Task 6.2 — Stories

**Files created:**

| Story | Variants |
|---|---|
| `src/stories/StationCard.stories.tsx` | Default / Selected / Rank1 / LoadingState |
| `src/stories/StationPopup.stories.tsx` | Default / Dark / Light / NoHistory |
| `src/stories/StationDetail.stories.tsx` | Desktop / Mobile / Dark / Light |
| `src/stories/AdCard.stories.tsx` | Dev placeholder dark / Dev placeholder light |
| `src/stories/SlotComponents.stories.tsx` | All 4 slots |

Configure `.storybook/preview.ts` with both theme decorators (add `data-theme` to the decorator).

### Task 6.3 — a11y addon

Add `@storybook/addon-a11y` to addons in `.storybook/main.ts`. It auto-runs axe on every story.

---

## Phase 7 — Hardening + verification

### Task 7.1 — Full test run

```bash
cd fuelsniffer && npm run test:run
```

Expected: existing 4 DB integration failures remain (no DB in CI). All new tests green.

### Task 7.2 — Build verification

```bash
cd fuelsniffer && npm run build
```

Fix any TypeScript errors, import issues, or missing modules.

### Task 7.3 — Lint check

```bash
cd fuelsniffer && npm run lint
```

Target: no new errors above SP-0 baseline of ~38 lint warnings (mostly existing `any` types).

### Task 7.4 — Token migration verification

Run hex literal grep to confirm zero non-comment hex literals remain in the 21 files.

---

## File structure

**Files created:**

| Path | Responsibility |
|---|---|
| `src/components/slots/SlotVerdict.tsx` | Reserved verdict chip (56×22 pill, renders null, SP-4 fills) |
| `src/components/slots/SlotTrueCost.tsx` | Reserved true-cost line (min-height: 18px, SP-6 fills) |
| `src/components/slots/SlotShareButton.tsx` | Share icon button stub (SP-8) |
| `src/components/slots/SlotAlertButton.tsx` | Alert bell button stub (SP-5) |
| `src/components/slots/index.ts` | Barrel export |
| `src/components/PriceChart.tsx` | Recharts AreaChart extracted, dynamically imported |
| `src/components/PwaRegistrar.tsx` | SW registration + beforeinstallprompt capture |
| `src/lib/pwa/installContext.tsx` | React context for deferred install prompt |
| `src/app/sw.ts` | Serwist service worker entry (Workbox-via-Serwist) |
| `src/app/offline/page.tsx` | Offline fallback page |
| `public/manifest.webmanifest` | PWA manifest |
| `public/icons/` | Generated icon set (PNG + maskable + monochrome) |
| `scripts/generate-icons.ts` | Icon generation script (Sharp) |
| `scripts/lhci.sh` | Lighthouse CI runner script |
| `.lighthouserc.json` | LHCI configuration |
| `.storybook/main.ts` | Storybook configuration |
| `.storybook/preview.ts` | Storybook global decorators |
| `src/stories/StationCard.stories.tsx` | StationCard stories |
| `src/stories/StationPopup.stories.tsx` | StationPopup stories |
| `src/stories/StationDetail.stories.tsx` | StationDetail stories |
| `src/stories/AdCard.stories.tsx` | AdCard stories |
| `src/stories/SlotComponents.stories.tsx` | Slot component stories |
| `src/__tests__/slots/SlotComponents.test.tsx` | Slot unit tests |

**Files modified:**

| Path | Change |
|---|---|
| `src/styles/tokens.css` | Add extended semantic tokens (accent-muted, price-delta, map vars, motion, verdict/truecost reserved) |
| `src/components/StationCard.tsx` | Token migration (12 hex) + redesigned layout + slot integration |
| `src/components/StationPopup.tsx` | Token migration (27 hex) + slot integration + ad banner move |
| `src/components/StationDetail.tsx` | Token migration (12 Tailwind → token inline styles) + slot integration |
| `src/components/AdCard.tsx` | Token migration (7 hex) |
| `src/components/MapView.tsx` | Token migration (5 hex + JS palette object + tile filter) |
| `src/components/FilterBar.tsx` | Token migration (12 hex) |
| `src/components/LocationSearch.tsx` | Token migration (15 hex) |
| `src/components/TripStationList.tsx` | Token migration (14 hex) |
| `src/components/TripForm.tsx` | Token migration (13 hex) |
| `src/components/TripDisabled.tsx` | Token migration (10 hex) |
| `src/components/TripMap.tsx` | Token migration (7 hex) |
| `src/components/AddressSearch.tsx` | Token migration (7 hex) |
| `src/components/LoadingSkeleton.tsx` | Token migration (6 hex) |
| `src/components/RouteChipStrip.tsx` | Token migration (5 hex) |
| `src/components/EmptyState.tsx` | Token migration (5 hex) |
| `src/components/NavigateButton.tsx` | Token migration (4 hex) |
| `src/components/ErrorState.tsx` | Token migration (4 hex) |
| `src/components/DistanceSlider.tsx` | Token migration (2 hex) |
| `src/components/StationList.tsx` | Token migration (1 hex) |
| `src/app/dashboard/DashboardClient.tsx` | Token migration (20 hex) + a11y (h1, aria, skip-link target) |
| `src/app/dashboard/trip/TripClient.tsx` | Token migration (16 hex) |
| `src/app/layout.tsx` | Add manifest link, theme-color meta, PwaRegistrar, Inter font, axe dev init |
| `next.config.mjs` | Wrap with withSerwist + withBundleAnalyzer |
| `package.json` | Add dev deps + scripts (analyze, lighthouse, size-limit) |
| `src/app/globals.css` | Add reduced-motion rule, touch target base |

---

## Definition of done (SP-3)

- [ ] Zero inline hex literals in the 21 target files (grep confirms)
- [ ] `npm run build` succeeds
- [ ] `npm run lint` has no new errors above baseline
- [ ] `npm run test:run` passes all non-DB tests
- [ ] Slot components in place, tests green
- [ ] PWA manifest valid (lighthouse PWA audit passes)
- [ ] Service worker registered with stub push handlers
- [ ] Offline page at `/offline`
- [ ] Self-hosted Inter font (no Google Fonts request in network tab)
- [ ] Recharts code-split (verify in bundle analyzer)
- [ ] AdSense `strategy="lazyOnload"` in layout
- [ ] `.lighthouserc.json` + `@lhci/cli` installed
- [ ] `@next/bundle-analyzer` in analyze script
- [ ] Storybook configured, 5 story files present
- [ ] `@storybook/addon-a11y` wired
- [ ] `vitest-axe` installed
- [ ] CLAUDE.md updated with token system, SW notes

---

## Open questions / deviations

| # | Question | Decision taken |
|---|---|---|
| Icons | No 1024×1024 source SVG — generate from `src/app/icon.svg` | Use existing icon.svg, generate at 512px, scale up |
| Storybook + Next.js 16 | May have compatibility issues with Storybook 8 | Fall back to `@storybook/experimental-nextjs-vite` if needed |
| Serwist + Next 16 | `@serwist/next` targets Next 15+ | Check for Next 16 compatibility; fall back to hand-rolled SW if blocked |
| size-limit | Dashboard bundle path depends on build output | Adjust path after first build |
