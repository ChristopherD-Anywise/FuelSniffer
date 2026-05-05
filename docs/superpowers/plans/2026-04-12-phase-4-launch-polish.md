# Phase 4 — Launch Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every gap between "features work" and "the public can trust this site". Accessibility statement, full screen reader testing, error monitoring, landing page, privacy/terms pages, SEO metadata, ops runbooks, and the final production smoke test.

**Architecture:** No new architectural patterns. This phase is documentation, configuration, testing, and content. The one exception is Sentry/Glitchtip integration (new SDK dependency).

**Tech Stack:** Existing stack + `@sentry/nextjs` (or Glitchtip SDK).

**Depends on:** Phases 1-3 complete.

---

## Task 1: Full VoiceOver + NVDA accessibility pass (~2 days)

### What to do
- Test every route on: macOS Safari + VoiceOver, iOS Safari + VoiceOver, Windows Firefox + NVDA
- Follow a written test script per page (dashboard, trip planner, station detail, brand drawer, waitlist forms)
- Log findings in `docs/a11y/test-results-2026-XX-XX.md`
- Fix blocking findings; log non-blocking as known limitations
- These scripts become the permanent re-verification checklist

### Acceptance criteria
- [ ] Every page tested on all three platform/reader combos
- [ ] Results documented with pass/fail per item
- [ ] Blocking findings fixed with commits
- [ ] Non-blocking findings listed for the accessibility statement

---

## Task 2: Recharts data table alternative (~1 day)

### What to build
- Visually-hidden `<table>` below the 7-day price chart with the same data
- Use `<caption>` (not deprecated `<table summary="">`) + `aria-labelledby`
- Table is keyboard-focusable
- Tests: table present in DOM, data matches chart, screen reader announces it

---

## Task 3: Leaflet pin keyboard navigation (conditional, ~3 days)

### What to do
- Read `docs/a11y/leaflet-keyboard-decision.md` from the Phase 2 spike
- **Option (a):** Build custom DivIcon marker layer with roving tabindex, full ARIA
- **Option (b)/(c):** Close this ticket, document limitation in accessibility statement
- Whichever path: ensure the decision is reflected in the statement

---

## Task 4: Accessibility statement page (~0.5 days)

### What to build
- New route `/accessibility`
- WCAG 2.2 AA conformance claim
- Known limitations from Task 1 findings
- Contact email for a11y feedback
- Date of last audit, testing methodology
- Linked from footer

---

## Task 5: Accessibility test plan (~0.5 days)

### What to build
- `docs/a11y/test-plan.md` — formalised scripts from Task 1
- Tools used, manual steps per page, sign-off criteria
- Future re-verification document

---

## Task 6: Backup restore automation (~1 day)

### What to build
- Weekly cron: spin up throwaway Postgres container, restore latest backup, run smoke query
- Reports success/failure to healthchecks.io
- Runbook: `docs/ops/runbooks/db-backup-failed.md`

---

## Task 7: Secrets rotation runbook (~0.5 days)

### What to build
- `docs/ops/runbooks/secrets-rotation.md`
- Step-by-step for: DB password, QLD_API_TOKEN, NSW_FUELCHECK_CLIENT_SECRET, MAPBOX_TOKEN, SESSION_SECRET, WAITLIST_EMAIL_AES_KEY, WAITLIST_EMAIL_PEPPER, SENTRY_DSN
- Each: where it lives, how to generate, expected downtime

---

## Task 8: Security.txt (~0.25 days)

### What to build
- `/.well-known/security.txt` served via a Next.js API route or static file
- Contact email, disclosure policy, acknowledgements URL, expiry date
- Per RFC 9116

---

## Task 9: Final dependency audit + pinning (~0.5 days)

### What to do
- `npm audit fix`
- Review each remaining warning, document accept/reject in `SECURITY.md`
- Pin all direct dependencies to exact versions in package.json
- Set up Dependabot/Renovate (config file only, no auto-merge)

---

## Task 10: Waitlist deletion runbook (~0.5 days)

### What to build
- `docs/ops/runbooks/waitlist-deletion.md`
- Canonical `privacy@fuelsniffer.<tld>` email (register it)
- Step-by-step: receive request → verify → run documented SQL → confirm
- SLA: 7 business days
- Linked from privacy policy

---

## Task 11: Waitlist conversion-by-source runbook (~0.25 days)

### What to build
- `docs/ops/runbooks/waitlist-conversion-report.md`
- SQL: `SELECT source, COUNT(*) FROM waitlist_signups GROUP BY source ORDER BY 2 DESC;`
- Instructions for running safely with read-only credentials

---

## Task 12: Error monitoring — Sentry/Glitchtip (~1 day)

### What to build
- Install `@sentry/nextjs` (or Glitchtip SDK)
- Source maps uploaded at build time
- PII scrubbing: strip request bodies, query strings, email fields from events
- Sample rate: 1.0 errors, 0.0 performance traces
- `SENTRY_DSN` env var; absent = disabled
- Test: deliberate error in test API route is captured

---

## Task 13: Application health monitoring (~1.5 days)

### What to build
- Expand `/api/health` to report: scraper last-run per provider, DB connection status, routing cache hit rate, 5-min error rate
- Healthchecks.io pings from: scraper (exists), backup restore (Task 6), abuse detection (Phase 3), audit log cleanup (Phase 3)
- External uptime monitor (Uptime Kuma or free tier) pinging `/api/health` every 5 min
- Test: kill scraper, verify alert fires

---

## Task 14: Alerting runbooks (~1 day)

### What to build
- `docs/ops/runbooks/` — one file per alert type:
  - `scraper-down.md`, `site-down.md`, `db-backup-failed.md`, `suspicious-traffic.md`, `waitlist-spam-incident.md`, `csp-violations-spike.md`, `mapbox-quota-exceeded.md`
- Each: symptoms, likely causes, immediate mitigations, investigation steps, resolution

---

## Task 15: Performance baseline (~0.5 days)

### What to do
- Run Lighthouse on landing, dashboard, trip planner
- Record in `docs/perf/baseline-<date>.md`
- Fix cheap red findings (render-blocking resources, unoptimised images)

---

## Task 16: Data collection notice (~0.5 days)

### What to build
- Persistent dismissible notice on first visit: "FuelSniffer collects hashed IP and user-agent for security. No tracking cookies. Waitlist email only with consent."
- Links to privacy policy
- Dismissal in localStorage
- Keyboard-accessible dismiss button
- Screen reader announces on first visit

---

## Task 17: Landing page (~1.5 days)

### What to build
- Route at `/` (or `/welcome`)
- Hero: value prop, screenshot, primary CTA to dashboard, secondary CTA to waitlist
- Three feature blocks: map, trip planner, NSW+QLD
- Footer-band waitlist with `source=landing-page-cta`
- "What we don't do yet" section linking to waitlist
- Full a11y: keyboard nav, contrast, screen reader tested

---

## Task 18: Privacy policy (~1 day)

### What to build
- `/privacy` page — written as one of the LAST Phase 4 tickets so it reflects actual implementation
- What we collect, why, how stored, deletion process, third parties (Mapbox, fuel APIs, Cloudflare, Sentry), Australian Privacy Principles jurisdiction
- Linked from footer + every waitlist CTA

---

## Task 19: Terms of use (~0.5 days)

### What to build
- `/terms` page: service usage, prices-are-indicative disclaimer, data attribution, liability limits
- Short, plain language

---

## Task 20: Footer refresh (~0.25 days)

### What to build
- Links: privacy, terms, accessibility, security.txt, GitHub, health status
- Present on every page, a11y verified

---

## Task 21: SEO + link-preview metadata (~0.5 days)

### What to build
- `robots.txt`: allow all, disallow `/api/*` and `/dashboard/*`
- `sitemap.xml`: `/`, `/dashboard`, `/dashboard/trip`, `/privacy`, `/terms`, `/accessibility`
- OG + Twitter Card meta tags in `layout.tsx` with `public/og-image.png` (1200x630)
- Per-page metadata overrides for trip planner
- Test: sitemap URL list, OG tags, manual check via opengraph.dev

---

## Task 22: Launch readiness checklist review (~0.5 days)

### What to do
- Walk every DoD item from Phases 1-3 and tick off or reopen
- Fix regressions
- Document anything intentionally deferred

---

## Task 23: End-to-end smoke test on production (~0.5 days)

### What to do
- Deploy to production environment
- Run the full user acceptance checklist from every phase on the live site
- Record results with screenshots/video
- **Ship only when every item passes**

---

## Phase 4 Definition of Done

- [ ] VoiceOver + NVDA tests on every page, documented
- [ ] Recharts data table alternative present and uses `<caption>`
- [ ] Leaflet pin keyboard nav: implemented or documented as known limitation
- [ ] Accessibility statement live
- [ ] Accessibility test plan committed
- [ ] Backup restore automation verified
- [ ] Secrets rotation runbook covers every secret
- [ ] `/.well-known/security.txt` live
- [ ] Dependencies pinned, Dependabot enabled, `npm audit` clean
- [ ] Waitlist deletion runbook + canonical email live
- [ ] Waitlist conversion report runbook live
- [ ] Error monitoring installed, PII scrubbing verified
- [ ] `/api/health` expanded, uptime monitor pinging, alerts verified
- [ ] All alert runbooks written
- [ ] Lighthouse no red findings
- [ ] Data collection notice renders on first visit
- [ ] Landing page live, accessible
- [ ] Privacy policy live, matches implementation
- [ ] Terms of use live
- [ ] Footer correct on every page
- [ ] `robots.txt`, `sitemap.xml`, OG tags live and verified
- [ ] All Phase 1-3 DoD items re-verified on production
- [ ] E2E smoke test passes with evidence
- [ ] **Launch day checklist exists and ready to execute**
