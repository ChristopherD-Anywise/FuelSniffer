# SP-3 — UX Core: Dark Mode, PWA, Performance, A11y, Redesigned Cards

**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `2026-04-22-fillip-master-design.md` (§3 principles, §4 D5)
**Sub-project:** SP-3 of the Fillip MVP roadmap
**Type:** Sub-project design spec (per master §7 — each SP gets its own design + plan)

---

## 1. Purpose & scope

SP-3 owns the **shell** that every other Fillip surface ships inside. Cycle verdicts (SP-4), alerts (SP-5), true-cost (SP-6), trip polish (SP-7), and viral share (SP-8) all need to plug into a coherent, fast, accessible, themeable, installable PWA. SP-3 builds that shell and re-themes the surfaces that already exist (dashboard, station card/popup/detail, map).

**In scope (this spec only):**

1. Theme token system + dark mode (system-aware + manual toggle, no SSR flash).
2. PWA manifest, icons, install-prompt UX, **service-worker skeleton** (also reserved for SP-5 web push).
3. Performance budget definition + enforcement mechanism.
4. Redesigned `StationCard`, `StationPopup`, `StationDetail`, with reserved slots for SP-4 (D1 verdict) and SP-6 (D4 true-cost).
5. WCAG 2.2 AA accessibility (keyboard, screen reader, contrast, reduced-motion, focus management).
6. Ad slot specs — preserve the existing 3 slots, make them theme-aware, lazy-load.
7. Test strategy: visual regression, Storybook, axe-core, Lighthouse CI.

**Out of scope (other SPs own these):**

- The verdict chip itself (SP-4); SP-3 only reserves the slot.
- The true-cost number (SP-6); SP-3 only reserves the slot.
- Web-push subscription flow + VAPID infrastructure (SP-5); SP-3 only ships the SW skeleton with a reserved `push` event handler stub.
- Magic-link/OAuth UI (SP-2).
- Trip-page redesign internals (SP-7) — but SP-3 *does* deliver the design tokens trip uses.

---

## 2. Current state — what we are replacing

A walk through `src/components/` reveals two coexisting visual languages:

- **Dark, inline-styled, amber-accent** (`#111111` bg / `#f59e0b` accent / `#ffffff` text):
  `StationCard.tsx`, `StationPopup.tsx`, `MapView.tsx` (cluster + price pins), `AdCard.tsx`, `DashboardClient.tsx`, `FilterBar` indirectly.
- **Light, Tailwind-classed, sky-blue accent** (`bg-white` / `text-slate-900` / `bg-sky-500`):
  `StationDetail.tsx`.

This is incoherent: opening a station detail panel from the dark dashboard slams the user into a white panel mid-flight. It also means **no surface today is theme-able** — colours are hard-coded as inline styles or Tailwind utilities pointing at fixed palette tokens.

Other observations that constrain the redesign:

- Inline-style components cannot consume CSS custom properties without rewrites; this is a forcing function for SP-3's first deliverable (the token migration).
- `MapView.tsx` builds marker HTML as raw template strings (`L.divIcon({ html: ... })`), so any "dark theme markers" need to read tokens from a JS-side palette object, not from CSS.
- `StationPopup.tsx` and `AdCard.tsx` already gate on `process.env.NODE_ENV === 'development'` for ad placeholders — that pattern stays.
- `DashboardClient.tsx` has working keyboard nav scaffolding (`onArrowKey`, `data-station-index`, `tabIndex`) but no focus-visible styling and no ARIA on the map.
- Recharts colour (`#f59e0b` in popup, `#0ea5e9` in detail) needs to come from tokens — both should pick up the brand accent regardless of theme.

---

## 3. Theme token system

### 3.1 Decision: CSS custom properties in `:root`, overridden by `[data-theme="dark"]`

**Recommended over Tailwind config** because:

- Inline-styled components (StationCard, StationPopup, MapView markers, AdCard, DashboardClient stat bar) cannot easily consume Tailwind classes without a rewrite. CSS variables work in `style={{ background: 'var(--bg-surface)' }}` with no infrastructure.
- Tailwind v4 supports `@theme` reading CSS variables natively, so the same tokens drive both inline styles and Tailwind utilities (no duplication).
- Theme switch becomes a single attribute flip on `<html>`, no className gymnastics, no Tailwind `dark:` variant cascade complexity.
- Tokens become the source of truth for the runtime JS palette that `MapView` needs (read once on mount, re-read on theme change via `MutationObserver` on `documentElement` `data-theme`).

**Tailwind v4 integration:** `@theme` block in `globals.css` pulls each `--color-*` from the CSS variable set. This means `bg-surface` (Tailwind) and `var(--bg-surface)` (inline) resolve to the same value.

### 3.2 Token taxonomy

Two layers — *primitives* (raw colours, never used by components) and *semantic* (what components reference).

**Primitives** (defined once, theme-agnostic):
`--gray-{0,50,100,…,900,950}`, `--amber-{400,500,600}`, `--green-{500,600}`, `--red-{500,600}`, `--sky-{400,500,600}`. Brand accent is the amber ramp; recharts colour uses sky as a secondary data colour.

**Semantic tokens** (re-mapped per theme):
- Surfaces: `--bg-app`, `--bg-surface`, `--bg-surface-raised`, `--bg-surface-sunken`, `--bg-overlay` (modals/popups)
- Borders: `--border-subtle`, `--border-default`, `--border-strong`, `--border-focus`
- Text: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-on-accent`, `--text-link`
- Brand: `--accent`, `--accent-hover`, `--accent-muted`, `--accent-on` (text colour on accent bg)
- Semantic state: `--success`, `--warning`, `--danger`, `--info`
- Price-delta colours: `--price-down` (good), `--price-up` (bad), `--price-flat`
- Verdict (reserved for SP-4): `--verdict-fill-now`, `--verdict-hold`, `--verdict-wait`, `--verdict-uncertain` — declared with sensible defaults so SP-3 ships nothing visible, but SP-4 just consumes them
- True-cost (reserved for SP-6): `--truecost-bg`, `--truecost-border`, `--truecost-saving` — same approach
- Map: `--map-tile-filter` (CSS filter for OSM tiles in dark mode — `invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)`), `--map-cluster-bg`, `--map-cluster-text`, `--map-pin-shadow`, `--map-user-marker`
- Elevation: `--shadow-sm`, `--shadow-md`, `--shadow-lg` (different in dark — softer, slightly more spread, no blue tint)
- Motion: `--motion-fast` (120 ms), `--motion-base` (200 ms), `--motion-slow` (320 ms), `--ease-standard`, `--ease-emphasised`

### 3.3 Theme variants

Three theme options exposed in settings: `system` (default), `light`, `dark`. The `<html>` element carries one of `data-theme="light"` or `data-theme="dark"` at all times — never `system`. The resolver picks based on user preference and `prefers-color-scheme` listener.

**Light theme is also new** — today nothing renders correctly in light. We commit to shipping a polished light theme as part of SP-3 (it's also necessary for sane share-card OG images in SP-8 and printable trip plans).

### 3.4 SSR flash prevention (FOUC)

Three-line inline script in `<head>`, before any stylesheet, executed pre-paint:

1. Read `localStorage.getItem('fillip-theme')` (`'system'` if missing).
2. If `'system'`, evaluate `matchMedia('(prefers-color-scheme: dark)').matches`.
3. Set `documentElement.dataset.theme = 'light' | 'dark'`.

The script is a string literal injected via `next/script` `beforeInteractive` strategy *or*, preferably, a raw `<script dangerouslySetInnerHTML>` directly in `app/layout.tsx` (ensures execution before *any* SSR-rendered markup paints). The script also adds a `meta name="color-scheme"` value of `light dark` so native form controls and scrollbars match.

To eliminate any remaining flash on the SSR markup itself, the root `<html>` is rendered with `suppressHydrationWarning` — the inline script's mutation diverges from server output by design.

### 3.5 Persistence + sync

- localStorage key: `fillip-theme` → `'system' | 'light' | 'dark'`
- On change in another tab: `storage` event listener re-runs the resolver
- On `prefers-color-scheme` change while in `system`: `MediaQueryList.addEventListener('change', …)` re-runs the resolver
- Theme toggle component (added to header / settings page) is a 3-state segmented control. Default state `system`, with sun/moon icons.
- Map tile filter and Recharts colours subscribe via a `useTheme()` hook backed by a tiny event emitter that fires on `MutationObserver` of `documentElement.dataset.theme`.

---

## 4. PWA

### 4.1 Manifest

`public/manifest.webmanifest`:

- `name: "Fillip — fuel prices that decide for you"`
- `short_name: "Fillip"`
- `description` matches App Store / Play Store summary draft
- `start_url: "/dashboard?utm_source=pwa"` — the `?utm_source=pwa` lets analytics distinguish installed users (tie-in for SP-3 success metrics)
- `scope: "/"`
- `display: "standalone"` (also list `"minimal-ui"` as fallback)
- `display_override: ["window-controls-overlay", "standalone"]` — desktop install gets a tighter chrome
- `orientation: "any"`
- `background_color`: matches `--bg-app` for resolved theme at install time
- `theme_color` per `<meta>`: dual-tagged with `media="(prefers-color-scheme: light)"` and `dark` so the OS chrome matches
- `categories: ["navigation","travel","utilities","finance"]`
- `dir: "ltr"`, `lang: "en-AU"`
- `prefer_related_applications: false` (no native app yet)
- `protocol_handlers`: deferred — out of scope MVP
- `share_target`: deferred to SP-8 (share-a-fill receiving end)
- `shortcuts`: 3 quick actions — "Cheapest near me", "Trip planner", "My alerts" (alerts entry no-ops pre-SP-5)

### 4.2 Icon set

Generated from a single 1024×1024 source SVG (logo land separately — see master §5.1). Required outputs:

- `icon-192.png`, `icon-512.png` (required by spec)
- `icon-192-maskable.png`, `icon-512-maskable.png` (`purpose: "maskable"` — safe-zone artwork)
- `icon-monochrome-512.png` (`purpose: "monochrome"` — for OS adaptive themes)
- `apple-touch-icon-180.png` (iOS)
- `favicon.svg` (modern), `favicon-32.png`, `favicon-16.png` (legacy)
- `og-default.png` 1200×630 (separate from share-a-fill in SP-8 — this is for `/`, `/dashboard`, generic links)

All icons honour both light and dark bg, since iOS shows the icon over either; design with on-canvas background, no transparency, consistent corner radius the OS will mask.

### 4.3 Install-prompt UX

We do **not** auto-pop `beforeinstallprompt` (creep). Instead:

- Capture the event, stash the deferred prompt in a context.
- A persistent but unobtrusive "Install" item appears in the header overflow menu, and as a one-time toast on the **third** dashboard visit (per device) — toast dismissable, dismissal remembered for 60 days.
- The toast's primary CTA calls `prompt()` on the deferred event. If unavailable (Safari iOS), the toast routes to a `/install` help page with platform-specific instructions (iOS Share → Add to Home Screen).
- Track install outcome via the `appinstalled` event for analytics.

### 4.4 Service worker — skeleton + scope

**File:** `public/sw.js` (must be at site root for `scope: "/"`).
**Registration:** Client-side from a `<PwaRegistrar />` component mounted in `app/layout.tsx`, gated on `'serviceWorker' in navigator` and not on `localhost` unless `NEXT_PUBLIC_SW_DEV=1`.
**Update model:** `skipWaiting` + `clients.claim` triggered explicitly via a "New version available — refresh" toast (avoids surprise reloads mid-interaction). `registration.update()` polled every 30 minutes.

**Cache strategies:**

| Asset class | Strategy | Cache name | TTL / cap |
|---|---|---|---|
| App shell HTML (`/dashboard`, `/`, `/login`) | network-first, fall back to cache | `fillip-shell-v{BUILD}` | revalidates on each load |
| Static build assets (`/_next/static/*`) | cache-first, immutable | `fillip-static-v{BUILD}` | inherited from build hash |
| Images (`/leaflet/*`, icons, logos, og) | cache-first | `fillip-img-v1` | 30 days, 60 entries |
| OSM tiles (`https://*.tile.openstreetmap.org/*`) | stale-while-revalidate | `fillip-tiles-v1` | 7 days, 800 entries |
| `/api/prices*` (the offline cache) | **stale-while-revalidate**, return cached if fresh < 60 s, else fetch + revalidate | `fillip-prices-v1` | 24 h, 30 entries |
| `/api/prices/history*` | stale-while-revalidate | `fillip-history-v1` | 24 h, 60 entries |
| `/api/search*`, `/api/auth/*` | network-only, never cache | — | — |
| Everything else `/api/*` | network-only | — | — |

**Offline behaviour:** if `/api/prices` fetch fails entirely, the SW returns the most recent cached payload with a `X-Fillip-Stale: 1` header. The client detects the header and shows a small "offline — prices may be out of date" badge in the FilterBar.

**Reserved for SP-5 (defined here, no-op now):**

- `self.addEventListener('push', …)` — empty handler with TODO comment referencing SP-5
- `self.addEventListener('notificationclick', …)` — opens `event.notification.data.url || '/dashboard'`
- `self.addEventListener('pushsubscriptionchange', …)` — re-subscribes via `/api/push/subscribe` (endpoint also reserved, not built in SP-3)

We commit the empty handlers in SP-3 so the deployed SW already has push capability when SP-5 ships — avoids forcing every user to refresh + re-grant SW updates on launch day.

**Workbox vs hand-rolled:** recommend **Workbox via `@serwist/next`** (Next 15+/16-compatible Workbox fork). Hand-rolling is ~200 lines we don't want to maintain. Serwist also auto-precaches the build manifest so app-shell hits work first-paint after install.

### 4.5 Offline shell

Minimal "you're offline and we have no cached data yet" page at `/offline`, dark-themed, branded, with a "retry" button. SW serves it as the navigation fallback when both network and shell cache miss.

---

## 5. Performance budget

### 5.1 Targets (from master §4 D5)

- **Map interactive < 2 s on simulated 4G** (Lighthouse `Slow 4G` throttling, mid-tier mobile CPU)
- **Lighthouse score ≥ 90** in all four categories (Performance, Accessibility, Best Practices, SEO) on `/dashboard`, `/`, `/login`

### 5.2 Specific budgets

| Metric | Target | Notes |
|---|---|---|
| LCP | < 2.0 s | Hero stat bar / first station card |
| INP | < 200 ms | Especially radius slider, fuel switch |
| CLS | < 0.05 | Stat bar shifts on data load are the current offender |
| TBT | < 200 ms | Map JS dominates; needs splitting |
| Initial JS (gzipped) | < 180 kB | Today: ~340 kB (Recharts + Leaflet + cluster) |
| Initial CSS | < 25 kB | Tailwind v4 already lean; mainly Leaflet + cluster CSS |
| Total transfer first load | < 500 kB | |
| Time to map tiles visible | < 1.6 s on 4G | Tiles are the slowest hop |

### 5.3 Enforcement mechanism

- **Lighthouse CI** as a GitHub Action on every PR. Config: 3 runs averaged, mobile profile, blocking thresholds = Performance 90 / A11y 95 / Best Practices 90 / SEO 90. Failures comment on PR with median score + delta vs main.
- **`@next/bundle-analyzer`** wired into `npm run analyze`; CI uploads the JSON report as a build artifact.
- **`size-limit`** with explicit per-route budgets in `package.json`, run as a CI step. Fails the build on regression.
- **WebPageTest** scheduled run weekly against production, results piped to a Slack/Discord webhook (out of scope for SP-3 to wire the channel; just produce the script).

### 5.4 Specific optimisations SP-3 commits to

- **Code-split Recharts:** lazy-load only when popup or detail opens (`dynamic(() => import('recharts'))`). Saves ~110 kB initial.
- **Code-split Leaflet + cluster:** already `dynamic(..., { ssr: false })` for `MapView` — keep, but also hoist marker-cluster CSS into the dynamic chunk via a single `import('./map.css')` in `MapView` (today CSS is imported eagerly).
- **Defer AdSense script** (`strategy="lazyOnload"`) — currently blocks main thread.
- **Inline critical CSS** for the dashboard shell (Next.js default does this for App Router).
- **Self-host Inter** via `next/font` (no Google Fonts hop), with `display: 'swap'` and explicit `preload` for the weights actually used (400, 600, 700, 900).
- **Replace inline SVG icons** in DashboardClient (IconMap, IconList, IconTrends, etc.) with a single sprite sheet — saves ~3 kB and de-duplicates the path data, also makes them theme-aware via `currentColor`.
- **Image policy:** `next/image` everywhere (today the leaflet markers are PNG served directly). Brand and ad creative serve as AVIF with WebP fallback.
- **Tile prefetch:** prefetch the four tiles around the user's resolved location before the map mounts, via `<link rel="prefetch">` injected from the server when geolocation is in cookie/session.

---

## 6. Card / popup / detail redesigns

### 6.1 Information hierarchy — shared principles

Per master §3.1 ("decide, don't display") every surface answers three questions in order, big to small:

1. **What's the price** (huge tabular-numeric figure).
2. **Should I act on it** — verdict chip (SP-4 slot) + price-delta indicator.
3. **What does it really cost me** — true-cost number (SP-6 slot, with `From the pylon: X¢` secondary line).

Then the supporting data: station identity, distance, time of last update, history chart (popup/detail only), navigation actions.

### 6.2 `StationCard` redesign

Current card: rank pill + name + dist/time + price + delta. Functional but undifferentiated.

New layout (single row, list view, 72 px tall — was 64):

```
[rank  ]  [Brand glyph]  Name                              [Verdict chip]  [PRICE]
                         Address · 2.4 km · 5 min ago      [True-cost  ]  [Δ7d]
```

- **Brand glyph** (24 × 24): tiny coloured square or initialised disk per brand (Shell red, BP green, Caltex teal, etc.). Tokenised palette — neutral grey for unknown. Lifts visual rhythm without imagery licensing risk.
- **Verdict chip slot**: 56 × 22 pill, top-right of the text block, *visible from SP-4 onwards*. In SP-3 the slot is reserved as an empty `<div data-slot="verdict" />` so SP-4 has nowhere to negotiate space later.
- **True-cost slot**: under the verdict chip, smaller pill `Pay 167.4¢ • saves 6¢` style. Reserved similarly.
- **Price**: still the dominant element, right-aligned, tabular-nums, switches to `--text-primary`. Stays at 24 px.
- **Δ7d**: under the price, with caret and `--price-down`/`--price-up` colour.
- **Selected state**: 3 px left bar in `--accent` + `--bg-surface-raised` — same model as today, just tokenised.
- **Touch target**: whole row is the click target, `min-height: 72px` (Apple HIG minimum 44 × 44, so we're well above).
- **Focus ring**: 2 px solid `--border-focus` inset, with `outline-offset: -2px` so it sits inside the card. Visible on `:focus-visible` only.
- **Loading skeleton**: shimmer matches the new skeleton shape, not the old.

### 6.3 `StationPopup` (Leaflet popup, 320 px wide)

Current: huge price, period-change line, name/brand/address, ad banner, time-range pills, area chart, two big nav buttons. Keep most of it, but:

- Add **verdict chip slot** in the price row, between price and timestamp (top-right corner).
- Add **true-cost line** directly under the price, before the period-change line. Slot-only in SP-3.
- Compact the name/brand/address triplet into one line where possible (`Name · Brand`, address on second line).
- Move ad banner **below the chart, above the nav buttons** — currently it splits content awkwardly. Keep dimensions exact (300 × 50).
- Recharts area gradient stops and stroke pull from `--accent` (today hard-coded `#f59e0b`). Tooltip background pulls from `--bg-overlay`.
- Add a small "favourite" star button in the price row (SP-5 dependency — SP-3 ships the button as disabled-but-present so SP-5 only wires the action, not the layout).
- Add a **share button** next to the favourite (SP-8 — same pattern, disabled in SP-3).

### 6.4 `StationDetail` (right-side panel desktop / bottom sheet mobile, 400 px wide)

This is where the biggest design debt sits — currently white-on-light while everything else is dark-on-dark. Full re-skin:

- All Tailwind classes route through theme tokens (e.g. `bg-white` → `bg-surface`, `text-slate-900` → `text-primary`, `bg-sky-500` → `bg-accent`).
- **Verdict chip slot** prominently above the hero price.
- **True-cost line** directly under the hero price (`You pay 167.4¢/L  •  saves 6¢ vs pylon`).
- New **"share fill" button** (SP-8 slot, disabled in SP-3).
- New **"create alert"** button (SP-5 slot, disabled in SP-3) — opens a sheet stub.
- "Nearby alternatives" section gains a verdict mini-chip per row.
- Recharts colour: brand accent in dark, secondary `--sky-500` in light *or* keep accent in both — recommend **accent in both** for consistency; revisit if it clashes with the bottom-sheet ad once that's themed.
- Mobile bottom sheet gets a 36 × 4 grab handle at the top edge and proper drag-to-dismiss (interaction model spelled out in §7.4).

### 6.5 Map markers (MapView)

`MapView.tsx` builds marker HTML as raw strings. Refactor to:

- Read tokens from a JS palette object (`getMapPalette()`) that subscribes to theme changes.
- Cluster icon: keep the donut shape, swap colours to tokenised set (cluster bg = `--accent`, text = `--accent-on`, ring = `--bg-app`).
- Price pin: keep the rounded rectangle, but the colour ramp from `getPinColour(price, min, max)` already returns gradient — verify legibility passes WCAG AA on both themes (likely needs a thin contrasting stroke in dark mode; `box-shadow: 0 0 0 1px rgba(0,0,0,0.2)` does it).
- OSM tiles in dark theme: apply CSS filter `var(--map-tile-filter)` on the tile layer's container. Cheap, no extra tile fetch, looks decent on OSM standard layer. **Open question**: switch to a true dark tile provider (Stadia Maps Dark, CartoDB Dark Matter)? Both have free tiers but require attribution. **Recommendation: filter for v1, switch to Stadia in Phase 2 if perf budget allows the extra hop.**

### 6.6 Reserved slots — the contract

To prevent SP-4/5/6/8 from re-litigating layout, SP-3 ships:

- A `<SlotVerdict station={…} />` component that renders `null` in SP-3 and is replaced wholesale in SP-4. Reserves the 56 × 22 chip footprint via `min-height` + `min-width`.
- A `<SlotTrueCost station={…} />` component with the same pattern for SP-6.
- A `<SlotShareButton station={…} disabled />` for SP-8.
- A `<SlotAlertButton station={…} disabled />` for SP-5.

Each component documented with the SP that owns its real implementation. Saves a redesign + visual-regression flap when each downstream SP lands.

---

## 7. Accessibility (WCAG 2.2 AA)

### 7.1 Checklist

- **Colour contrast**: every text/bg pair ≥ 4.5:1, large text ≥ 3:1. Verified by axe-core in CI on every Storybook story. Critical pairs in dark mode that need re-checking after token mapping: secondary text on raised surface; price-up/down colours on the row's selected background; ad-placeholder dashed border.
- **Focus management**: `:focus-visible` rings on every interactive element using `--border-focus` (2 px solid + 2 px offset). Mouse clicks don't trigger focus rings; keyboard nav does. Modal-style popups (StationDetail, install toast) trap focus while open and restore to the originating element on close.
- **Keyboard navigation**:
  - List ↑/↓ arrows already partially wired (`onArrowKey` in StationCard) — finish: Home/End jump to first/last, Enter/Space activate, Tab skips to next region.
  - Map markers: each `L.marker` exposes `keyboard: true` and `alt` text. Add a "Skip map, go to list" link visible on focus at the start of the map region.
  - Filter bar: chips are buttons, slider is a native `<input type="range">` (today it is; verify after redesign).
  - Mobile bottom nav: arrow-key navigation between tabs, `aria-current="page"`.
- **Screen reader semantics**:
  - Each station card: `role="button"` (already), `aria-label="{name}, {price}¢, {distance} km, ranked {n}"`, `aria-pressed` when selected.
  - Map: `role="application"` with `aria-roledescription="Interactive map of fuel stations"` and a hidden `<h2>` for orientation.
  - Marker cluster: `aria-label="{count} stations clustered, double-click to expand"`.
  - Popup: announced as `role="dialog"` with `aria-modal="false"` (Leaflet popups aren't truly modal), focus moves into popup on open.
  - Stat bar: each cell `role="status"` with `aria-live="polite"`, `aria-atomic="true"` so updates announce as one piece.
  - Theme toggle: `role="radiogroup"` with three `radio` children (`system`, `light`, `dark`) and a group label.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables: panel slide-in, toast slide-in, map pan animations (`map.panTo({ animate: false })` when the media query matches), marker cluster spider animation. Tested via Storybook viewport.
- **Forced colours mode**: ensure `forced-colors: active` doesn't break the price pins; provide explicit `border` (not just `background`) on every chip so they remain perceivable.
- **Touch targets**: 44 × 44 minimum. Today's mobile-nav icons are borderline — bump to 48 × 48.
- **Form labels**: all native form controls (radius slider, fuel select, login form) have associated `<label>` or `aria-labelledby`.
- **Heading order**: `<h1>` per page (currently missing in DashboardClient), `<h2>` for major regions (List, Map, Filters), `<h3>` inside detail panel sections.
- **Landmarks**: `<header>`, `<nav>`, `<main>` (already present), `<aside>` for the detail panel, `<footer>` for ad attribution + privacy links.
- **Skip link**: "Skip to main content" already attempted via `<main id="main-content">`; add the actual `<a href="#main-content">` in the header.
- **`prefers-contrast: more`**: optional — recommend a third `[data-contrast="more"]` token override that bumps text to pure white/black and borders to `--border-strong`. Defer implementation to post-MVP if time-pressured; declare the tokens now.

### 7.2 Tooling

- `@axe-core/react` in dev mode logs to console.
- `@storybook/addon-a11y` runs axe on each story.
- `vitest-axe` for component-level a11y assertions in unit tests.
- `eslint-plugin-jsx-a11y` already standard in Next.js — verify enabled.

---

## 8. Ad slots

Per master §4 D5: **keep the existing 3 slots**, fuel-related creative only, no removal.

| Slot | Today | After SP-3 | Dimensions | Strategy |
|---|---|---|---|---|
| Bottom banner (mobile) | `AdCard.tsx`, dark-only inline styles | Theme-aware via tokens; lazy-load via `IntersectionObserver` 200 px before viewport entry | 320 × 50 (mobile leaderboard) | AdSense responsive banner |
| Sidebar / between cards | not yet rendered? | Inserted as the 4th and every 12th card in StationList; tokenised; lazy-load | 300 × 250 (medium rectangle) | AdSense in-feed |
| Popup banner | inside `StationPopup.tsx` | Theme-aware; only renders when popup actually opens (already true); lazy-load deferred until chart paints | 300 × 50 (small banner) | AdSense banner |

**Theme behaviour:** AdSense doesn't theme creative — but the surrounding container, dashed dev placeholder, "Advertisement" label, and dividers are all token-aware. Light theme container: `bg-surface-sunken` with `border-subtle`; dark: same tokens, different resolved values.

**Performance:** AdSense `<script>` loaded with `strategy="lazyOnload"`. First ad push deferred to after `requestIdleCallback` so it never blocks LCP. Each `<ins>` reserves its own dimensions to prevent CLS.

**Fuel-related creative gate:** category restriction is configured in AdSense console (out of code scope), but SP-3 documents the requirement and links to the AdSense policy page for whoever owns ops.

**Dev placeholder pattern:** keep the existing `DEV_PLACEHOLDER` gate. Standardise the placeholder visual across all three slots so Storybook shots are stable.

---

## 9. Test strategy

### 9.1 Storybook

- Stand up Storybook 8 with Next.js framework adapter, Tailwind v4 wired via the same `globals.css` the app uses.
- Stories per surface in scope: `StationCard` (selected / unselected / cheapest / loading / verdict-present / true-cost-present), `StationPopup` (loading / no-history / 24h / 7d / dark / light / reduced-motion), `StationDetail` (mobile sheet / desktop panel / no-nearby / dark / light), `AdCard` (each slot, dev / prod placeholder, dark / light), `FilterBar`, `Toast`, `ThemeToggle`.
- Storybook is the source-of-truth gallery for sign-off — every redesign is reviewed in Storybook before integration.

### 9.2 Visual regression

- `@storybook/test-runner` + Playwright snapshot per story across `[light, dark] × [mobile, desktop]` viewports = 4 shots per story. Diffs flagged as PR comments via Chromatic-equivalent CI step (`reg-suit` if we want to self-host; Chromatic's free tier is the path of least resistance).
- Threshold: 0.1% pixel diff before flag. Anti-aliasing tolerance on text.

### 9.3 a11y

- axe runs in every Storybook story (addon).
- Lighthouse a11y ≥ 95 in CI (see §5.3).
- Manual screen-reader pass (VoiceOver iOS Safari, NVDA Chrome, TalkBack Android) once per release on the dashboard happy path. Owner: cdenn for v1; documented in a checklist file in the repo.

### 9.4 Unit / integration

- Existing Vitest suite continues — add new tests for theme resolver, SW message protocol, install-prompt context, slot components rendering null/footprint correctly.
- E2E (Playwright): one happy-path test for "load dashboard offline shows cached prices with stale badge" since this is the highest-risk new behaviour.

### 9.5 Performance

- Lighthouse CI per §5.3.
- A burn-down dashboard (manual for now) of bundle size per route, updated weekly.

---

## 10. Implementation phases (within SP-3)

This sub-project itself has internal sequencing — captured here so the implementation plan can pick it up.

1. **Phase 1 — tokens.** Define CSS variables + Tailwind v4 `@theme` mapping, write the FOUC-prevention script, theme toggle component, light + dark resolved values. Convert `StationCard`, `StationPopup`, `MapView` (palette object), `AdCard`, `DashboardClient` from inline styles to tokenised inline styles. Convert `StationDetail` Tailwind classes to token-backed classes. **No visual change in dark mode**, light mode begins to render correctly.
2. **Phase 2 — card redesigns.** New StationCard / StationPopup / StationDetail layouts with reserved slots. Storybook stories. Visual regression baselined.
3. **Phase 3 — PWA shell.** Manifest, icons, install-prompt UX, service worker via Serwist with the cache strategies from §4.4 (push handlers stubbed). Offline page.
4. **Phase 4 — A11y pass.** Skip link, focus rings, ARIA, keyboard nav completion, reduced-motion, axe baseline.
5. **Phase 5 — Performance.** Recharts + Leaflet code-split, AdSense lazy, sprite sheet, Lighthouse CI, bundle-size CI, font self-host.
6. **Phase 6 — Hardening.** Cross-browser test, install on iOS/Android/desktop Chrome, screen-reader pass, ship.

Each phase ends with a green CI run + Storybook review + docs update. Phases 2–5 can partially parallelise once Phase 1 lands.

---

## 11. Open questions (with recommended defaults)

| # | Question | Recommended default | Decision pending? |
|---|---|---|---|
| Q1 | CSS vars in `:root` + `[data-theme]` vs Tailwind `dark:` variant? | **CSS vars** (per §3.1 reasoning) | No — proceed |
| Q2 | Brand accent stays amber, or shift with rebrand? | Stay amber for SP-3; rebrand may shift in SP-0 | **Pending SP-0 visual identity** |
| Q3 | Workbox (via Serwist) vs hand-rolled SW? | **Serwist** | No — proceed |
| Q4 | OSM dark-mode tiles via CSS filter or new tile provider? | **CSS filter for v1**, Stadia/CartoDB Dark Matter Phase 2 | No — proceed |
| Q5 | AdSense in dark mode — accept un-themed creative? | **Yes** for v1; surrounding chrome themed; explore AdSense "responsive content" later | No |
| Q6 | Recharts secondary colour in light mode — accent or sky? | **Accent (amber) in both themes** for brand consistency; revisit if ad clash | No — proceed, revisit at Phase 2 review |
| Q7 | Is `prefers-contrast: more` in MVP or post-MVP? | Tokens declared, **implementation post-MVP** unless Phase 4 has time | **Pending capacity** |
| Q8 | Should the install-prompt toast appear on visit 3 or visit 5? | **Visit 3** (matches Hooked-style habit threshold), reassess after analytics | No — proceed |
| Q9 | Self-host Inter, or use `next/font` Google fetch? | **Self-host via `next/font/local`** — eliminates Google hop, avoids cookie banner concerns | No — proceed |
| Q10 | Visual regression — Chromatic (paid free tier) vs `reg-suit` (self-host) vs `playwright-test` snapshots? | **Playwright snapshots committed to repo**, reviewed in PRs; Chromatic if grows painful | No — proceed |
| Q11 | Brand glyph palette — license/source? | Hand-pick neutral tinted disks; no real brand logos (avoids trademark issue) | No — proceed |
| Q12 | Skip link target — `#main-content` is `tabIndex={-1}` — works in Safari? | Verify in Phase 4 hardening; fall back to focus-on-first-card if Safari-quirky | **Pending Phase 4 verification** |
| Q13 | Service worker scope clash with Cloudflare Tunnel (master arch §4.3)? | None expected — SW is browser-side, tunnel is server-side. Sanity-check during Phase 3 | **Pending Phase 3 verification** |
| Q14 | Where does the theme toggle live in the IA — header, settings page, or both? | **Both** — header overflow menu (1-tap) + settings page (canonical). | No — proceed |
| Q15 | True-cost slot should reserve space even pre-SP-6 (causing visible empty area) or be display:none? | **Reserve space** in card (1 line), **collapse** in popup/detail. Card layout shouldn't shift on SP-6 launch. | No — proceed |

---

## 12. Definition of done (SP-3)

- [ ] All in-scope surfaces render correctly in `system`, `light`, `dark` themes with no FOUC.
- [ ] Lighthouse ≥ 90 in all four categories on `/dashboard`, `/`, `/login` (mobile profile, simulated 4G).
- [ ] Map interactive < 2 s on simulated 4G in three runs averaged.
- [ ] PWA installable on iOS Safari, Android Chrome, desktop Chrome, desktop Edge — verified manually.
- [ ] App functions offline for cached stations, with a visible stale-data badge.
- [ ] Service worker has stub `push`, `notificationclick`, `pushsubscriptionchange` handlers committed.
- [ ] Storybook published with all in-scope surfaces × theme × viewport.
- [ ] axe-core reports zero violations across all stories.
- [ ] Visual regression baseline committed; CI fails on uncovered diffs.
- [ ] Reserved slots (`SlotVerdict`, `SlotTrueCost`, `SlotShareButton`, `SlotAlertButton`) shipped and consumed by every station surface.
- [ ] Existing 3 ad slots render in both themes, lazy-loaded, no CLS impact, dev placeholders standardised.
- [ ] Manual screen-reader pass completed and documented for dashboard happy path.
- [ ] CLAUDE.md updated with token system, SW behaviour, and PWA install notes for the next session.

---

## 13. Cross-references

- **Master spec:** `2026-04-22-fillip-master-design.md` §3 (principles), §4 D5 (UX), §5.4 (ads), §6.3 (SW + VAPID note), §7 (sub-project graph), §8 (success metrics — instrumentation lives here).
- **Downstream specs that consume SP-3 contracts:** SP-4 (verdict slot), SP-5 (alert button slot + push SW handlers + offline cached subscribers), SP-6 (true-cost slot), SP-7 (tokens applied to trip pages), SP-8 (share button slot + offline-friendly OG fetch).
- **Upstream:** SP-0 (rebrand) — if logo/brand colour shifts, SP-3 token primitives shift with it; the semantic layer is stable.
