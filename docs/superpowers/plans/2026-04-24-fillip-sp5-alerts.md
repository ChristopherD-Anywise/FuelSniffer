# Fillip SP-5 — Alerts (Email + Web Push) Implementation Plan

**Goal:** Deliver D3 — Real price alerts. Four alert types (price_threshold, cycle_low, favourite_drop, weekly_digest), two channels (email + web push), full dedup/rate-limit/quiet-hours infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-22-fillip-sp5-alerts-design.md` (v1.1 — Resend confirmed, self-hosted web-push confirmed, PostGIS confirmed)

**Branch:** `sp5-alerts` (worktree `/Users/cdenn/Projects/FuelSniffer/.worktrees/sp5`)

**Base:** `fillip-integration` (SP-0+1+2+3+4 merged, 428 tests passing)

**Dependencies:**
- SP-2: `users` table (UUID PK), `EmailSender` interface, `ResendEmailSender`, `MemoryEmailSender`, `getSession()`
- SP-3: service worker at `src/app/sw.ts` with stub push handlers registered
- SP-4: `cycle_signals` table with `signal_state`, `prev_signal` needed for edge-trigger detection
- SP-1: PostGIS extension enabled; `stations.geom` column for `ST_DWithin` queries

**Critical notes:**
- `users.id` is UUID, not BIGINT (migration 0013)
- `cycle_signals` has no `prev_signal` column — evaluator must detect transitions by querying 2 rows
- Email interface is `EmailSender` (not `EmailProvider`) from `src/lib/email/types.ts`
- `send()` on EmailSender returns `Promise<void>`, not `Promise<{ id: string }>` — extend interface in dispatcher
- Migrations: 0018 is taken by cycle_signals; use 0019–0022

---

## File Structure

**Files created** (all under `fuelsniffer/`):

| Path | Responsibility |
|---|---|
| `src/lib/db/migrations/0019_alerts.sql` | `alert_type` enum, `delivery_status` enum, `alerts` table |
| `src/lib/db/migrations/0020_alert_deliveries.sql` | `alert_deliveries` table with UNIQUE dedup constraint |
| `src/lib/db/migrations/0021_web_push_subscriptions.sql` | `web_push_subscriptions` table |
| `src/lib/db/migrations/0022_favourite_stations.sql` | `favourite_stations` M2M table + user TZ/quiet-hours columns |
| `src/lib/alerts/criteria.ts` | Zod schemas for each `criteria_json` shape |
| `src/lib/alerts/types.ts` | TypeScript types: `Alert`, `AlertDelivery`, `WebPushSubscription`, etc. |
| `src/lib/alerts/evaluator/priceThreshold.ts` | Evaluates price_threshold alerts |
| `src/lib/alerts/evaluator/favouriteDrop.ts` | Evaluates favourite_drop alerts |
| `src/lib/alerts/evaluator/cycleLow.ts` | Evaluates cycle_low alerts (edge-triggered) |
| `src/lib/alerts/evaluator/weeklyDigest.ts` | Evaluates weekly_digest alerts |
| `src/lib/alerts/evaluator/index.ts` | `runAlertsEvaluator()` orchestrator |
| `src/lib/alerts/dispatcher/rateLimit.ts` | Per-alert min-interval + daily cap check |
| `src/lib/alerts/dispatcher/quietHours.ts` | TZ-aware quiet hours predicate |
| `src/lib/alerts/dispatcher/email/index.ts` | `AlertEmailSender` interface (extends EmailSender) |
| `src/lib/alerts/dispatcher/email/resend.ts` | Resend impl wrapping existing ResendEmailSender |
| `src/lib/alerts/dispatcher/push/index.ts` | `WebPushProvider` interface + `webpush` implementation |
| `src/lib/alerts/dispatcher/templates/email/priceThreshold.ts` | HTML+text email template |
| `src/lib/alerts/dispatcher/templates/email/cycleLow.ts` | HTML+text email template |
| `src/lib/alerts/dispatcher/templates/email/favouriteDrop.ts` | HTML+text email template |
| `src/lib/alerts/dispatcher/templates/email/weeklyDigest.ts` | HTML+text email template |
| `src/lib/alerts/dispatcher/templates/email/footer.ts` | Shared footer with unsubscribe/pause links |
| `src/lib/alerts/dispatcher/templates/push.ts` | Push payload builder per alert type |
| `src/lib/alerts/dispatcher/index.ts` | `dispatchAlert()` — fans out to email + push channels |
| `src/lib/alerts/unsubscribe.ts` | Signed JWT helpers for unsubscribe/pause tokens |
| `src/lib/alerts/scheduler.ts` | Weekly digest cron + subscription cleanup cron |
| `src/app/api/alerts/route.ts` | GET (list), POST (create) alerts |
| `src/app/api/alerts/[id]/route.ts` | PATCH (update), DELETE alerts |
| `src/app/api/alerts/[id]/history/route.ts` | GET last 50 deliveries |
| `src/app/api/alerts/[id]/test/route.ts` | POST test delivery |
| `src/app/api/alerts/unsubscribe/route.ts` | GET one-click unsubscribe (JWT) |
| `src/app/api/alerts/pause/route.ts` | GET one-click pause (JWT) |
| `src/app/api/push/subscriptions/route.ts` | GET list, POST register push sub |
| `src/app/api/push/subscriptions/[id]/route.ts` | DELETE revoke push sub |
| `src/app/api/me/quiet-hours/route.ts` | PATCH update quiet hours + timezone |
| `src/app/api/me/favourites/[stationId]/route.ts` | POST/DELETE favourite station |
| `src/components/alerts/AlertWizard.tsx` | Client component: create alert form + push permission flow |
| `src/__tests__/alerts/criteria.test.ts` | Zod schema validation tests |
| `src/__tests__/alerts/rateLimit.test.ts` | Rate limiter unit tests |
| `src/__tests__/alerts/quietHours.test.ts` | Quiet hours predicate TZ tests |
| `src/__tests__/alerts/dedupKey.test.ts` | Dedup key derivation tests |
| `src/__tests__/alerts/evaluator.test.ts` | Integration: synthetic price changes → deliveries |
| `src/__tests__/alerts/cycleLow.test.ts` | Cycle edge-trigger idempotency tests |
| `src/__tests__/alerts/dispatcher.test.ts` | Dispatcher with mocked channels |
| `src/__tests__/alerts/templates.test.ts` | Template snapshot tests |
| `src/__tests__/alerts/scraperIsolation.test.ts` | Evaluator failure does NOT break scraper |

**Files modified:**

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | Add alerts, alert_deliveries, web_push_subscriptions, favourite_stations tables |
| `src/lib/scraper/scheduler.ts` | Add post-scrape hook: `queueMicrotask(() => runAlertsEvaluator(...))` |
| `src/instrumentation.ts` | Import and start alerts scheduler (digest + cleanup crons) |
| `src/app/sw.ts` | Replace stub push handler with real notification display + click handler |
| `.env.example` | Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, RESEND_FROM |

---

## Task 0: Setup

- [ ] **Step 1: Verify baseline**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp5
git branch --show-current
# expect: sp5-alerts
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp5/fuelsniffer
npm install --legacy-peer-deps web-push @types/web-push
```

- [ ] **Step 3: Generate VAPID keys for dev**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp5/fuelsniffer
npx web-push generate-vapid-keys
# Copy output to .env.example with placeholder comments
```

- [ ] **Step 4: Capture baseline test count**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp5/fuelsniffer
npm run test:run 2>&1 | tail -20
npm run lint 2>&1 | grep "problem" | tail -5
```

---

## Task 1: Database migrations (0019–0022)

**Files:**
- `src/lib/db/migrations/0019_alerts.sql`
- `src/lib/db/migrations/0020_alert_deliveries.sql`
- `src/lib/db/migrations/0021_web_push_subscriptions.sql`
- `src/lib/db/migrations/0022_favourite_stations.sql`
- `src/lib/db/schema.ts`

### Migration 0019: alerts table

```sql
-- SP-5: Alerts
CREATE TYPE alert_type AS ENUM (
  'price_threshold', 'cycle_low', 'favourite_drop', 'weekly_digest'
);

CREATE TABLE alerts (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            alert_type   NOT NULL,
  criteria_json   JSONB        NOT NULL,
  channels        TEXT[]       NOT NULL DEFAULT '{email,push}',
  paused          BOOLEAN      NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_fired_at   TIMESTAMPTZ,
  last_evaluated_at TIMESTAMPTZ,
  label           TEXT,
  CONSTRAINT alerts_channels_check CHECK (cardinality(channels) >= 1)
);

CREATE INDEX alerts_user_id_idx ON alerts (user_id);
CREATE INDEX alerts_type_active_idx ON alerts (type) WHERE paused = false;
CREATE INDEX alerts_user_type_idx ON alerts (user_id, type);
```

### Migration 0020: alert_deliveries table

```sql
-- SP-5: Alert delivery log
CREATE TYPE delivery_status AS ENUM (
  'queued', 'sent', 'delivered', 'failed',
  'suppressed_quiet_hours', 'suppressed_rate_limit', 'bounced'
);

CREATE TABLE alert_deliveries (
  id                  BIGSERIAL        PRIMARY KEY,
  alert_id            BIGINT           NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  fired_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  channel             TEXT             NOT NULL,
  payload_hash        TEXT             NOT NULL,
  dedup_key           TEXT             NOT NULL,
  status              delivery_status  NOT NULL,
  provider_message_id TEXT,
  error               TEXT,
  retry_count         INT              NOT NULL DEFAULT 0,
  CONSTRAINT alert_deliveries_dedup UNIQUE (alert_id, channel, dedup_key)
);

CREATE INDEX alert_deliveries_alert_fired_idx ON alert_deliveries (alert_id, fired_at DESC);

-- 90-day retention (cleaned by nightly cron)
CREATE INDEX alert_deliveries_fired_at_idx ON alert_deliveries (fired_at);
```

### Migration 0021: web_push_subscriptions table

```sql
-- SP-5: Web push subscriptions
CREATE TABLE web_push_subscriptions (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT         NOT NULL UNIQUE,
  keys_p256dh  TEXT         NOT NULL,
  keys_auth    TEXT         NOT NULL,
  ua           TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX web_push_subs_user_active_idx
  ON web_push_subscriptions (user_id) WHERE revoked_at IS NULL;
```

### Migration 0022: favourite_stations + user profile columns

```sql
-- SP-5: Favourite stations M2M
CREATE TABLE favourite_stations (
  user_id    UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id INTEGER  NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, station_id)
);

-- SP-5: User timezone + quiet hours (add if not present)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone          TEXT    NOT NULL DEFAULT 'Australia/Brisbane',
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME    NOT NULL DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end   TIME    NOT NULL DEFAULT '07:00';
```

- [ ] **Step 1:** Write all 4 migration SQL files
- [ ] **Step 2:** Add Drizzle schema definitions in `schema.ts` for all 4 new tables
- [ ] **Step 3:** Add type exports

---

## Task 2: Zod criteria schemas + types

**File:** `src/lib/alerts/criteria.ts`, `src/lib/alerts/types.ts`

- [ ] **Step 1:** Create `criteria.ts` with Zod schemas for all 4 criteria shapes (strict — no extra keys)
- [ ] **Step 2:** Export `CriteriaForType<T>` mapped type
- [ ] **Step 3:** Create `types.ts` with TS interfaces for `Alert`, `AlertDelivery`, `WebPushSubscription`, `FavouriteStation`, `PushPayload`, `DeliveryCandidate`

---

## Task 3: Dispatcher infrastructure

**Files:**
- `src/lib/alerts/dispatcher/rateLimit.ts`
- `src/lib/alerts/dispatcher/quietHours.ts`
- `src/lib/alerts/dispatcher/email/index.ts`
- `src/lib/alerts/dispatcher/push/index.ts`
- `src/lib/alerts/unsubscribe.ts`

### rateLimit.ts

Pure function `checkRateLimit(alert: Alert, now: Date): { allowed: boolean; reason?: string }`:
- Compare `alert.last_fired_at` to `now` against min interval per type
- Min intervals: `price_threshold` 4h, `favourite_drop` 4h, `cycle_low` 24h, `weekly_digest` 7d

### quietHours.ts

`isInQuietHours(user: { timezone: string; quiet_hours_start: string; quiet_hours_end: string }, now: Date): boolean`:
- Convert `now` to user's local TZ using `Intl.DateTimeFormat`
- Handle overnight windows (21:00–07:00 wraps midnight)

### email/index.ts

`AlertEmailSender` interface extending existing `EmailSender`:
```typescript
interface AlertEmailSender {
  send(opts: AlertEmailOpts): Promise<{ id?: string }>
}
```

### push/index.ts

`WebPushProvider` interface + `sendWebPush(sub, payload, options)` implementation:
- Requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` from env
- Returns status and handles 404/410 → subscription revocation signal

### unsubscribe.ts

- `createAlertToken(alertId, action: 'unsubscribe' | 'pause'): Promise<string>` — 30-day JWT signed with SESSION_SECRET, `aud: 'alert-mgmt'`
- `verifyAlertToken(token: string): Promise<{ alertId: bigint; action: string } | null>`

- [ ] **Step 1:** Write `rateLimit.ts` (pure, no DB)
- [ ] **Step 2:** Write `quietHours.ts` (pure, no DB)
- [ ] **Step 3:** Write email `index.ts` interface + Resend wrapper
- [ ] **Step 4:** Write push `index.ts` with `web-push` library
- [ ] **Step 5:** Write `unsubscribe.ts` JWT helpers

---

## Task 4: Email templates

**Files:**
- `src/lib/alerts/dispatcher/templates/email/footer.ts`
- `src/lib/alerts/dispatcher/templates/email/priceThreshold.ts`
- `src/lib/alerts/dispatcher/templates/email/cycleLow.ts`
- `src/lib/alerts/dispatcher/templates/email/favouriteDrop.ts`
- `src/lib/alerts/dispatcher/templates/email/weeklyDigest.ts`
- `src/lib/alerts/dispatcher/templates/push.ts`

Each email template module exports:
```typescript
function renderTemplate(data: TemplateData): { subject: string; html: string; text: string }
```

Footer includes:
- One-click pause link (signed JWT)
- One-click unsubscribe link (signed JWT)
- "Manage alert preferences" link → `/dashboard/alerts`
- Sender identification block (Spam Act 2003 AU compliance)

Push template exports `buildPushPayload(data): PushPayload` per alert type.

**Subject lines (≤50 chars):**
- `price_threshold`: `"U91 just hit $1.74 near you"`
- `cycle_low`: `"Fill now — cycle low for [suburb]"`
- `favourite_drop`: `"[Station] dropped 12¢ — fill up"`
- `weekly_digest`: `"Your fuel outlook for this week"`

- [ ] **Step 1:** Write `footer.ts` with signed link generation
- [ ] **Step 2:** Write all 4 email templates (HTML + plain text)
- [ ] **Step 3:** Write `push.ts` payload builder

---

## Task 5: Evaluator modules

**Files:**
- `src/lib/alerts/evaluator/priceThreshold.ts`
- `src/lib/alerts/evaluator/favouriteDrop.ts`
- `src/lib/alerts/evaluator/cycleLow.ts`
- `src/lib/alerts/evaluator/weeklyDigest.ts`
- `src/lib/alerts/evaluator/index.ts`

### priceThreshold.ts

```typescript
async function evaluatePriceThreshold(
  alerts: Alert[], sinceTs: Date
): Promise<DeliveryCandidate[]>
```

Algorithm:
1. For each active price_threshold alert: find stations within `criteria.radius_km` of `centre` using PostGIS `ST_DWithin` (fallback to haversine if PostGIS unavailable)
2. For each station, get latest price from readings since `sinceTs`
3. If `price_cents <= criteria.max_price_cents`, yield candidate with `dedup_key = 'pt:{alert_id}:{station_id}:{date}'`

### favouriteDrop.ts

1. For each active favourite_drop alert: get station's price at `now()` and `now() - window_minutes`
2. If `drop >= min_drop_cents`, yield candidate with `dedup_key = 'fd:{alert_id}:{date}:{floor(now/4h)}'`

### cycleLow.ts

Edge-triggered. Query:
```sql
SELECT * FROM cycle_signals
WHERE signal_state = 'FILL_NOW'
  AND computed_at > $last_eval_at
```

Then compare to last 2 rows per suburb_key+fuel_type_id to detect transition (previous signal was NOT `FILL_NOW`).

Dedup key: `cycle:{suburb_key}:{fuel_type_id}:{yyyy-mm-dd}`

### weeklyDigest.ts

Checks if now is Sunday 06:00–06:59 in user's local TZ. Computes:
1. Best day to fill: day-of-week with lowest median price over last 4 weeks from `price_readings_daily`
2. Top 3 stations within `radius_km` at current prices
3. Cycle signal verdict from `cycle_signals` for user's suburb

Dedup key: `digest:{alert_id}:{iso_year}-W{iso_week}`

### index.ts — runAlertsEvaluator

```typescript
export async function runAlertsEvaluator(opts: {
  providerId: string
  sinceTs?: Date
}): Promise<void>
```

- Load all active (non-paused) alerts per type (feature-flag check: `ALERTS_ENABLED_TYPES`)
- Run each evaluator, collect candidates
- For each candidate: check rate limit → check quiet hours → dispatch → write delivery record
- Update `alerts.last_evaluated_at`
- Log summary: candidates, sent, suppressed_rate_limit, suppressed_quiet_hours, failed
- Entire function wrapped in try/catch — errors logged but not re-thrown

- [ ] **Step 1:** Write `priceThreshold.ts`
- [ ] **Step 2:** Write `favouriteDrop.ts`
- [ ] **Step 3:** Write `cycleLow.ts`
- [ ] **Step 4:** Write `weeklyDigest.ts`
- [ ] **Step 5:** Write `index.ts` orchestrator

---

## Task 6: Dispatcher

**File:** `src/lib/alerts/dispatcher/index.ts`

`dispatchAlert(candidate, emailSender, pushProvider): Promise<DeliveryRecord>`:
1. For each channel in candidate.alert.channels:
   - Build template (email or push)
   - Check quiet hours (push only)
   - Check rate limit
   - Attempt send (with retry on 5xx: max 3 attempts, exponential backoff)
   - Write `alert_deliveries` row via DB UPSERT (conflict on dedup_key → skip silently)
   - On 404/410 from push: mark subscription `revoked_at = now()`
2. Update `alerts.last_fired_at` if any channel succeeded
3. Return summary

- [ ] **Step 1:** Write dispatcher with fan-out logic
- [ ] **Step 2:** Add retry logic (3 attempts, 1s/2s/4s backoff)
- [ ] **Step 3:** Handle push subscription revocation on 404/410

---

## Task 7: Hook into scraper scheduler

**File:** `src/lib/scraper/scheduler.ts`

Add post-scrape hook after `triggerIntradayRefresh`:

```typescript
queueMicrotask(() => {
  import('@/lib/alerts/evaluator')
    .then(({ runAlertsEvaluator }) =>
      runAlertsEvaluator({ providerId: provider.id, sinceTs: new Date(Date.now() - 30 * 60_000) })
    )
    .catch(err => console.error(`[scheduler:${provider.id}] alerts evaluator failed (non-fatal):`, err))
})
```

- [ ] **Step 1:** Add the `queueMicrotask` hook after the intraday refresh call
- [ ] **Step 2:** Ensure the import is lazy (avoids circular deps)

---

## Task 8: Alerts scheduler (digest + cleanup)

**File:** `src/lib/alerts/scheduler.ts`

Two crons:
1. **Weekly digest check:** `0 * * * 0` (every hour on Sundays). For each user with active digest alerts, check if local time is 06:00–06:59 and they haven't received a digest this ISO week.
2. **Subscription cleanup:** `0 3 * * *` (3am daily). Mark subscriptions revoked where last 3 sends returned 404/410.
3. **Delivery retention:** `0 3 * * *` (combined with cleanup). Delete `alert_deliveries` older than 90 days.

**File:** `src/instrumentation.ts` — add `import('@/lib/alerts/scheduler').then(m => m.startAlertsScheduler())`

- [ ] **Step 1:** Write `scheduler.ts` with both crons
- [ ] **Step 2:** Wire into `instrumentation.ts`

---

## Task 9: API routes

**Files:** All under `src/app/api/alerts/` and `src/app/api/push/` and `src/app/api/me/`

Pattern: all routes call `getSession(req)` first; 401 if null.

### Alert CRUD

- `GET /api/alerts` — list user's alerts with last delivery summary
- `POST /api/alerts` — validate criteria (Zod), insert, return created alert
- `PATCH /api/alerts/:id` — update `paused`, `channels`, `criteria_json`, `label`
- `DELETE /api/alerts/:id` — hard-delete (cascade removes deliveries)
- `GET /api/alerts/:id/history` — last 50 deliveries for this alert
- `POST /api/alerts/:id/test` — send test delivery (rate-limited 1/hr per user)

### Token routes (no auth required — JWT validates itself)

- `GET /api/alerts/unsubscribe?token=...` — verify JWT, delete alert, return HTML "you've been unsubscribed"
- `GET /api/alerts/pause?token=...` — verify JWT, toggle paused, return HTML confirmation

### Push subscription management

- `GET /api/push/subscriptions` — list active subs for user
- `POST /api/push/subscriptions` — register `{ endpoint, keys: { p256dh, auth }, ua }`
- `DELETE /api/push/subscriptions/:id` — revoke

### Quiet hours

- `PATCH /api/me/quiet-hours` — update `timezone`, `quiet_hours_start`, `quiet_hours_end`

### Favourites

- `POST /api/me/favourites/:stationId` — add favourite
- `DELETE /api/me/favourites/:stationId` — remove favourite

- [ ] **Step 1:** Write alert CRUD routes
- [ ] **Step 2:** Write unsubscribe/pause token routes
- [ ] **Step 3:** Write push subscription routes
- [ ] **Step 4:** Write quiet hours + favourites routes

---

## Task 10: Service worker push handlers

**File:** `src/app/sw.ts`

Replace stub `push` handler with real logic:

```typescript
self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() as PushPayload
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? '/icons/fillip-192.png',
      badge: data.badge ?? '/icons/fillip-badge.png',
      tag: data.tag,
      data: { url: data.url },
    })
  )
})
```

`notificationclick` handler already focuses an existing tab or opens new one — keep existing implementation (it already uses `data.url`).

Replace stub `pushsubscriptionchange` with re-registration via `POST /api/push/subscriptions`.

- [ ] **Step 1:** Replace push event stub with showNotification call
- [ ] **Step 2:** Implement pushsubscriptionchange re-registration

---

## Task 11: AlertWizard component

**File:** `src/components/alerts/AlertWizard.tsx`

Client component for creating alerts:
- Form fields: type selector, criteria fields (dynamic by type), channel checkboxes
- On submit: if `push` channel selected, call `Notification.requestPermission()` first; on grant, call `POST /api/push/subscriptions` with subscription from `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY })`
- If permission denied: grey out push toggle, show help text
- After push subscription registered (or push not selected): call `POST /api/alerts`

- [ ] **Step 1:** Write AlertWizard form
- [ ] **Step 2:** Add push permission request flow

---

## Task 12: Tests

**Files:** all under `src/__tests__/alerts/`

### Unit tests

- `criteria.test.ts` — Zod schemas: valid shapes accepted, invalid/extra keys rejected per type
- `rateLimit.test.ts` — all 4 types, edge cases (exactly at limit, 1ms before, 1ms after)
- `quietHours.test.ts` — Brisbane (no DST), Sydney (with DST), edge cases: midnight, 07:00:00 exactly
- `dedupKey.test.ts` — pure key derivation functions per alert type

### Integration tests (with DB mock or in-memory)

- `evaluator.test.ts`:
  - Seed stations + price readings → run priceThreshold evaluator → assert delivery rows
  - Run twice same window → assert dedup (same count)
  - Paused alert → no delivery
- `cycleLow.test.ts`:
  - Seed cycle_signals row with FILL_NOW (prev was HOLD) → assert 1 delivery
  - Seed second FILL_NOW → assert still 1 delivery (dedup_key matches)
- `dispatcher.test.ts`:
  - MemoryEmailSender + MemoryWebPush → assert send called once per channel
  - Quiet hours active → push suppressed, email sent
  - 410 response from push → subscription marked revoked

### Snapshot tests

- `templates.test.ts` — render each template with fixture data, snapshot HTML + text

### Scraper isolation test

- `scraperIsolation.test.ts` — mock evaluator to throw, run scheduler scrape flow, assert scrape still returns success

- [ ] **Step 1:** Write unit tests (criteria, rateLimit, quietHours, dedupKey)
- [ ] **Step 2:** Write integration tests (evaluator, cycleLow, dispatcher)
- [ ] **Step 3:** Write snapshot tests for templates
- [ ] **Step 4:** Write scraper isolation test

---

## Task 13: Env vars + documentation

**File:** `.env.example`

Add:
```
# SP-5: Alerts
# VAPID keys — generate with: npx web-push generate-vapid-keys (ONE-TIME per environment)
VAPID_PUBLIC_KEY=your_vapid_public_key_here
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key_here
VAPID_PRIVATE_KEY=your_vapid_private_key_here
VAPID_SUBJECT=mailto:alerts@fillip.com.au

# Resend (also used by SP-2 magic link)
RESEND_API_KEY=re_your_resend_key
RESEND_FROM=alerts@fillip.com.au

# Alert feature flags (comma-separated alert types to enable; empty = all)
ALERTS_ENABLED_TYPES=price_threshold,cycle_low,favourite_drop,weekly_digest

# Weekly digest healthcheck
HEALTHCHECKS_DIGEST_PING_URL=
```

- [ ] **Step 1:** Update `.env.example` with all SP-5 vars

---

## Task 14: Spec compliance review + final verification

- [ ] Run `npm run test:run` — all existing + new tests green
- [ ] Run `npm run build` — build green
- [ ] Run `npm run lint` — no new lint errors above baseline 42
- [ ] Verify acceptance criteria 1–10 from spec §13 against implementation
- [ ] Verify evaluator failure test passes (scraper isolation)

---

## Acceptance criteria checklist (from spec §13)

- [ ] AC1: Create one alert of each type via API; bad input rejected
- [ ] AC2: Simulated price change → exactly one delivery per channel per scrape cycle
- [ ] AC3: cycle_signals transition HOLD→FILL_NOW → exactly one delivery; re-eval → zero additional
- [ ] AC4: Weekly digest sent Sunday 06:00 local-TZ, once per ISO week
- [ ] AC5: Email contains working unsubscribe + pause links (no login required)
- [ ] AC6: Push permission requested only after first push-enabled alert saved
- [ ] AC7: Quiet hours suppresses push (logged), not email
- [ ] AC8: 410 push endpoint → subscription revoked + not retried
- [ ] AC9: Evaluator failure does not break scrape pipeline
- [ ] AC10: All 4 templates have snapshot tests + pass rendering

---

## Privacy & compliance notes

- `ON DELETE CASCADE` on `alerts.user_id` and `web_push_subscriptions.user_id`
- 90-day retention on `alert_deliveries`
- Every email footer has one-click unsubscribe (≤1 click, no login) — Spam Act 2003 AU
- VAPID private key: env var only, never logged, never API-returned
- Push payload body not logged; only `payload_hash` + `dedup_key`
