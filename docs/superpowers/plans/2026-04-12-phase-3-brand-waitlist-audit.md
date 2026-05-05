# Phase 3 — Brand Filter, Waitlist, Audit Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the brand exclude filter, waitlist signup CTAs, and the security defence-in-depth layer (audit logging, abuse detection, scoped DB roles, CSP enforcement, PII posture documentation).

**Architecture:** Brand filter stored in localStorage, wired through existing API + trip corridor queries. Waitlist: dedicated endpoint with honeypot, rate limiting, AES-GCM email encryption (from Phase 1 plumbing). Audit log: async in-process bounded queue writing to Postgres. Abuse detection: node-cron scheduled job querying the audit log.

**Tech Stack:** Existing stack plus no new dependencies.

**Depends on:** Phase 1 (waitlist encryption, CSP report-only) and Phase 2 (corridor query `excludeBrands` param) complete.

---

## Task 1: BrandFilterDrawer component + API wiring (~1.5 days)

**Files:**
- Create: `src/components/BrandFilterDrawer.tsx`
- Modify: `src/components/FilterBar.tsx` — add "Brands" button
- Modify: `src/app/api/prices/route.ts` — accept `excludeBrands` query param
- Create: `src/__tests__/brand-filter.test.ts`

### What to build
- Drawer component accessible from FilterBar via a "Brands" button
- Shows all brands currently visible, sorted by station count descending
- Checkbox per brand; unchecking excludes that brand
- State persisted in `localStorage` under `fuelsniffer:excluded_brands`
- Passed to `/api/prices` as `excludeBrands` comma-separated query param
- Trip planner corridor query already accepts `excludeBrands` (Phase 2) — wire it through
- Clear-all and reset-to-defaults controls
- `role="dialog"`, focus trap, Escape closes, keyboard-accessible checkboxes

### Tests
- Component: renders brands, toggle works, localStorage persists
- API: excluded brands not in response
- A11y: focus trap, Escape, keyboard navigation

### Acceptance criteria
- [ ] Brand drawer opens/closes from FilterBar
- [ ] Excluding "7-Eleven" removes all 7-Eleven stations from map + list
- [ ] Trip planner corridor results also respect exclusion
- [ ] State survives page reload
- [ ] Keyboard-only user can operate the drawer

---

## Task 2: Waitlist signup endpoint (~2 days)

**Files:**
- Create: `src/app/api/waitlist/route.ts`
- Modify: `src/lib/security/rate-limit.ts` — add waitlist limit (3/24h per IP)
- Create: `src/lib/waitlist/honeypot.ts`
- Create: `src/__tests__/waitlist-api.test.ts`

### What to build
- `POST /api/waitlist` accepts `{ email, source, consent, website }`
- `website` is the honeypot field — must be empty; non-empty returns 200 silently
- Zod validation: email format, `source` from allow-list (`historical-chart-cta`, `brand-filter-cta`, `footer-cta`, `landing-page-cta`), `consent` must be `true`
- Uses `encryptEmail()` and `hashEmail()` from Phase 1 `src/lib/waitlist/encryption.ts`
- Rate limit: 3 signups per `ip_hash` per 24 hours (separate bucket from minute-based limits)
- Response codes: 200 success (or honeypot hit), 400 invalid, 429 rate-limited, 409 duplicate
- Hashes IP via SHA-256 before storing in `ip_hash`, hashes UA for `ua_hash`

### Tests
- Unit: honeypot detection
- Integration: each response code, spam flood simulation (10 signups from one IP)
- Encryption round-trip verified in the endpoint flow

### Acceptance criteria
- [ ] Valid signup writes an encrypted row
- [ ] Honeypot-filled request returns 200 but writes nothing
- [ ] Duplicate email returns 409
- [ ] 4th signup from same IP returns 429
- [ ] Invalid email format returns 400

---

## Task 3: Waitlist CTAs + WaitlistForm + WaitlistSuccess (~2 days)

**Files:**
- Create: `src/components/WaitlistForm.tsx` — shared form component with `source` prop
- Create: `src/components/WaitlistSuccess.tsx` — inline success replacement
- Modify: `src/components/StationDetail.tsx` — historical-chart CTA
- Modify: `src/components/BrandFilterDrawer.tsx` — brand-filter CTA
- Create or modify: footer component — footer CTA
- Create: `src/__tests__/waitlist-form.test.ts`

### What to build
- `<WaitlistForm source="historical-chart-cta" />` renders: email input, hidden `website` honeypot, consent checkbox with label, submit button
- Consent copy: "I agree to FuelSniffer storing my email address to notify me about new features. You can request deletion at any time."
- Submit disabled until consent checked
- On success: form replaced by `<WaitlistSuccess>` — "You're in. We'll email you when there's news."
- Success announced via `aria-live="polite"`
- Positioning copy: "Notify me when login/personalisation ships"
- Three CTA placements:
  1. StationDetail: below 7-day chart, "Want 90-day trends, price alerts, favourites?"
  2. BrandFilterDrawer: banner, "Have a loyalty program? Get discounts factored in"
  3. Footer: persistent, "Get notified when personalisation launches"
- Error messages in `aria-live="assertive"` region, associated via `aria-describedby`
- Visible labels on all inputs (not placeholder-only)

### Tests
- Each CTA renders with correct source
- Form submission routes to correct endpoint
- Success state replaces form and is announced
- Consent checkbox disables submit
- Error announcement in live region

### Acceptance criteria
- [ ] All three CTAs visible in their locations
- [ ] Form submits successfully and shows success state
- [ ] Screen reader announces success/error
- [ ] `source` value appears in DB row

---

## Task 4: Structured audit logging (~2 days)

**Files:**
- Create: `src/lib/db/migrations/0013_audit_log.sql`
- Modify: `src/lib/db/migrate.ts`
- Create: `src/lib/security/audit-log.ts`
- Modify: `src/middleware.ts` — append to audit queue after response
- Create: `src/__tests__/audit-log.test.ts`

### What to build
- `audit_log` table: `(id, ts, ip_hash, path, method, status, duration_ms, ua_hash, request_id)`
- Middleware generates `request_id` UUID and returns it in `X-Request-ID` header
- **Async write mechanism:** in-process bounded `Array<AuditLogEntry>` (cap 1000), `setInterval(drain, 1000)` flushes up to 200 entries per tick via batch INSERT. Drop oldest on overflow. Drain loop exits cleanly on SIGTERM.
- PII redaction: no query strings, no bodies, no headers except UA (hashed)
- 30-day retention enforced by the retention job (Task 5)

### Tests
- Unit: queue push, drain flushes, overflow drops oldest
- Integration: middleware writes audit row, X-Request-ID round-trips
- PII: confirm no query strings or bodies in audit rows

### Acceptance criteria
- [ ] Every API request produces an audit log row
- [ ] `X-Request-ID` header present on every response
- [ ] No PII in audit rows (no emails, no raw IPs, no query strings)
- [ ] Queue overflow drops oldest entries without blocking requests

---

## Task 5: Audit log retention job (~0.5 days)

**Files:**
- Modify: `src/lib/scraper/scheduler.ts` — add nightly cron job

### What to build
- Nightly scheduled job via node-cron: `DELETE FROM audit_log WHERE ts < NOW() - INTERVAL '30 days'`
- Reports to healthchecks.io
- Tests: seed 31-day-old rows, run job, assert deleted; fresh rows untouched

---

## Task 6: Abuse detection rules (~1.5 days)

**Files:**
- Create: `src/lib/security/abuse-detect.ts`
- Create: `src/lib/db/migrations/0014_abuse_tables.sql` (blocked_ips + abuse_flags)
- Modify: `src/lib/db/migrate.ts`
- Modify: `src/middleware.ts` — check blocked_ips
- Modify: `src/lib/scraper/scheduler.ts` — run every 5 min
- Create: `src/__tests__/abuse-detect.test.ts`

### What to build
- Rule 1: >300 req/min sustained 5 min → `blocked_ips` (7-day TTL)
- Rule 2: >10 waitlist attempts/hour → `abuse_flags` (human review)
- Rule 3: >60 4xx/min → `abuse_flags`
- Thresholds configurable via env vars (defaults above)
- Blocked IPs return 403 at middleware
- Tests: seeded audit log triggers each rule correctly

---

## Task 7: Scoped DB roles (~1 day)

**Files:**
- Create: `src/lib/db/migrations/0015_scoped_roles.sql`
- Modify: docker-compose.yml — app connects as `app_readwrite`

### What to build
- `app_readwrite` role: SELECT/INSERT/UPDATE/DELETE on application tables, no DROP, no system tables
- Migrations run as superuser via `DATABASE_URL_MIGRATE`
- Test: connect as `app_readwrite`, attempt DROP TABLE, verify it fails

---

## Task 8: Full CSP enforcement (~1 day)

**Files:**
- Modify: `src/lib/security/headers.ts`

### What to build
- Review CSP report-only violations from Phase 1 soak
- Switch `Content-Security-Policy-Report-Only` to `Content-Security-Policy`
- Add per-request nonces when Next.js nonce support is available
- Leaflet tile sources + Recharts whitelisted
- 48-hour soak in report-only before switching (done during Phase 1+2)
- Test: enforce mode active, deliberately-blocked script fails

---

## Task 9: PII posture documentation (~0.5 days)

**Files:**
- Create: `docs/security/pii-posture.md`

### What to build
- What we collect, where stored, how encrypted, retention, access control, deletion
- Cross-linked from Phase 4 privacy policy
- No code — documentation deliverable

---

## Task 10-11: Form accessibility + screen reader spot check (~1.5 days)

- All waitlist form inputs have visible labels
- Error messages in `aria-live="assertive"` with `aria-describedby`
- Brand drawer: `role="dialog"`, focus trap, Escape
- VoiceOver spot check on iOS + macOS Safari for brand drawer, waitlist form, station cards
- Findings logged in `docs/a11y/phase3-findings.md`
- Blockers fixed; non-blockers carry to Phase 4

---

## Phase 3 Definition of Done

- [ ] Brand exclude filter works end-to-end (map, list, trip planner)
- [ ] Waitlist signup with encryption, honeypot, rate limit, duplicate detection
- [ ] All three CTAs render and submit with correct source
- [ ] WaitlistSuccess replaces form, announced to screen readers
- [ ] Audit log captures every request, X-Request-ID round-trips
- [ ] Abuse detection fires correctly on seeded data
- [ ] App runs as `app_readwrite`; DROP TABLE fails
- [ ] CSP in enforce mode, 48-hour soak clean
- [ ] PII posture doc written
- [ ] Form a11y verified (labels, error announcement, focus traps)
- [ ] VoiceOver spot check done, blockers fixed
- [ ] `npx vitest run` green, `npx tsc --noEmit` green, `npm audit` clean
