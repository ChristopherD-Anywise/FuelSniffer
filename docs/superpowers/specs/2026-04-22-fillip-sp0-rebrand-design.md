# SP-0 — Rebrand + Foundations (FuelSniffer → Fillip)

**Status:** Draft v1.1 (decisions amended 2026-04-23)
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `2026-04-22-fillip-master-design.md` (§5.1, §7, §10 cross-cutting decisions)
**Sub-project:** SP-0 (entry point — no upstream dependencies)
**Estimated effort:** medium (2–3 focused sessions — increased from v1 due to dual-theme scope)

---

## 0. Amendments since v1 (2026-04-23)

The following cross-cutting decisions from master spec §10 override v1 of this spec where they conflict. The body of the spec below has NOT been line-edited; treat these as authoritative.

| Topic | v1 said | **Now (v1.1)** |
|---|---|---|
| Theme | Light only; toggle deferred to SP-3 | **Light is the default. Dark theme ships in SP-0 with a working user-facing toggle.** SP-3 still owns the proper theme system, polish, accessibility, and dark-mode component pass — SP-0 ships a *functional* dark theme by porting the existing dark hex values into a `[data-theme="dark"]` token block, so users who hate light mode can flip back. |
| Brand accent | Pending | **Keep amber** (`#f59e0b`) — no recolour at rebrand. |
| Domain | TBD | **`fillip.clarily.au`** — subdomain on existing Clarily property. |
| Email sender hook | Placeholder | Sender-identity module still placeholder until SP-2; final provider is **Resend**. |

### Concretely, what this changes in SP-0:

1. **`tokens.css`** ships TWO blocks: `[data-theme="light"]` (new clean light values) AND `[data-theme="dark"]` (the existing dark hex values mapped onto the same token names).
2. **`ThemeProvider`** is no longer locked. `setTheme(theme)` mutates `<html data-theme>` and persists to `localStorage` under `fillip.theme`. SSR reads a `theme` cookie (set by the toggle) to avoid FOUC.
3. **A toggle UI ships** — minimum: a sun/moon icon button in the existing `AppHeader` (or wherever the user menu sits). Triple state: System / Light / Dark. Default = System (which resolves via `prefers-color-scheme`).
4. **`APP_DEFAULT_THEME` env var** accepts `"light" | "dark" | "system"`; defaults to `"system"`.
5. **Domain config** (`APP_PUBLIC_URL`) defaults to `https://fillip.clarily.au`.
6. **Tests** add: toggle click changes `data-theme`; localStorage round-trip; SSR reads cookie; both themes render the dashboard without contrast regressions (axe pass on each).
7. **Beta user comms** — no longer "dark mode coming back in 2 weeks." Just: "we renamed and you can choose your theme top-right."

§10 Open Questions Q1 (light-only interim) is now **resolved**. §10 Q2 (accent colour) is **resolved — amber stays**. §10 Q3-Q4 (DB rename, folder rename) remain **deferred** as v1 recommended.

---

## 1. Goals

SP-0 is the **foundational rename**. After this lands:

1. Every user-visible surface — dashboard chrome, page titles, OG meta, README, login screen, error pages, email "from" identity, PWA / favicon stub — says **Fillip**, not FuelSniffer.
2. The product can run on a **new public domain** (TBD: `fillip.com.au` / `fillip.app` / `getfillip.com`) without code changes — the domain is config-driven.
3. The codebase is wired with a minimal **theme-token layer** (CSS custom properties) so SP-3 can swap in real colours and add dark mode without touching component code.
4. A **theme-switching scaffold** exists (provider + hook + `data-theme` attribute on `<html>`) but is locked to the single light theme for SP-0. Toggle UI is *not* shipped.
5. Internal identifiers that are expensive to migrate (database name, OS user, container volume paths, Drizzle schema names, the `fuelsniffer` postgres role) **stay as-is**. Only outward-facing strings change.
6. Auth, ad slots, scraper behaviour, JWT session model, data model — **untouched**.

The goal is **zero behavioural change** other than the new name and a new visual baseline. If a user opens the dashboard after SP-0 ships, every feature works identically; only the wordmark, page title, and colours differ.

---

## 2. Non-goals

The following are explicitly **out of scope** for SP-0 and live in later sub-projects:

- **Dark mode** — deferred to SP-3 (UX core). SP-0 ships **light only**, even though the current product is dark-only. (See §10 Open Questions Q1.)
- **Real logo / wordmark** — commissioned separately. SP-0 ships a *placeholder* wordmark (text-set "Fillip" in the chosen brand font + a simple geometric mark) and a placeholder favicon.
- **Real email sending** — SP-2 brings Resend/SES + magic links. SP-0 only fixes the *sender identity strings* used in any existing transactional pathway (currently none — see §5.4).
- **Domain cutover & DNS** — out of scope; SP-0 makes the code *ready* for a new domain via config, but the actual cloudflared tunnel / DNS swap is an ops task scheduled separately.
- **Rebrand of internal identifiers** — `DATABASE_URL`'s `fuelsniffer` db, the postgres role, volume paths under `./data/postgres`, `src/lib/db/schema.ts` table names. Renaming any of these requires a data migration; not worth the risk for SP-0.
- **Ad creative review / network changes** — ads stay in 3 existing slots (`AdCard.tsx` rendered as bottom banner, sidebar, popup card) with whatever fuel-related creative is currently configured. No code change.
- **Auth surface changes** — JWT session model in `src/lib/session.ts`, invite codes, login page copy beyond the brand name. All preserved.
- **Migration of social handles, GitHub repo name, package name on npm** — none of these are published; folder name `fuelsniffer/` and `package.json` `"name": "fuelsniffer"` *are* in scope (see §5.6).

---

## 3. Scope

### In scope

| Area | Change |
|---|---|
| Brand name in UI | All visible "FuelSniffer" → "Fillip" |
| Page titles & meta | `<title>`, `<meta name="description">`, OG tags |
| Favicon & app icons | Placeholder Fillip mark replaces current `favicon.ico` |
| README & docs | Top-level README, AGENTS.md, CLAUDE.md project block |
| `package.json` name | `"fuelsniffer"` → `"fillip"` |
| docker-compose service names | `app` stays; service-internal labels & comments updated; container_name optional add `fillip-app` etc. (see §5.5) |
| Env var names | New `APP_NAME`, `APP_PUBLIC_URL`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`. Existing `DATABASE_URL`, `SESSION_SECRET`, `QLD_API_TOKEN`, `MAPBOX_TOKEN`, `HEALTHCHECKS_PING_URL` unchanged. |
| Theme tokens | New `src/styles/tokens.css` with CSS custom properties; `globals.css` consumes them |
| Theme provider | `src/lib/theme/ThemeProvider.tsx` + `useTheme()` hook; ships locked to `"light"` |
| Light-theme repaint | All hard-coded dark hex values (`#111111`, `#1a1a1a`, `#2a2a2a`, `#8a8a8a`, etc.) routed through tokens; default token values render a clean light theme |
| Domain handling | All hard-coded URLs / origin checks read from `APP_PUBLIC_URL`; default falls back to `http://localhost:4000` for dev |
| Email sender identity | Module `src/lib/email/sender.ts` exposes `getDefaultSender()` returning `{name, address}` from env. No actual send path yet. |
| Tests | Update snapshot/text assertions that match `FuelSniffer`; add token-resolution + theme-provider unit tests |
| `.env.example` | New file (or update existing) with the new vars |

### Out of scope

(See §2.)

---

## 4. Dependencies

**None.** SP-0 is the entry point in the roadmap (master spec §7). It depends on nothing and unblocks SP-1, SP-2, SP-3 in parallel.

---

## 5. Key components & files to change

### 5.1 Brand strings

Search-and-replace targets (case-sensitive, then case-insensitive sweep):

- `src/app/layout.tsx` — `metadata.title`, `metadata.description`
- `src/app/dashboard/**` — header / nav components rendering "FuelSniffer"
- `src/app/login/**` — login card title
- `src/components/StationDetail.tsx`, `StationCard.tsx`, share copy
- `src/lib/scraper/**` — log lines (`console.log("[fuelsniffer] ...")` → `[fillip]`)
- `src/lib/db/migrate.ts` — startup banner
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `docker-compose.yml` comments
- `package.json` — `name`
- `next.config.mjs` — any `metadataBase` reference

A **single grep pass for `FuelSniffer` (any case)** gates the PR — must return zero hits in the listed surfaces and only intentional references in archived docs.

### 5.2 Theme tokens

New file: `src/styles/tokens.css`

Defines, at minimum:

```
[data-theme="light"] {
  --color-bg: #ffffff;
  --color-bg-elevated: #f5f5f7;
  --color-surface: #ffffff;
  --color-border: #e4e4e7;
  --color-text: #0f172a;
  --color-text-muted: #475569;
  --color-text-subtle: #64748b;
  --color-accent: #2563eb;            /* placeholder Fillip blue */
  --color-accent-fg: #ffffff;
  --color-success: #16a34a;
  --color-warn: #ca8a04;
  --color-danger: #dc2626;
  --color-focus-ring: #2563eb;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 16px rgba(15, 23, 42, 0.08);
}
```

Token names (not values) are the **stable contract** — SP-3 will tune values + add a `[data-theme="dark"]` block, but components consume `var(--color-bg)` etc. and won't change.

`globals.css` is rewritten to:
- Set `body { background: var(--color-bg); color: var(--color-text); }`
- Replace every `#xxxxxx` literal currently in `globals.css` (Leaflet popup overrides, scrollbar, focus ring) with token references.

### 5.3 Theme provider

New file: `src/lib/theme/ThemeProvider.tsx`

- Client component. Sets `<html data-theme="light">` on mount.
- Exposes `useTheme()` returning `{ theme, setTheme }`. `setTheme` is a no-op for SP-0 (logs a warning in dev), wired up so SP-3 can replace the implementation without touching consumers.
- Reads optional `APP_DEFAULT_THEME` env (validated: `"light"` only for SP-0; SP-3 expands).

`src/app/layout.tsx` wraps `{children}` in `<ThemeProvider>` and adds `data-theme="light"` to `<html>` to avoid FOUC before hydration.

### 5.4 Email sender identity

New file: `src/lib/email/sender.ts`

```
export function getDefaultSender(): { name: string; address: string } {
  return {
    name: process.env.EMAIL_FROM_NAME ?? "Fillip",
    address: process.env.EMAIL_FROM_ADDRESS ?? "no-reply@fillip.local",
  };
}
```

No transport, no template engine — that's SP-2. This module exists *only* so that when SP-2 lands, it imports a stable function rather than introducing both transport and identity in the same change. Add a single unit test that asserts the default + env override behaviour.

### 5.5 Docker / deployment

`docker-compose.yml` updates (low-risk):

- Add `container_name: fillip-app`, `fillip-postgres`, `fillip-db-backup`, `fillip-cloudflared` to each service. (Service *keys* — `app`, `postgres`, etc. — stay; renaming them would break any external `docker compose exec` muscle memory and isn't worth it.)
- Pass new env vars through to `app`: `APP_NAME`, `APP_PUBLIC_URL`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`.
- **Do not rename**: `POSTGRES_DB`, `POSTGRES_USER`, the `fuelsniffer:` portion of `DATABASE_URL`, volume paths, backup filename prefix `fuelsniffer_${TIMESTAMP}.sql.gz`. (See §10 Q3.)

`Dockerfile` updates: any `LABEL` or comment string mentioning FuelSniffer.

### 5.6 Repo-level

- `package.json` `"name": "fillip"` (Next.js doesn't consume this for runtime; safe.)
- `README.md` rewritten top-to-bottom for Fillip framing. Link to master + SP-0 specs.
- `CLAUDE.md` "Project" block updated; "Constraints" block keeps QLD-only language flagged with a "_(MVP scope; see master spec for national rollout)_" note.
- Folder rename `fuelsniffer/` → **deferred** to a follow-up cleanup commit (see §10 Q4); requires updating all worktree paths, CI configs, deploy scripts. SP-0 keeps the folder name.

### 5.7 Domain handling

Introduce `APP_PUBLIC_URL` env var (e.g. `https://fillip.com.au` in prod, `http://localhost:4000` in dev).

Used by:
- OG `metadataBase` in `src/app/layout.tsx`
- Any absolute URL construction (currently almost none — most internal links are relative; audit `src/app/api/**` for any hard-coded host)
- Future share-card / email links (SP-8 / SP-2)

Validation: throw at module load if `APP_PUBLIC_URL` is set but not a valid URL; default to `http://localhost:${PORT ?? 4000}` if unset (dev convenience).

---

## 6. Data model deltas

**None.** SP-0 touches no schema, no migrations, no queries, no seed data.

The `invite_codes`, `sessions`, `stations`, `price_readings`, `price_readings_daily` tables are unchanged. SP-2 owns auth schema changes; SP-1 owns multi-state ingestion.

---

## 7. Sequence / flow

There are no new runtime flows. The only meaningful flow change is **app boot**:

```
Next.js boot
  └─ src/app/layout.tsx renders
       └─ <html data-theme="light"> (set server-side, no FOUC)
            └─ <ThemeProvider initial="light">
                 └─ children…
                      └─ globals.css applies var(--color-*) tokens
                           └─ Components render with new light palette
```

Scraper boot via `src/instrumentation.ts` is unchanged. JWT session lookup via `src/lib/session.ts` is unchanged. Middleware (`src/middleware.ts`) is unchanged.

---

## 8. Error handling

SP-0 introduces three new failure modes, all at module load:

1. **`APP_PUBLIC_URL` set but malformed** → throw `Error("Invalid APP_PUBLIC_URL: …")` at startup. Same pattern as existing `DATABASE_URL` check.
2. **`APP_DEFAULT_THEME` set to anything other than `"light"`** → throw with message indicating dark mode lands in SP-3.
3. **Token-resolution failure (a component references a CSS var that doesn't exist)** → caught by a Vitest snapshot test that renders a representative component tree and asserts no `var(--undefined)` strings appear in computed style. Cheap regression guard.

Existing failure modes (missing `DATABASE_URL`, `SESSION_SECRET`, scraper API errors) are unchanged.

---

## 9. Test strategy

### Unit (Vitest)

- `src/__tests__/email/sender.test.ts` — `getDefaultSender()` returns env values when set, falls back to `Fillip / no-reply@fillip.local` when unset.
- `src/__tests__/theme/ThemeProvider.test.tsx` — provider sets `data-theme="light"`; `useTheme().setTheme("dark")` no-ops + warns in dev; consuming components render with token values.
- `src/__tests__/branding.test.ts` — greps `src/app/**`, `src/components/**`, `src/lib/**` for case-insensitive `fuelsniffer` and asserts zero matches. **This test is the spine of the PR.** It catches anything missed in the rename pass.

### Integration (existing Playwright config)

- Smoke test: load `/dashboard` (logged-in fixture), assert `<title>` contains `Fillip`, assert no `FuelSniffer` text in document, assert `<html data-theme="light">`, assert station card renders (no regression).
- Smoke test: load `/login`, assert wordmark and copy say Fillip.

### Visual

- Manual visual diff in dev: open dashboard, station detail, login, trip planner. Confirm no broken contrast on light theme. Run Lighthouse a11y check — must score ≥ existing baseline (record the number in PR description).

### Not tested (out of scope)

- Email send path (no transport in SP-0).
- Dark mode rendering.
- Domain cutover behaviour.

---

## 10. Open questions

> Each carries my recommended default. Tagged **decision pending** — happy to revisit per question.

**Q1. Light-only default contradicts the current dark-only product. Risk of jarring "huh, it looks worse" reaction from existing users (small friends-group cohort).**
- **Recommended default:** Ship light-only as the master spec dictates; brief the existing 5-ish beta users in Slack/WhatsApp the day of cutover with a "dark mode lands in SP-3, ~2 weeks" note. The light theme will be the default for the public Fillip launch anyway, so eat the change now rather than re-do it.
- **Alternative:** Keep dark-only in SP-0 and defer the light repaint to SP-3. Cheaper now, but means SP-0 ships with **no visible theme work**, which makes the rebrand feel half-done and complicates SP-3 (it'd have to introduce *both* themes).
- **Decision pending.**

**Q2. Final domain choice.**
- **Recommended default:** Make code domain-agnostic via `APP_PUBLIC_URL`, defer the actual purchase / DNS to a separate ops task. Code ships with `APP_PUBLIC_URL=http://localhost:4000` working out of the box. Master spec §10 already lists this as carried; SP-0 doesn't block on it.
- **Decision pending** (but not blocking).

**Q3. Rename the postgres database / role from `fuelsniffer` to `fillip`?**
- **Recommended default:** **No.** Renaming requires a coordinated downtime + dump/restore (or a `pg_dump | pg_restore` into a new db + recreate role + update `DATABASE_URL` + update backup filename prefix + update healthcheck). Risk : reward is poor — no user ever sees the database name. Leave it. Add a one-line note in CLAUDE.md ("internal db/role still named `fuelsniffer` for historical reasons; do not rename without a planned migration window").
- **Alternative:** Bundle the rename into SP-0 since we're already touching everything. Adds ~half a day and a tested rollback plan.
- **Decision pending.**

**Q4. Rename `fuelsniffer/` folder to `fillip/`?**
- **Recommended default:** Defer. The folder name leaks into worktree paths (`/.claude/worktrees/...`), git history, and any external scripts/cron jobs the user has. Ship SP-0 with the folder named `fuelsniffer/` and queue a separate cleanup PR ("rename app folder + update worktree paths") that can be batched with SP-1 or SP-2.
- **Decision pending.**

**Q5. Placeholder logo — design it inline or use plain text wordmark?**
- **Recommended default:** Plain text wordmark in the brand font (TBD in SP-3 — SP-0 uses Geist Sans bold) + a single-character monogram favicon (an "F" in the accent colour). No SVG mark. Keeps it obviously placeholder so no one mistakes it for shippable identity.
- **Decision pending.**

**Q6. Brand accent colour for the placeholder palette.**
- **Recommended default:** `#2563eb` (Tailwind blue-600). Generic, accessible, easy to override in SP-3. Avoids prematurely committing to a brand colour that the SP-3 design exploration might land somewhere else.
- **Decision pending.**

**Q7. Should `[fuelsniffer]` log prefixes be renamed?**
- **Recommended default:** Yes — rename to `[fillip]` in the same PR. Cheap, and makes log scraping / future log search consistent. Note for ops: any healthchecks.io / log-aggregator filters keyed on `[fuelsniffer]` need updating in the same window.
- **Decision pending.**

---

## 11. Rollout plan

SP-0 is a single coordinated change. Recommended sequence:

1. **PR 1 (this spec):** all code changes + tests + README + docker-compose comment-level changes. Merge to `main` once CI is green and the branding grep test passes.
2. **Manual smoke** (5 min): pull on prod, `docker compose build app && docker compose up -d app`, hit `/dashboard` in a browser, confirm wordmark + title + light theme. Confirm scraper heartbeat continues (`/api/health`).
3. **Heads-up to existing beta users** (Slack/WhatsApp): "We renamed to Fillip; dark mode coming back in ~2 weeks; nothing else changed."
4. **No DB migration**, no scraper restart beyond the routine container restart on deploy.

**Rollback:** straight `git revert` of the SP-0 PR + redeploy. Zero data risk because zero data changes. Branding grep test will fail on revert (revert reintroduces FuelSniffer strings) — that's expected; mark the test xfail in the revert commit if needed, then schedule re-application.

**Post-merge:** open follow-up tickets for (a) folder rename (Q4), (b) DB rename (Q3, only if we ever decide to do it), (c) domain purchase + cloudflared cutover, (d) real logo commission.

---

## 12. Definition of done

- [ ] Zero case-insensitive `fuelsniffer` matches in `src/app/**`, `src/components/**`, `src/lib/**` (enforced by `branding.test.ts`).
- [ ] `package.json` name = `fillip`.
- [ ] `<title>`, `<meta description>`, OG tags say Fillip; `<html data-theme="light">` set server-side.
- [ ] `src/styles/tokens.css` exists; `globals.css` contains no raw colour hex values (only `var(--…)`).
- [ ] `src/lib/theme/ThemeProvider.tsx` + `useTheme()` hook in place; `setTheme` no-op + dev warning.
- [ ] `src/lib/email/sender.ts` exists with one passing test.
- [ ] `APP_PUBLIC_URL`, `APP_NAME`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` env vars wired in `docker-compose.yml` and `.env.example`.
- [ ] All four Docker services have `container_name: fillip-*`.
- [ ] README rewritten for Fillip framing; CLAUDE.md project block updated; AGENTS.md updated.
- [ ] Vitest suite passes; Playwright smoke passes; Lighthouse a11y ≥ pre-SP-0 baseline (recorded in PR).
- [ ] All seven open questions in §10 resolved with the user before merge.
