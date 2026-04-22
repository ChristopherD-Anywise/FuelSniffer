# Fillip SP-0 — Rebrand + Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename FuelSniffer → Fillip across every user-visible surface, introduce a CSS-custom-property theme-token layer with both light and dark themes plus a working user-facing toggle, configure a `fillip.clarily.au` public-URL, and add a no-transport email-sender identity stub — without changing any data, auth, scraper, or ad behaviour.

**Architecture:** Two `tokens.css` blocks (`[data-theme="light"]` = new clean light palette; `[data-theme="dark"]` = the *exact* hex values currently in `globals.css` so dark renders pixel-identical). A small client `ThemeProvider` mutates `<html data-theme>`, persists choice to `localStorage` and a `fillip-theme` cookie (the cookie is what `layout.tsx` reads server-side to set the initial `data-theme` attribute and avoid FOUC). A floating-button `ThemeToggle` (sun/moon) renders inside the root `layout.tsx` so every page gets it without per-page wiring (no `AppHeader` exists in this codebase). A greppy `branding.test.ts` enforces zero `fuelsniffer` matches under `src/app/**`, `src/components/**`, `src/lib/**` (with a small allowlist for the `fuelsniffer` postgres database/user references that are deliberately preserved in `src/lib/db/README.md`). All scope boundaries from the spec §0 amendments and §2 non-goals are honoured.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Vitest 4 + happy-dom + @testing-library/react · Playwright 1.59 · Docker Compose · PostgreSQL 17 / PostGIS (untouched) · Drizzle (untouched).

---

## File Structure

**Files created** (all under `fuelsniffer/`):

| Path | Responsibility |
|---|---|
| `src/styles/tokens.css` | Two theme blocks (`[data-theme="light"]`, `[data-theme="dark"]`) defining the stable token contract |
| `src/lib/theme/ThemeProvider.tsx` | Client provider — mutates `<html data-theme>`, persists to localStorage + cookie |
| `src/lib/theme/useTheme.ts` | Re-export of context hook for consumers |
| `src/lib/theme/getInitialTheme.ts` | Server helper that reads `fillip-theme` cookie + `APP_DEFAULT_THEME` env, returns initial theme attribute (no FOUC) |
| `src/components/ThemeToggle.tsx` | Floating sun/moon button cycling System → Light → Dark |
| `src/lib/email/sender.ts` | `getDefaultSender()` returning `{name, address}` from env or fallback |
| `src/lib/config/publicUrl.ts` | `getPublicUrl()` returning a validated `URL` instance from `APP_PUBLIC_URL` env |
| `src/__tests__/email/sender.test.ts` | Unit test — env override + fallback |
| `src/__tests__/theme/ThemeProvider.test.tsx` | Unit test — provider sets attribute, toggle persists |
| `src/__tests__/theme/getInitialTheme.test.ts` | Unit test — cookie + env precedence |
| `src/__tests__/theme/ThemeToggle.test.tsx` | Unit test — cycles through three states |
| `src/__tests__/config/publicUrl.test.ts` | Unit test — validation + default |
| `src/__tests__/branding.test.ts` | Greppy regression — zero `fuelsniffer` (case-insensitive) outside allowlist |
| `src/__tests__/branding.playwright.ts` | E2E smoke — `<title>`, no `FuelSniffer` text, `data-theme` set, station card renders |
| `.env.example` | Updated with new vars |

**Files modified:**

| Path | Change |
|---|---|
| `package.json` | `"name": "fillip"`, add `test` + `test:run` + `test:e2e` scripts (currently missing — needed for the test suite to be runnable) |
| `src/app/layout.tsx` | Wire `ThemeProvider`, set initial `data-theme` from server cookie helper, add `<ThemeToggle />`, change `metadata.title` + `description`, add `metadataBase` from `getPublicUrl()` |
| `src/app/page.tsx` | (Inspect — root page; rename if it has a brand string) |
| `src/app/dashboard/page.tsx` | `metadata.title` rebrand |
| `src/app/dashboard/trip/page.tsx` | `metadata.title` rebrand |
| `src/app/globals.css` | Import `../styles/tokens.css`; replace literal hex with `var(--…)`; preserve audit comment but reword |
| `src/lib/db/README.md` | Reword non-DB-name occurrences; keep the `psql -U fuelsniffer` literals (db user untouched per §2 / §10 Q3) |
| `README.md` | Top-to-bottom rewrite for Fillip framing |
| `AGENTS.md` | Append a Fillip project block under existing nextjs-agent-rules (prepending would alter the BEGIN/END marker contract) |
| `CLAUDE.md` | Add a Fillip project block; current file is a one-line `@AGENTS.md` include |
| `docker-compose.yml` | Add `container_name: fillip-*` to all four services; pass new env vars to `app` |
| `Dockerfile` | Add `LABEL org.opencontainers.image.title="Fillip"` etc.; no functional change |
| `next.config.mjs` | No change (no metadataBase here today) — verify only |
| `vitest.config.ts` | No change — confirm and document |

**Deliberately NOT changed** (per §2 / §5.5 / §5.6):
- `POSTGRES_DB`, `POSTGRES_USER`, `DATABASE_URL` connection string, volume paths, backup filename prefix `fuelsniffer_${TIMESTAMP}.sql.gz` — preserve `fuelsniffer` postgres role/db
- Folder name `fuelsniffer/`
- Drizzle schema in `src/lib/db/schema.ts`
- Service keys (`app`, `postgres`, `db-backup`, `cloudflared`) — only `container_name` is added
- Inline-style hex literals in 21 components (204 hits) — these are SP-3's job; SP-0 only does globals.css. Light mode will look partially-broken on detail components — accepted in §0 amendment

---

## Task 0: Branch and baseline

**Files:** none

- [ ] **Step 1: Confirm branch**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git status
git branch --show-current
```

Expected: working dir clean, branch `fuel-spy`. If not on `fuel-spy`, run `git checkout fuel-spy`.

- [ ] **Step 2: Capture pre-change baseline for the PR**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
grep -rci "fuelsniffer" src | sort | head -10
```

Record the count somewhere (PR description). After SP-0 the only matches under `src/` should be inside `src/lib/db/README.md` (intentional `psql -U fuelsniffer` examples) and the `branding.test.ts` allowlist.

- [ ] **Step 3: Confirm vitest is wired**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest --version
```

Expected: prints a 4.x version. No commit needed for this task.

---

## Task 1: Add npm test scripts (prerequisite — currently missing)

**Files:**
- Modify: `fuelsniffer/package.json`

The `package.json` defines vitest as a devDep but has no `test` script. Without this, every later test step has to invoke `npx vitest …` directly. Adding scripts now makes every later command shorter and matches what humans expect.

- [ ] **Step 1: Inspect current scripts block**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
grep -A 6 '"scripts"' package.json
```

Expected output:
```
  "scripts": {
    "dev": "next dev --port 4000",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
```

- [ ] **Step 2: Add test scripts**

Edit `fuelsniffer/package.json`. Replace the scripts block above with:

```json
  "scripts": {
    "dev": "next dev --port 4000",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test"
  },
```

- [ ] **Step 3: Verify scripts work**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npm run test:run -- --run --reporter=basic 2>&1 | tail -5
```

Expected: vitest discovers and runs the existing test suite (some may fail unrelated to SP-0 — record any pre-existing failures as a baseline so we don't blame SP-0 for them later).

- [ ] **Step 4: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/package.json
git commit -m "chore(fillip): add test/test:run/test:e2e npm scripts (SP-0 prep)"
```

---

## Task 2: Create the branding regression test

**Files:**
- Create: `fuelsniffer/src/__tests__/branding.test.ts`

This is the spine of the PR (spec §9). Write it FIRST so subsequent rename tasks can be validated by it.

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/branding.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The Fillip rebrand (SP-0) requires that no user-visible code path
 * contains the string "fuelsniffer" (any case). The only deliberate
 * exceptions are listed in ALLOWLIST below — these reference the
 * postgres database/role name which is intentionally preserved
 * (master spec §10 Q3, SP-0 spec §2 non-goals).
 */

const ROOTS = ['src/app', 'src/components', 'src/lib']
const PATTERN = /fuelsniffer/i

const ALLOWLIST: ReadonlyArray<string> = [
  // psql -U fuelsniffer examples — db role name is preserved per spec §2
  'src/lib/db/README.md',
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '__tests__'])
const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2'])

function walk(dir: string, base: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) {
      walk(full, base, out)
    } else {
      const ext = name.slice(name.lastIndexOf('.'))
      if (SKIP_EXTENSIONS.has(ext)) continue
      out.push(relative(base, full))
    }
  }
}

describe('branding: zero "fuelsniffer" outside allowlist', () => {
  const cwd = process.cwd()
  const offenders: string[] = []
  for (const root of ROOTS) {
    const files: string[] = []
    walk(join(cwd, root), cwd, files)
    for (const rel of files) {
      if (ALLOWLIST.includes(rel)) continue
      const content = readFileSync(join(cwd, rel), 'utf8')
      if (PATTERN.test(content)) offenders.push(rel)
    }
  }

  it('finds zero matches under src/app, src/components, src/lib', () => {
    expect(offenders, `unexpected "fuelsniffer" in:\n${offenders.join('\n')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails (because we haven't done the rename yet)**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/branding.test.ts
```

Expected: FAIL. The "offenders" list should include at minimum `src/app/layout.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/trip/page.tsx`. Record this.

- [ ] **Step 3: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/__tests__/branding.test.ts
git commit -m "test(fillip): branding regression test (currently failing — Task 3 fixes)"
```

---

## Task 3: Rebrand strings in src/app

**Files:**
- Modify: `fuelsniffer/src/app/layout.tsx` (lines 16-18 — metadata title/description)
- Modify: `fuelsniffer/src/app/dashboard/page.tsx` (line 7 — metadata.title)
- Modify: `fuelsniffer/src/app/dashboard/trip/page.tsx` (line 7 — metadata.title)

The branding test from Task 2 is the failing test. We do not write a new failing test per file — Task 2 covers the regression for all three.

- [ ] **Step 1: Update root layout metadata**

Edit `fuelsniffer/src/app/layout.tsx`. Change:

```ts
export const metadata: Metadata = {
  title: "FuelSniffer",
  description: "Real-time Queensland and NSW fuel price tracker",
};
```

to:

```ts
export const metadata: Metadata = {
  title: "Fillip — find cheap fuel across Australia",
  description: "Fillip helps Australian drivers find the cheapest fuel near them and across their route. Real-time prices, trend tracking, and national coverage.",
};
```

- [ ] **Step 2: Update dashboard metadata**

Edit `fuelsniffer/src/app/dashboard/page.tsx`. Change:

```ts
export const metadata: Metadata = {
  title: 'FuelSniffer — Cheapest fuel near North Lakes',
}
```

to:

```ts
export const metadata: Metadata = {
  title: 'Fillip — Cheapest fuel near you',
}
```

- [ ] **Step 3: Update trip planner metadata**

Edit `fuelsniffer/src/app/dashboard/trip/page.tsx`. Change:

```ts
export const metadata = {
  title: 'Trip Planner — FuelSniffer',
  description: 'Find the cheapest fuel along your route',
}
```

to:

```ts
export const metadata = {
  title: 'Trip Planner — Fillip',
  description: 'Find the cheapest fuel along your route',
}
```

- [ ] **Step 4: Re-grep src/app and src/components and src/lib for any remaining matches**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
grep -rin "fuelsniffer" src/app src/components src/lib
```

Expected: only matches inside `src/lib/db/README.md` (the `psql -U fuelsniffer` lines are intentional; preserved per spec §2). If anything else appears, fix it now.

- [ ] **Step 5: Run the branding test — should now PASS**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/branding.test.ts
```

Expected: PASS. If it fails, the failure message lists the offending files — fix them.

- [ ] **Step 6: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/app/layout.tsx fuelsniffer/src/app/dashboard/page.tsx fuelsniffer/src/app/dashboard/trip/page.tsx
git commit -m "feat(fillip): rebrand page metadata (FuelSniffer → Fillip)"
```

---

## Task 4: Public-URL config helper

**Files:**
- Create: `fuelsniffer/src/lib/config/publicUrl.ts`
- Test: `fuelsniffer/src/__tests__/config/publicUrl.test.ts`

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/config/publicUrl.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPublicUrl } from '@/lib/config/publicUrl'

describe('getPublicUrl', () => {
  let original: string | undefined
  beforeEach(() => { original = process.env.APP_PUBLIC_URL })
  afterEach(() => {
    if (original === undefined) delete process.env.APP_PUBLIC_URL
    else process.env.APP_PUBLIC_URL = original
  })

  it('returns http://localhost:4000 when APP_PUBLIC_URL is unset', () => {
    delete process.env.APP_PUBLIC_URL
    expect(getPublicUrl().toString()).toBe('http://localhost:4000/')
  })

  it('returns the configured URL when APP_PUBLIC_URL is valid', () => {
    process.env.APP_PUBLIC_URL = 'https://fillip.clarily.au'
    expect(getPublicUrl().toString()).toBe('https://fillip.clarily.au/')
  })

  it('throws when APP_PUBLIC_URL is set but malformed', () => {
    process.env.APP_PUBLIC_URL = 'not a url'
    expect(() => getPublicUrl()).toThrow(/Invalid APP_PUBLIC_URL/)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/config/publicUrl.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/config/publicUrl'`.

- [ ] **Step 3: Implement**

Create `fuelsniffer/src/lib/config/publicUrl.ts`:

```ts
/**
 * Returns the public-facing URL for this Fillip deployment.
 * Reads APP_PUBLIC_URL; defaults to http://localhost:4000 for dev.
 * Throws at call time if APP_PUBLIC_URL is set but unparseable.
 */
export function getPublicUrl(): URL {
  const raw = process.env.APP_PUBLIC_URL
  if (!raw) return new URL('http://localhost:4000')
  try {
    return new URL(raw)
  } catch (cause) {
    throw new Error(`Invalid APP_PUBLIC_URL: ${raw}`, { cause })
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/config/publicUrl.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/lib/config/publicUrl.ts fuelsniffer/src/__tests__/config/publicUrl.test.ts
git commit -m "feat(fillip): add publicUrl config helper (APP_PUBLIC_URL)"
```

---

## Task 5: Email sender identity stub

**Files:**
- Create: `fuelsniffer/src/lib/email/sender.ts`
- Test: `fuelsniffer/src/__tests__/email/sender.test.ts`

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/email/sender.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDefaultSender } from '@/lib/email/sender'

describe('getDefaultSender', () => {
  let originalName: string | undefined
  let originalAddress: string | undefined
  beforeEach(() => {
    originalName = process.env.EMAIL_FROM_NAME
    originalAddress = process.env.EMAIL_FROM_ADDRESS
  })
  afterEach(() => {
    if (originalName === undefined) delete process.env.EMAIL_FROM_NAME
    else process.env.EMAIL_FROM_NAME = originalName
    if (originalAddress === undefined) delete process.env.EMAIL_FROM_ADDRESS
    else process.env.EMAIL_FROM_ADDRESS = originalAddress
  })

  it('returns Fillip defaults when env is unset', () => {
    delete process.env.EMAIL_FROM_NAME
    delete process.env.EMAIL_FROM_ADDRESS
    expect(getDefaultSender()).toEqual({
      name: 'Fillip',
      address: 'no-reply@fillip.local',
    })
  })

  it('honours env overrides when set', () => {
    process.env.EMAIL_FROM_NAME = 'Fillip Beta'
    process.env.EMAIL_FROM_ADDRESS = 'beta@fillip.clarily.au'
    expect(getDefaultSender()).toEqual({
      name: 'Fillip Beta',
      address: 'beta@fillip.clarily.au',
    })
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/email/sender.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/email/sender'`.

- [ ] **Step 3: Implement**

Create `fuelsniffer/src/lib/email/sender.ts`:

```ts
/**
 * Returns the default "from" identity for transactional Fillip email.
 *
 * SP-0 only ships this stub — there is NO transport, NO templating,
 * NO sending. SP-2 (auth: magic link) introduces Resend as the
 * transport and imports getDefaultSender() to populate the From header.
 *
 * Two env vars: EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS. Both fall back to
 * a placeholder so dev environments work without any setup.
 */
export function getDefaultSender(): { name: string; address: string } {
  return {
    name: process.env.EMAIL_FROM_NAME ?? 'Fillip',
    address: process.env.EMAIL_FROM_ADDRESS ?? 'no-reply@fillip.local',
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/email/sender.test.ts
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/lib/email/sender.ts fuelsniffer/src/__tests__/email/sender.test.ts
git commit -m "feat(fillip): email sender identity stub (no transport — SP-2 brings Resend)"
```

---

## Task 6: Theme tokens CSS

**Files:**
- Create: `fuelsniffer/src/styles/tokens.css`
- Modify: `fuelsniffer/src/app/globals.css`

The dark-theme block contains the **exact** hex values currently used in `globals.css`, so when default = system + OS = dark, the page renders pixel-identical to today.

- [ ] **Step 1: Create tokens.css**

Create `fuelsniffer/src/styles/tokens.css`:

```css
/*
 * Fillip theme tokens — SP-0
 *
 * The token NAMES below are the stable contract for SP-3 (UX core).
 * SP-3 will tune values, add semantic aliases, and run a proper a11y
 * pass. SP-0's job is only to:
 *   1. Establish the token names so components can adopt them
 *   2. Ship a functional dark theme (= the existing FuelSniffer values)
 *      so users who flip to dark see no regression
 *   3. Ship a clean baseline light theme so the rebrand has visible work
 *
 * Note on globals only: SP-0 routes globals.css through tokens.
 * Inline-style hex literals in 21 components (~204 hits) are SP-3's job.
 * In light mode, the dashboard chrome and globals will look correct,
 * but inline-styled cards will still be dark. This is the documented
 * trade-off (master spec §10 row 7).
 *
 * Brand accent is locked to amber (#f59e0b) per cross-cutting decision 5.
 */

:root,
[data-theme='light'] {
  --color-bg: #ffffff;
  --color-bg-elevated: #f5f5f7;
  --color-surface: #ffffff;
  --color-border: #e4e4e7;
  --color-text: #0f172a;
  --color-text-muted: #475569;
  --color-text-subtle: #64748b;
  --color-accent: #f59e0b;
  --color-accent-fg: #111111;
  --color-success: #16a34a;
  --color-warn: #ca8a04;
  --color-danger: #dc2626;
  --color-focus-ring: #2563eb;
  --color-popup-bg: #ffffff;
  --color-popup-border: #e4e4e7;
  --color-popup-close: #475569;
  --color-scrollbar-track: #f5f5f7;
  --color-scrollbar-thumb: #cbd5e1;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 16px rgba(15, 23, 42, 0.08);
}

[data-theme='dark'] {
  /* These values are the EXACT pre-SP-0 FuelSniffer palette.
     Default: when the user picks "Dark" the page looks pixel-identical
     to the FuelSniffer they are used to. SP-3 will polish. */
  --color-bg: #111111;
  --color-bg-elevated: #1a1a1a;
  --color-surface: #1a1a1a;
  --color-border: #2a2a2a;
  --color-text: #ffffff;
  --color-text-muted: #cccccc;
  --color-text-subtle: #8a8a8a;
  --color-accent: #f59e0b;
  --color-accent-fg: #111111;
  --color-success: #16a34a;
  --color-warn: #ca8a04;
  --color-danger: #dc2626;
  --color-focus-ring: #60a5fa;
  --color-popup-bg: #1a1a1a;
  --color-popup-border: #2a2a2a;
  --color-popup-close: #8a8a8a;
  --color-scrollbar-track: #111111;
  --color-scrollbar-thumb: #2a2a2a;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 8px 32px rgba(0, 0, 0, 0.6);
}
```

- [ ] **Step 2: Rewrite globals.css to consume tokens**

Replace the contents of `fuelsniffer/src/app/globals.css` with:

```css
@import 'tailwindcss';
@import '../styles/tokens.css';

/*
 * SP-0 (Fillip rebrand) — globals.css now consumes theme tokens from
 * tokens.css. The previous WCAG audit comment (FuelSniffer 2026-04-12)
 * is preserved in git history; SP-3 will run a fresh contrast pass over
 * both themes and re-record findings.
 */

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
  background: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Leaflet popup — themed via tokens */
.leaflet-popup-content-wrapper {
  background: var(--color-popup-bg) !important;
  border: 1px solid var(--color-popup-border) !important;
  border-radius: 12px !important;
  box-shadow: var(--shadow-md) !important;
}

.leaflet-popup-tip {
  background: var(--color-popup-bg) !important;
}

.leaflet-popup-close-button {
  color: var(--color-popup-close) !important;
}

/* Global focus ring — token-driven, visible on both themes */
*:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: 4px;
}

/* Station list scrollbar */
.station-list::-webkit-scrollbar {
  width: 4px;
}
.station-list::-webkit-scrollbar-track {
  background: var(--color-scrollbar-track);
}
.station-list::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar-thumb);
  border-radius: 2px;
}
```

- [ ] **Step 3: Verify globals.css contains zero raw hex literals**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
grep -E '#[0-9a-fA-F]{3,6}\b' src/app/globals.css
```

Expected: zero matches. If anything appears (other than perhaps inside `rgba(...)` numeric components), replace it with a token.

- [ ] **Step 4: Verify the build still works**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npm run build 2>&1 | tail -20
```

Expected: build succeeds. If it fails on CSS, investigate (Tailwind v4 import order matters — `tailwindcss` must come first).

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/styles/tokens.css fuelsniffer/src/app/globals.css
git commit -m "feat(fillip): theme tokens (light + dark) consumed by globals.css"
```

---

## Task 7: Server-side initial-theme helper (FOUC prevention)

**Files:**
- Create: `fuelsniffer/src/lib/theme/getInitialTheme.ts`
- Test: `fuelsniffer/src/__tests__/theme/getInitialTheme.test.ts`

The cookie name is `fillip-theme`. The provider (Task 8) writes it from the client; this helper reads it server-side from `next/headers` to set the initial `<html data-theme>` and prevent flash-of-incorrect-theme.

Tri-state: `'light' | 'dark' | 'system'`. When `'system'` the server emits no `data-theme` attribute (or `data-theme="light"` as a safe default), and a tiny inline `<script>` in `layout.tsx` (Task 9) flips to dark before paint if `prefers-color-scheme: dark`.

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/theme/getInitialTheme.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('next/headers', () => {
  let store: Map<string, string> = new Map()
  return {
    __setCookie: (name: string, value: string) => store.set(name, value),
    __clearCookies: () => { store = new Map() },
    cookies: async () => ({
      get: (name: string) => {
        const v = store.get(name)
        return v ? { name, value: v } : undefined
      },
    }),
  }
})

import * as headers from 'next/headers'
import { getInitialTheme, type Theme } from '@/lib/theme/getInitialTheme'

const setCookie = (headers as unknown as { __setCookie: (n: string, v: string) => void }).__setCookie
const clearCookies = (headers as unknown as { __clearCookies: () => void }).__clearCookies

describe('getInitialTheme', () => {
  let originalEnv: string | undefined
  beforeEach(() => {
    originalEnv = process.env.APP_DEFAULT_THEME
    clearCookies()
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.APP_DEFAULT_THEME
    else process.env.APP_DEFAULT_THEME = originalEnv
  })

  it('defaults to "system" when no cookie and no env', async () => {
    delete process.env.APP_DEFAULT_THEME
    const t: Theme = await getInitialTheme()
    expect(t).toBe('system')
  })

  it('respects APP_DEFAULT_THEME env when set', async () => {
    process.env.APP_DEFAULT_THEME = 'dark'
    expect(await getInitialTheme()).toBe('dark')
  })

  it('cookie wins over env', async () => {
    process.env.APP_DEFAULT_THEME = 'dark'
    setCookie('fillip-theme', 'light')
    expect(await getInitialTheme()).toBe('light')
  })

  it('rejects invalid values from env, falling back to system', async () => {
    process.env.APP_DEFAULT_THEME = 'rainbow'
    expect(await getInitialTheme()).toBe('system')
  })

  it('rejects invalid values from cookie, falling back to env or system', async () => {
    delete process.env.APP_DEFAULT_THEME
    setCookie('fillip-theme', 'rainbow')
    expect(await getInitialTheme()).toBe('system')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/theme/getInitialTheme.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/theme/getInitialTheme'`.

- [ ] **Step 3: Implement**

Create `fuelsniffer/src/lib/theme/getInitialTheme.ts`:

```ts
import { cookies } from 'next/headers'

export type Theme = 'light' | 'dark' | 'system'

const VALID: ReadonlySet<Theme> = new Set(['light', 'dark', 'system'])
export const THEME_COOKIE = 'fillip-theme'

function coerce(value: string | undefined): Theme | null {
  if (value && VALID.has(value as Theme)) return value as Theme
  return null
}

/**
 * Returns the initial theme to render on the server.
 * Precedence: cookie > APP_DEFAULT_THEME env > 'system'.
 * Invalid values silently fall through to the next layer.
 */
export async function getInitialTheme(): Promise<Theme> {
  const jar = await cookies()
  const fromCookie = coerce(jar.get(THEME_COOKIE)?.value)
  if (fromCookie) return fromCookie
  const fromEnv = coerce(process.env.APP_DEFAULT_THEME)
  if (fromEnv) return fromEnv
  return 'system'
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/theme/getInitialTheme.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/lib/theme/getInitialTheme.ts fuelsniffer/src/__tests__/theme/getInitialTheme.test.ts
git commit -m "feat(fillip): server-side theme cookie reader (FOUC prevention)"
```

---

## Task 8: Client ThemeProvider + useTheme hook

**Files:**
- Create: `fuelsniffer/src/lib/theme/ThemeProvider.tsx`
- Create: `fuelsniffer/src/lib/theme/useTheme.ts`
- Test: `fuelsniffer/src/__tests__/theme/ThemeProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/theme/ThemeProvider.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'
import { useTheme } from '@/lib/theme/useTheme'

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="to-dark" onClick={() => setTheme('dark')}>dark</button>
      <button data-testid="to-system" onClick={() => setTheme('system')}>system</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
    document.cookie = 'fillip-theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('applies the initial theme to <html data-theme>', () => {
    render(<ThemeProvider initial="light"><Probe /></ThemeProvider>)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setTheme("dark") updates <html data-theme> and persists to localStorage and cookie', () => {
    const { getByTestId } = render(<ThemeProvider initial="light"><Probe /></ThemeProvider>)
    act(() => { getByTestId('to-dark').click() })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(getByTestId('theme').textContent).toBe('dark')
    expect(localStorage.getItem('fillip-theme')).toBe('dark')
    expect(document.cookie).toMatch(/fillip-theme=dark/)
  })

  it('initial "system" resolves via prefers-color-scheme', () => {
    // happy-dom defaults prefers-color-scheme to 'light'
    const { getByTestId } = render(<ThemeProvider initial="system"><Probe /></ThemeProvider>)
    expect(getByTestId('theme').textContent).toBe('system')
    // resolvedTheme should be 'light' or 'dark' — never 'system'
    const resolved = getByTestId('resolved').textContent
    expect(['light', 'dark']).toContain(resolved)
    expect(document.documentElement.getAttribute('data-theme')).toBe(resolved)
  })

  it('useTheme throws when used outside the provider', () => {
    function Bare() { useTheme(); return null }
    // Suppress React error boundary noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/ThemeProvider/)
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/theme/ThemeProvider.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the hook re-export**

Create `fuelsniffer/src/lib/theme/useTheme.ts`:

```ts
'use client'
export { useTheme } from './ThemeProvider'
```

- [ ] **Step 4: Implement the provider**

Create `fuelsniffer/src/lib/theme/ThemeProvider.tsx`:

```tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from './getInitialTheme'
import { THEME_COOKIE } from './getInitialTheme'

type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (next: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ProviderProps {
  initial: Theme
  children: ReactNode
}

function detectSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(theme: Theme): ResolvedTheme {
  return theme === 'system' ? detectSystem() : theme
}

function persist(theme: Theme): void {
  try { localStorage.setItem(THEME_COOKIE, theme) } catch { /* ignore */ }
  // 1 year, lax, root path. SameSite=Lax so it travels on top-level GETs (the SSR read).
  document.cookie = `${THEME_COOKIE}=${theme}; max-age=31536000; path=/; samesite=lax`
}

function applyAttribute(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

export function ThemeProvider({ initial, children }: ProviderProps) {
  const [theme, setThemeState] = useState<Theme>(initial)
  const [resolvedTheme, setResolved] = useState<ResolvedTheme>(() => resolve(initial))

  // Apply initial attribute synchronously on mount in case the SSR pass
  // emitted a different value (e.g. the user just toggled and reloaded
  // and the cookie hasn't round-tripped yet).
  useEffect(() => {
    const r = resolve(theme)
    setResolved(r)
    applyAttribute(r)
  }, [theme])

  // Listen to OS theme changes when the user is on "system"
  useEffect(() => {
    if (theme !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const r = detectSystem()
      setResolved(r)
      applyAttribute(r)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    persist(next)
    const r = resolve(next)
    setResolved(r)
    applyAttribute(r)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/theme/ThemeProvider.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/lib/theme/
git add fuelsniffer/src/__tests__/theme/ThemeProvider.test.tsx
git commit -m "feat(fillip): client ThemeProvider + useTheme hook"
```

---

## Task 9: Wire ThemeProvider into root layout (with FOUC-prevention script)

**Files:**
- Modify: `fuelsniffer/src/app/layout.tsx`

The server reads `getInitialTheme()`. If it returns `'system'`, the server cannot know the user's OS preference, so it emits a tiny `<script>` that runs **before paint** and sets `data-theme` from `matchMedia`. This script is the only blocking inline JS in the page; it is < 200 bytes and cacheable as part of the HTML.

- [ ] **Step 1: Modify layout.tsx**

Replace the contents of `fuelsniffer/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { getInitialTheme, THEME_COOKIE } from "@/lib/theme/getInitialTheme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPublicUrl } from "@/lib/config/publicUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getPublicUrl(),
  title: "Fillip — find cheap fuel across Australia",
  description: "Fillip helps Australian drivers find the cheapest fuel near them and across their route. Real-time prices, trend tracking, and national coverage.",
};

// Inline pre-paint script: when the server-rendered theme is "system",
// we don't know the user's OS preference at SSR time. This script runs
// synchronously before first paint and flips data-theme to the resolved
// value, eliminating a flash of the wrong theme.
const FOUC_SCRIPT = `(function(){try{var t=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/);var v=t?decodeURIComponent(t[1]):'system';if(v==='system'){v=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',v);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initial = await getInitialTheme();
  const ssrAttribute = initial === 'system' ? 'light' : initial;

  return (
    <html
      lang="en-AU"
      data-theme={ssrAttribute}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded focus:font-medium"
        >
          Skip to main content
        </a>
        <ThemeProvider initial={initial}>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify the build**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npm run build 2>&1 | tail -20
```

Expected: build succeeds. (`ThemeToggle` doesn't exist yet — Task 10 creates it. The build will fail at this step until Task 10 lands. That's acceptable because we commit at the end of Task 10, not here.)

If the build fails due to `ThemeToggle` not existing, that's expected — proceed to Task 10. We DO NOT commit yet.

---

## Task 10: ThemeToggle component

**Files:**
- Create: `fuelsniffer/src/components/ThemeToggle.tsx`
- Test: `fuelsniffer/src/__tests__/theme/ThemeToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `fuelsniffer/src/__tests__/theme/ThemeToggle.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { ThemeProvider } from '@/lib/theme/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

function renderWith(initial: 'light' | 'dark' | 'system' = 'light') {
  return render(<ThemeProvider initial={initial}><ThemeToggle /></ThemeProvider>)
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })
  afterEach(() => { localStorage.clear() })

  it('renders an accessible button', () => {
    renderWith('light')
    const btn = screen.getByRole('button', { name: /theme/i })
    expect(btn).toBeTruthy()
  })

  it('cycles light → dark → system → light on click', () => {
    renderWith('light')
    const btn = screen.getByRole('button', { name: /theme/i })
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)

    fireEvent.click(btn)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(btn.getAttribute('aria-label')).toMatch(/dark/i)

    fireEvent.click(btn)
    expect(btn.getAttribute('aria-label')).toMatch(/system/i)

    fireEvent.click(btn)
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/theme/ThemeToggle.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ThemeToggle'`.

- [ ] **Step 3: Implement**

Create `fuelsniffer/src/components/ThemeToggle.tsx`:

```tsx
'use client'
import { useTheme } from '@/lib/theme/useTheme'
import type { Theme } from '@/lib/theme/getInitialTheme'

const NEXT: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const LABEL: Record<Theme, string> = {
  light: 'Theme: Light. Click to switch to Dark.',
  dark: 'Theme: Dark. Click to switch to System.',
  system: 'Theme: System. Click to switch to Light.',
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const onClick = () => setTheme(NEXT[theme])

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        width: 44,
        height: 44,
        borderRadius: 22,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated)',
        color: 'var(--color-text)',
        boxShadow: 'var(--shadow-md)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        lineHeight: 1,
      }}
    >
      <span aria-hidden="true">
        {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️'}
      </span>
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/theme/ThemeToggle.test.tsx
```

Expected: 2 PASS.

- [ ] **Step 5: Verify the full app builds with layout + provider + toggle wired**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 6: Commit (this commit covers Task 9 + Task 10 together)**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/app/layout.tsx fuelsniffer/src/components/ThemeToggle.tsx fuelsniffer/src/__tests__/theme/ThemeToggle.test.tsx
git commit -m "feat(fillip): wire ThemeProvider + ThemeToggle into root layout

- layout.tsx reads initial theme from cookie/env via getInitialTheme()
- inline FOUC-prevention script applies resolved theme before first paint
- ThemeToggle floats bottom-right; cycles Light → Dark → System
- metadataBase now derived from APP_PUBLIC_URL"
```

---

## Task 11: Update db README without renaming the postgres role

**Files:**
- Modify: `fuelsniffer/src/lib/db/README.md`

Per spec §2 and master §10 Q3, the postgres database/user is intentionally NOT renamed. We update the prose around the `psql -U fuelsniffer` examples so the file reads as Fillip-written, while preserving the exact db identifier.

- [ ] **Step 1: Inspect the file**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
cat src/lib/db/README.md
```

- [ ] **Step 2: Reword non-identifier mentions**

Edit `fuelsniffer/src/lib/db/README.md`. For any prose-level reference to "FuelSniffer" the application, replace with "Fillip". Leave the literal commands `DATABASE_URL=postgresql://fuelsniffer:...`, `psql -U fuelsniffer ...` UNCHANGED — these refer to the database role, not the application.

If after editing the only `fuelsniffer` matches are those literal commands, you're done.

- [ ] **Step 3: Verify branding test still passes**

The branding test allowlists `src/lib/db/README.md` for exactly this reason.

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/branding.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/lib/db/README.md
git commit -m "docs(fillip): rebrand db README prose, keep postgres role 'fuelsniffer' (per spec §2)"
```

---

## Task 12: Top-level docs rewrite

**Files:**
- Modify: `fuelsniffer/README.md`
- Modify: `fuelsniffer/AGENTS.md`
- Modify: `fuelsniffer/CLAUDE.md`

- [ ] **Step 1: Rewrite README.md**

Replace the contents of `fuelsniffer/README.md` with:

```markdown
# ⛽ Fillip

Fillip helps Australian drivers find the cheapest fuel near them and along their route. Real-time prices, trend tracking, and (rolling out) national coverage. Self-hosted; scrapes every 15 minutes.

> Formerly known as **FuelSniffer** (QLD-only beta). The Fillip rebrand is rolling out in phases — see `docs/superpowers/specs/2026-04-22-fillip-master-design.md`.

**Status:** SP-0 (rebrand + foundations) shipped. SP-1 (national data adapters) and SP-2 (auth v2) next.

**Public URL (when deployed):** https://fillip.clarily.au

---

## Architecture

### Data Pipeline

```mermaid
graph TD
    QLD["🌐 QLD Fuel Price API\nfppdirectapi-prod.fuelpricesqld.com.au"]
    CKAN["📦 CKAN Fallback\nOpen Data Portal CSV"]

    subgraph Scraper ["scraper/ — runs every 15 min"]
        CLIENT["client.ts"]
        NORM["normaliser.ts"]
        WRITER["writer.ts"]
        SCHED["scheduler.ts"]
    end

    subgraph DB ["PostgreSQL 17 + PostGIS"]
        STATIONS[("stations")]
        PRICES[("price_readings")]
        DAILY[("price_readings_daily\nmaterialized view")]
    end

    QLD --> CLIENT
    CKAN -.->|"fallback"| CLIENT
    CLIENT --> NORM --> WRITER --> STATIONS
    WRITER --> PRICES
    PRICES --> DAILY
    SCHED --> CLIENT
```

### Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| DB | PostgreSQL 17 + PostGIS, accessed via Drizzle ORM |
| Scraper | node-cron, runs inside Next.js via `src/instrumentation.ts` |
| Map | Leaflet + leaflet.markercluster |
| Charts | Recharts |
| Auth (today) | JWT sessions via `jose`, invite-code signup. **SP-2 replaces with magic link + Google/Apple OAuth.** |
| Tests | Vitest 4 + @testing-library/react + Playwright |
| Hosting | Docker Compose (postgres + app + db-backup + cloudflared tunnel) |

---

## Local development

```bash
cp .env.example .env
# fill in DB_PASSWORD, QLD_API_TOKEN, SESSION_SECRET, MAPBOX_TOKEN
docker compose up -d postgres
cd fuelsniffer  # this folder; rename deferred per SP-0 spec §10 Q4
npm install
npm run dev   # http://localhost:4000
```

Tests:

```bash
npm run test:run    # Vitest unit + integration
npm run test:e2e    # Playwright smoke
```

---

## Theme

Fillip ships with both a light and a dark theme. The theme toggle is the floating button in the bottom-right corner.

- **Default:** System (follows your OS).
- **Persistence:** Choice is stored in `localStorage` and a `fillip-theme` cookie so the SSR pass renders the right theme on first paint.
- **Override at deploy:** `APP_DEFAULT_THEME=light|dark|system` env var.

Component-level visual polish (especially light mode for inline-styled cards) is owned by SP-3 (UX core). SP-0 ships a *functional* dark theme that matches the legacy FuelSniffer look pixel-for-pixel.

---

## Roadmap

See `docs/superpowers/specs/2026-04-22-fillip-master-design.md` for the master design and `2026-04-22-fillip-sp{0..8}-*-design.md` for each sub-project.

| | Sub-project | Status |
|---|---|---|
| SP-0 | Rebrand + foundations | ✅ shipped |
| SP-1 | National data adapters (NSW/WA/NT/TAS/ACT) | next |
| SP-2 | Auth v2 (magic link + Google/Apple) | next |
| SP-3 | UX core (proper dark mode, PWA, perf, a11y) | next |
| SP-4 | Cycle engine Phase A (predictive) | queued |
| SP-5 | Alerts (email + web push) | queued |
| SP-6 | True-cost prices (loyalty) | queued |
| SP-7 | Trip planner polish | queued |
| SP-8 | Viral hooks (share-card + bot) | queued |
```

- [ ] **Step 2: Update AGENTS.md (append, do not replace the BEGIN/END marker block)**

Edit `fuelsniffer/AGENTS.md`. Append (do not modify the existing `<!-- BEGIN:nextjs-agent-rules -->` block):

```markdown

<!-- BEGIN:fillip-project-rules -->
# This is the Fillip codebase

Formerly **FuelSniffer**. Rebrand happened in SP-0 (see `docs/superpowers/specs/2026-04-22-fillip-sp0-rebrand-design.md`).

- The folder is still named `fuelsniffer/` — folder rename is deferred (spec §10 Q4).
- The postgres database and role are still named `fuelsniffer` — DB rename is deferred (spec §10 Q3, master §10 Q3).
- Everything else (UI, metadata, README, package name, container_names, log prefixes) is **Fillip**.
- The branding regression test (`src/__tests__/branding.test.ts`) enforces zero `fuelsniffer` outside an explicit allowlist. If you add a new doc that legitimately needs to reference the postgres role, extend the allowlist with a comment.
- Theme tokens live in `src/styles/tokens.css`. New colour values should be tokens, not literals.
- Public URL config flows from `APP_PUBLIC_URL` via `src/lib/config/publicUrl.ts`.
<!-- END:fillip-project-rules -->
```

- [ ] **Step 3: Update CLAUDE.md**

The current `CLAUDE.md` is a one-line `@AGENTS.md` include. Leave the include and append a project block:

Edit `fuelsniffer/CLAUDE.md`. The current content is `@AGENTS.md`. Replace the file with:

```markdown
@AGENTS.md

# Fillip — project notes for Claude

## Project name vs. legacy identifiers

This codebase was renamed FuelSniffer → **Fillip** in SP-0. Two things were intentionally NOT renamed:

1. The folder `fuelsniffer/` — paths leak into worktrees, deploy scripts, and CI.
2. The postgres database name and role `fuelsniffer` — renaming requires a coordinated dump/restore.

Both renames are queued as separate cleanup tickets. **Do not unilaterally rename either** without the corresponding migration plan.

## Theme

- `src/styles/tokens.css` defines `[data-theme="light"]` and `[data-theme="dark"]` blocks.
- `src/app/globals.css` consumes only token variables (no raw hex).
- 21 components still hold inline-style hex literals (~204 hits) from the FuelSniffer dark-only era. Migrating them to tokens is **SP-3's** job, not yours, unless you're touching those components for another reason.

## Public URL & email

- `APP_PUBLIC_URL` (default `http://localhost:4000`) feeds `metadataBase`.
- `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` configure the default sender identity. SP-2 will plug in Resend as the transport.

## Master spec & sub-projects

`docs/superpowers/specs/2026-04-22-fillip-master-design.md` is the north-star reference. Sub-projects: `2026-04-22-fillip-sp{0..8}-*-design.md`. Implementation plans live in `docs/superpowers/plans/`.
```

- [ ] **Step 4: Run branding test once more**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx vitest run src/__tests__/branding.test.ts
```

Expected: PASS. AGENTS.md and CLAUDE.md and README.md live at `fuelsniffer/` root, not under `src/`, so they're not scanned — but it's good to confirm the test still passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/README.md fuelsniffer/AGENTS.md fuelsniffer/CLAUDE.md
git commit -m "docs(fillip): rewrite README, AGENTS, CLAUDE for Fillip rebrand"
```

---

## Task 13: docker-compose container_name + new env vars

**Files:**
- Modify: `fuelsniffer/docker-compose.yml`
- Modify: `fuelsniffer/Dockerfile`

- [ ] **Step 1: Inspect current docker-compose.yml**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
cat docker-compose.yml
```

- [ ] **Step 2: Add container_name and new env vars**

Edit `fuelsniffer/docker-compose.yml`:

For the `postgres` service, add `container_name: fillip-postgres` immediately under the service name. For example:

```yaml
  postgres:
    container_name: fillip-postgres
    image: postgis/postgis:17-3.4-alpine
    ...
```

For `db-backup`, add `container_name: fillip-db-backup`.

For `app`, add `container_name: fillip-app` AND the four new env vars:

```yaml
  app:
    container_name: fillip-app
    build: .
    environment:
      DATABASE_URL: postgresql://fuelsniffer:${DB_PASSWORD}@postgres:5432/fuelsniffer
      SESSION_SECRET: ${SESSION_SECRET}
      QLD_API_TOKEN: ${QLD_API_TOKEN}
      HEALTHCHECKS_PING_URL: ${HEALTHCHECKS_PING_URL}
      MAPBOX_TOKEN: ${MAPBOX_TOKEN:-}
      APP_NAME: ${APP_NAME:-Fillip}
      APP_PUBLIC_URL: ${APP_PUBLIC_URL:-http://localhost:4000}
      APP_DEFAULT_THEME: ${APP_DEFAULT_THEME:-system}
      EMAIL_FROM_NAME: ${EMAIL_FROM_NAME:-Fillip}
      EMAIL_FROM_ADDRESS: ${EMAIL_FROM_ADDRESS:-no-reply@fillip.local}
      TZ: Australia/Brisbane
      NODE_ENV: production
    ...
```

For `cloudflared`, add `container_name: fillip-cloudflared`.

**DO NOT change:** the `services:` keys (`postgres`, `db-backup`, `app`, `cloudflared`), the `DATABASE_URL` connection string, `POSTGRES_DB`, `POSTGRES_USER`, the `pg_isready -U fuelsniffer` healthcheck, the backup file prefix `fuelsniffer_${TIMESTAMP}.sql.gz`, or the `PGUSER`/`PGDATABASE` in `db-backup`.

- [ ] **Step 3: Add Dockerfile labels**

Edit `fuelsniffer/Dockerfile`. Immediately after the `FROM node:22-alpine AS runner` line in the runner stage, add:

```dockerfile
LABEL org.opencontainers.image.title="Fillip"
LABEL org.opencontainers.image.description="Fillip — find cheap fuel across Australia"
LABEL org.opencontainers.image.source="https://github.com/cdenn/fuelsniffer"
```

(If a `LABEL` block already exists, append; do not duplicate.)

- [ ] **Step 4: Validate docker-compose syntax**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
docker compose config 2>&1 | head -30
```

Expected: prints the parsed config without error. If `docker` is not installed locally, skip — CI will catch it.

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/docker-compose.yml fuelsniffer/Dockerfile
git commit -m "chore(fillip): container_name=fillip-* and new APP/EMAIL env vars

- Service keys (postgres/app/db-backup/cloudflared) preserved.
- DB connection string, POSTGRES_DB, POSTGRES_USER, backup filename
  prefix unchanged (postgres role rename deferred per spec §2/§10 Q3).
- Dockerfile gains OCI image labels for the Fillip identity."
```

---

## Task 14: Update package.json name + .env.example

**Files:**
- Modify: `fuelsniffer/package.json` (the `"name"` field — note: `"private": true`, so npm doesn't care)
- Modify: `fuelsniffer/.env.example`

- [ ] **Step 1: Update package.json name**

Edit `fuelsniffer/package.json`. Change `"name": "fuelsniffer"` to `"name": "fillip"`. Leave version, scripts, dependencies untouched.

- [ ] **Step 2: Update .env.example**

Replace `fuelsniffer/.env.example` with:

```bash
# Copy to .env and fill in real values — never commit .env to git

# ── Database ──────────────────────────────────────────────────────────────────
DB_PASSWORD=changeme

# Fillip uses postgres role/db named "fuelsniffer" for historical reasons
# (see CLAUDE.md). Do not rename without a planned migration.
DATABASE_URL=postgresql://fuelsniffer:changeme@localhost:5432/fuelsniffer

# ── App identity ──────────────────────────────────────────────────────────────
APP_NAME=Fillip
APP_PUBLIC_URL=http://localhost:4000
# light | dark | system  (default: system — follows OS)
APP_DEFAULT_THEME=system

# ── Email sender (no transport in SP-0; SP-2 brings Resend) ──────────────────
EMAIL_FROM_NAME=Fillip
EMAIL_FROM_ADDRESS=no-reply@fillip.local

# ── Session signing (jose JWT) ───────────────────────────────────────────────
SESSION_SECRET=change_this_to_a_long_random_string

# ── QLD Fuel Price API ───────────────────────────────────────────────────────
# Register at https://www.fuelpricesqld.com.au — token comes by email.
QLD_API_TOKEN=your_token_here

# ── Mapbox (geocoding + directions for trip planner) ─────────────────────────
# Token must include the geocoding-v6:* and directions:* scopes.
MAPBOX_TOKEN=

# ── healthchecks.io dead-man's-switch ────────────────────────────────────────
# Create a check at https://healthchecks.io. Period 15min, grace 5min.
# Leave blank to disable external health monitoring during local development.
HEALTHCHECKS_PING_URL=
```

- [ ] **Step 3: Confirm `.env.example` is tracked**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git status fuelsniffer/.env.example
```

Expected: shows as modified (it already exists).

- [ ] **Step 4: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/package.json fuelsniffer/.env.example
git commit -m "chore(fillip): package.json name + .env.example documents new vars"
```

---

## Task 15: Playwright E2E smoke test

**Files:**
- Create: `fuelsniffer/src/__tests__/branding.playwright.ts`

This test only runs when an instance is up at `BASE_URL` (default `http://localhost:4000`). It is not run by `npm run test:run` (that's vitest only); it runs via `npm run test:e2e`.

- [ ] **Step 1: Write the test**

Create `fuelsniffer/src/__tests__/branding.playwright.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Fillip — branding smoke', () => {
  test('root page title contains Fillip', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Fillip/)
  })

  test('root page sets data-theme on <html>', async ({ page }) => {
    await page.goto('/')
    const value = await page.locator('html').getAttribute('data-theme')
    expect(['light', 'dark']).toContain(value)
  })

  test('root page does not contain "FuelSniffer"', async ({ page }) => {
    await page.goto('/')
    const html = await page.content()
    expect(html).not.toMatch(/FuelSniffer/)
  })

  test('theme toggle is present and clickable', async ({ page }) => {
    await page.goto('/')
    const button = page.getByRole('button', { name: /theme/i })
    await expect(button).toBeVisible()
    const before = await page.locator('html').getAttribute('data-theme')
    await button.click()
    const after = await page.locator('html').getAttribute('data-theme')
    expect(after).not.toBe(before)
  })
})
```

- [ ] **Step 2: Verify the test file is syntactically valid (compile only)**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npx tsc --noEmit src/__tests__/branding.playwright.ts 2>&1 | head -20
```

Expected: no errors. (Type errors here would block the test from running.)

- [ ] **Step 3: Run the smoke if a local server is available — OPTIONAL**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
# In one terminal: npm run dev  (waits for it to be ready at http://localhost:4000)
# Then in another:
npm run test:e2e -- --grep "Fillip — branding smoke" 2>&1 | tail -20
```

Expected: 4 PASS. Skip this step if no local server is running; the test will run in CI.

- [ ] **Step 4: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git add fuelsniffer/src/__tests__/branding.playwright.ts
git commit -m "test(fillip): Playwright branding smoke (title, theme attr, toggle)"
```

---

## Task 16: Full test-suite + manual verification

**Files:** none

- [ ] **Step 1: Run the entire vitest suite**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npm run test:run 2>&1 | tail -40
```

Expected: every SP-0 test passes (branding, publicUrl × 3, sender × 2, getInitialTheme × 5, ThemeProvider × 4, ThemeToggle × 2). Pre-existing tests should also still pass — if any pre-existing test now fails because it asserted on the old "FuelSniffer" string, fix the assertion (don't loosen it; replace `FuelSniffer` with `Fillip`).

- [ ] **Step 2: Run a build**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npm run build 2>&1 | tail -10
```

Expected: build succeeds. Record the bundle-size delta in the PR description if known.

- [ ] **Step 3: Lint**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
npm run lint 2>&1 | tail -20
```

Expected: no new lint errors introduced by SP-0. Existing warnings are fine.

- [ ] **Step 4: Manual smoke (only if you can run docker locally)**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
docker compose build app && docker compose up -d
sleep 10
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/ | grep -i "fillip\|<title"
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

Expected: 200, title contains Fillip, four containers named `fillip-*` are running.

- [ ] **Step 5: Verify the Definition of Done checklist (spec §12)**

Walk down `2026-04-22-fillip-sp0-rebrand-design.md` §12 and tick each box. If any item is unchecked, address it before opening the PR.

- [ ] **Step 6: Final branding sweep**

```bash
cd /Users/cdenn/Projects/FuelSniffer/fuelsniffer
grep -rin "fuelsniffer" src/app src/components src/lib | grep -v "src/lib/db/README.md"
```

Expected: zero matches. Anything that appears here is a regression — fix it.

- [ ] **Step 7: No commit needed for verification only.**

---

## Task 17: PR-ready check

**Files:** none

- [ ] **Step 1: Review the commit log**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git log --oneline fuel-spy ^main | head -30
```

Expected: clean sequence of commits matching the task list (test-first, then implementation, then docs/config).

- [ ] **Step 2: Push the branch**

```bash
cd /Users/cdenn/Projects/FuelSniffer
git push -u origin fuel-spy
```

- [ ] **Step 3: Open the PR**

Use the commit-commands skill or `gh pr create`:

```bash
cd /Users/cdenn/Projects/FuelSniffer
gh pr create --title "feat(fillip): SP-0 rebrand + foundations (FuelSniffer → Fillip)" --body "$(cat <<'EOF'
## Summary
- Renames every user-visible "FuelSniffer" → **Fillip** across UI, metadata, README, AGENTS.md, CLAUDE.md, package.json, container_names, OCI labels.
- Introduces a CSS-token theme layer (`src/styles/tokens.css`) with both light and dark blocks. Dark = exact pre-rebrand FuelSniffer values (zero visual regression for users on dark mode).
- Adds `ThemeProvider` + `useTheme` + a floating `ThemeToggle` (sun/moon, cycles Light → Dark → System; default = System).
- Adds `APP_PUBLIC_URL` config (defaults `http://localhost:4000`, prod `https://fillip.clarily.au`) and an email-sender identity stub.
- Preserved per spec §2: postgres role/db `fuelsniffer`, folder name `fuelsniffer/`, backup file prefix, Drizzle schema, ad slots, auth, scraper.
- Spine of the PR: `src/__tests__/branding.test.ts` enforces zero `fuelsniffer` outside an explicit allowlist.

## Spec
- Master: `docs/superpowers/specs/2026-04-22-fillip-master-design.md`
- SP-0: `docs/superpowers/specs/2026-04-22-fillip-sp0-rebrand-design.md` (v1.1 with §0 amendments)
- Plan: `docs/superpowers/plans/2026-04-23-fillip-sp0-rebrand.md`

## Test plan
- [ ] `npm run test:run` — green
- [ ] `npm run lint` — no new errors
- [ ] `npm run build` — green
- [ ] Local docker compose smoke — http://localhost:3000 returns 200 with "Fillip" in title
- [ ] Toggle works (Light → Dark → System cycle, persists via cookie)
- [ ] Lighthouse a11y on `/dashboard` ≥ pre-SP-0 baseline (record numbers in PR after measuring)

## Rollout
Per spec §11. Single PR; rollback is a clean `git revert` (zero data changes).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 4: Done.** Hand off to user for review.

---

## Self-review notes (for the author of this plan)

Spec coverage check (spec §3 In scope + §12 Definition of Done):

| Spec item | Plan task |
|---|---|
| Brand strings in src/app | Task 3 |
| Page titles & meta | Task 3, Task 9 |
| Favicon & app icons | **Not changed in this plan** — current `favicon.ico` left as-is. Spec §3 lists a "placeholder Fillip mark" but §10 Q5 leaves placeholder design as decision-pending. Plan defers favicon swap until logo decision. (See "Deviations" below.) |
| README & docs | Task 12 |
| `package.json` name | Task 14 |
| docker-compose service names | Task 13 |
| Env var names | Task 13, Task 14 |
| Theme tokens | Task 6 |
| Theme provider | Task 8 |
| Light-theme repaint (globals only) | Task 6 |
| Domain handling | Task 4, Task 9 (metadataBase) |
| Email sender identity | Task 5 |
| Tests | Tasks 2, 4, 5, 7, 8, 10, 15 |
| `.env.example` | Task 14 |
| Greppy branding test | Task 2 |
| `<title>`, `<meta description>`, OG | Task 3, Task 9 |
| `tokens.css` exists; `globals.css` no raw hex | Task 6 |
| `ThemeProvider` + `useTheme` | Task 8 |
| `setTheme` works (per §0 amendment, NOT a no-op) | Task 8 (cycle in Task 10) |
| Sender stub with one passing test | Task 5 |
| Env vars wired in `docker-compose.yml` and `.env.example` | Tasks 13, 14 |
| Four Docker services with `container_name: fillip-*` | Task 13 |
| README/CLAUDE/AGENTS updated | Task 12 |
| Vitest passes; Playwright smoke passes | Task 16 |

**Deviations from spec:**
1. Favicon swap deferred (spec §10 Q5 marks placeholder logo as decision-pending; current `favicon.ico` is untouched). Worth flagging as one open question for the user before merge.
2. Spec §0 amendment table says SP-0 ships dark theme + toggle but spec body §2 still says "dark mode deferred to SP-3" and §5.3 says provider is "locked to `light`". The plan follows the §0 amendment (the authoritative table per spec preamble: "treat these as authoritative").
3. Spec §10 Q6 recommends `#2563eb` (Tailwind blue) as accent. Master spec §10 cross-cutting decision 5 LOCKS amber (`#f59e0b`). Plan follows the master spec — amber.
4. The plan adds `npm run test`/`test:run`/`test:e2e` scripts (Task 1) which the spec doesn't explicitly list. They're necessary because the current `package.json` has no test script — the spec implicitly assumes they exist.

Placeholder scan: every step contains real code, real commands, real expected output. No "TBD" / "implement later" / "add error handling" / "similar to Task N".

Type consistency: `Theme` is defined once in `src/lib/theme/getInitialTheme.ts` and re-exported / imported everywhere. `THEME_COOKIE` is a named export from the same module. `ResolvedTheme` is internal to `ThemeProvider.tsx` (not exported — consumers get it via `useTheme().resolvedTheme`).
