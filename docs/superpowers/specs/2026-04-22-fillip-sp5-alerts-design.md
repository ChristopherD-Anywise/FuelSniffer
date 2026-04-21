# Fillip SP-5 — Alerts (D3) Design Spec

**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `2026-04-22-fillip-master-design.md` (§4 D3)
**Depends on:** SP-2 (auth + user accounts), SP-3 (PWA + service worker shell), SP-4 (cycle engine / `cycle_signals`)
**Supersedes:** none

---

## 1. Purpose & scope

SP-5 implements differentiator **D3 — Real price alerts** for Fillip. The goal: a user enters a small piece of criteria once (or favourites a station) and is reliably notified the moment the world meets that criteria. Alerts are the highest-converting "decide, don't display" surface in the product — they are the single feature most likely to make a PetrolSpy user switch.

### In scope (MVP)

- **Two channels:** Transactional **email** (Resend default) and **Web Push** (VAPID + service worker registered in SP-3).
- **Four alert types**, all in MVP:
  1. **Price threshold** — "U91 within X km of `<home>` drops below $Y"
  2. **Cycle low** — fires on `cycle_signals` transition into `FILL_NOW` for a user's home suburb + preferred fuel(s) (driven by SP-4)
  3. **Favourite station drop** — "`<station>` dropped $Z (cents/L) in the last hour"
  4. **Weekly digest** — Sunday 06:00 local-TZ email: best day to fill this week + top 3 nearby stations
- **Evaluator** that runs as a post-hook on every scraper completion (~every 15 min) for types 1 & 3, on cycle-state-transitions for type 2, and on a Sunday cron for type 4.
- **Dispatcher** with a swappable email provider interface (Resend → SES/Postmark) and `web-push` for VAPID delivery.
- **Subscription/management API** (CRUD on alerts, list/revoke push subscriptions, quiet hours, pause). UI lives in SP-3-extended (just the API contract is locked here).
- **Unsubscribe + one-click pause** links in every email.
- **Quiet hours** (per-user, default 21:00–07:00 local) — push-only; email always sends.

### Out of scope (deferred — note as future)

- SMS alerts
- In-app notification centre / inbox
- Per-user volume quotas (rate limit is system-global only for MVP)
- Alert sharing / group alerts
- Native mobile push (APNs/FCM directly — web push is the MVP delivery)
- ML-driven "smart alerts" (e.g. predicted-low forecasts — that's SP-4 Phase B)
- Multi-fuel composite criteria (single fuel per alert in MVP)

---

## 2. Data model

All tables live in `src/lib/db/schema.ts` and ship as new SQL migrations under `src/lib/db/migrations/` per project convention (no `drizzle-kit push`).

### 2.1 `alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `user_id` | `bigint NOT NULL FK users(id) ON DELETE CASCADE` | |
| `type` | `alert_type NOT NULL` | enum: `price_threshold`, `cycle_low`, `favourite_drop`, `weekly_digest` |
| `criteria_json` | `jsonb NOT NULL` | shape varies by `type` (see §2.5) |
| `channels` | `text[] NOT NULL` | subset of `{'email','push'}` — `CHECK (cardinality(channels) >= 1)` |
| `paused` | `boolean NOT NULL DEFAULT false` | one-click pause toggle |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `last_fired_at` | `timestamptz` | nullable; rate-limit anchor |
| `last_evaluated_at` | `timestamptz` | for observability |
| `label` | `text` | optional user-friendly nickname |

Indexes:
- `(user_id)`, `(type) WHERE paused = false`, `(user_id, type)`.

### 2.2 `alert_deliveries`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `alert_id` | `bigint NOT NULL FK alerts(id) ON DELETE CASCADE` | |
| `fired_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `channel` | `text NOT NULL` | `'email'` or `'push'` |
| `payload_hash` | `text NOT NULL` | sha256 of canonical payload — for dedup-by-content |
| `dedup_key` | `text NOT NULL` | semantic key (see §6) |
| `status` | `delivery_status NOT NULL` | `queued`, `sent`, `delivered`, `failed`, `suppressed_quiet_hours`, `suppressed_rate_limit`, `bounced` |
| `provider_message_id` | `text` | Resend / web-push response id |
| `error` | `text` | failure reason |
| `retry_count` | `int NOT NULL DEFAULT 0` | |

Indexes:
- `(alert_id, fired_at DESC)`, **`UNIQUE (alert_id, channel, dedup_key)`** — primary dedup gate.

### 2.3 `web_push_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `user_id` | `bigint NOT NULL FK users(id) ON DELETE CASCADE` | |
| `endpoint` | `text NOT NULL UNIQUE` | from `PushSubscription` |
| `keys_p256dh` | `text NOT NULL` | |
| `keys_auth` | `text NOT NULL` | |
| `ua` | `text` | user-agent at registration (debug only) |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `last_seen_at` | `timestamptz NOT NULL DEFAULT now()` | bumped on successful send |
| `revoked_at` | `timestamptz` | set when 404/410 from push service or user revokes |

Indexes: `(user_id) WHERE revoked_at IS NULL`.

### 2.4 Touch-points on existing tables

- **`users`** — add `quiet_hours_start TIME DEFAULT '21:00'`, `quiet_hours_end TIME DEFAULT '07:00'`, `timezone text DEFAULT 'Australia/Brisbane'` (already implied by SP-2; add here if not present).
- **`favourite_stations`** (from SP-2) — referenced by `favourite_drop` alert type.
- **`cycle_signals`** (from SP-4) — read by the evaluator for `cycle_low`; the evaluator listens for the **transition** into `FILL_NOW`, not the steady state.

### 2.5 `criteria_json` shapes

```jsonc
// price_threshold
{ "fuel_type_id": 2, "centre": {"lat": -27.43, "lng": 153.04}, "radius_km": 5, "max_price_cents": 174.9 }

// cycle_low
{ "suburb_id": 12345, "fuel_type_id": 2 }   // suburb defaults to user's home

// favourite_drop
{ "station_id": 9876, "fuel_type_id": 2, "min_drop_cents": 5, "window_minutes": 60 }

// weekly_digest
{ "centre": {"lat": -27.43, "lng": 153.04}, "radius_km": 10, "fuel_type_id": 2 }
```

Validated with Zod schemas in `src/lib/alerts/criteria.ts`. The API rejects unknown keys.

---

## 3. Architecture overview

```
                ┌────────────────────────────────────────┐
                │  src/instrumentation.ts                 │
                │  startScheduler()                       │
                └────────────┬────────────────────────────┘
                             │ registers
              ┌──────────────┼─────────────────────────────┐
              ▼              ▼                             ▼
   ┌────────────────┐  ┌────────────────┐      ┌──────────────────┐
   │ scraper cron   │  │ weekly digest  │      │ subscription     │
   │ (15 min)       │  │ cron (Sun 06:00)│      │ cleanup cron     │
   └───────┬────────┘  └───────┬────────┘      │ (nightly)        │
           │                   │               └─────────┬────────┘
           ▼                   ▼                         │
   ┌────────────────┐  ┌────────────────┐                │
   │ runProvider-   │  │ digest         │                │
   │ Scrape() →     │  │ evaluator      │                │
   │ post-hook      │  └───────┬────────┘                │
   │ runAlerts-     │          │                         │
   │ Evaluator()    │          │                         │
   └───────┬────────┘          │                         │
           ▼                   ▼                         ▼
   ┌────────────────────────────────────────────────────────┐
   │  src/lib/alerts/evaluator/  (per-type modules)         │
   │   ├ priceThreshold.ts                                  │
   │   ├ favouriteDrop.ts                                   │
   │   ├ cycleLow.ts            (subscriber on signal trans.)│
   │   └ weeklyDigest.ts                                    │
   └─────────────────────┬──────────────────────────────────┘
                         ▼  (Delivery[] candidates)
   ┌────────────────────────────────────────────────────────┐
   │  src/lib/alerts/dispatcher/                            │
   │   ├ rateLimit.ts  (per-alert min interval, dedup key)  │
   │   ├ quietHours.ts (push-only suppression)              │
   │   ├ email/  index.ts (interface) + resend.ts (impl)    │
   │   ├ push/   index.ts (web-push wrapper)                │
   │   └ templates/ (mjml/react-email + push payloads)      │
   └─────────────────────┬──────────────────────────────────┘
                         ▼
              ┌──────────────────────┐
              │  alert_deliveries    │  ← single source of truth for what shipped
              └──────────────────────┘
```

### 3.1 Hook into the scraper

`runProviderScrape()` (in `src/lib/scraper/writer.ts`) returns a `ScrapeResult`. SP-5 adds a **post-hook** invoked from the scheduler — *not* from inside `runProviderScrape` — so a slow/failing alerts path can never block or fail a scrape. The scheduler:

```
for provider in providers:
  result = await runProviderScrape(provider)
  if result.error == null and result.pricesUpserted > 0:
    queueMicrotask(() => runAlertsEvaluator({ provider: provider.id, since: lastEvalAt }))
```

The evaluator reads only `price_readings` rows newer than `last_evaluated_at` (or last 30 min as a safety floor). It never re-evaluates the entire table.

### 3.2 Cycle-low transition listener

`cycle_low` is **edge-triggered**, not level-triggered. SP-4 writes/updates `cycle_signals(suburb_id, fuel_type_id, signal, computed_at, prev_signal)`. The evaluator queries:

```
SELECT * FROM cycle_signals
WHERE signal = 'FILL_NOW'
  AND prev_signal != 'FILL_NOW'
  AND computed_at > $last_eval_at
```

This guarantees one fire per transition, even if SP-4 recomputes signals multiple times per day. The dedup key (`cycle:{suburb}:{fuel}:{yyyy-mm-dd}`) is the belt-and-braces backstop.

### 3.3 Weekly digest cron

A separate `node-cron` job inside `src/lib/alerts/scheduler.ts`, also bootstrapped from `instrumentation.ts`. Schedule: `0 6 * * 0` evaluated **per timezone** — easiest impl: cron fires every hour Sun-only, then for each user check if their local-TZ time is between 06:00–06:59 and they haven't received a digest this week.

### 3.4 Subscription cleanup cron

Nightly job: any `web_push_subscriptions` row whose last 3 send attempts returned `404` / `410` is marked `revoked_at = now()`. Prevents the dispatcher from wasting requests on dead endpoints.

---

## 4. Evaluator details (per type)

### 4.1 Price threshold

Inputs: new `price_readings` since last eval; all active `price_threshold` alerts.

Algorithm (per alert):
1. Find stations within `radius_km` of `centre` (PostGIS `ST_DWithin`, or great-circle if PostGIS isn't enabled — the existing `dashboard-utils.ts` distance helper is fine for MVP).
2. For each in-radius station, fetch the latest reading for `fuel_type_id` from the new-readings batch.
3. If `latest.price_cents <= criteria.max_price_cents`, queue a delivery with `dedup_key = 'pt:{alert_id}:{station_id}:{date}'` (one fire per alert/station/day).

### 4.2 Favourite station drop

Inputs: new readings for stations in any user's `favourite_stations` join.

Per alert (each alert references one station/fuel):
1. Fetch latest reading + reading from `now() - window_minutes`.
2. Compute `drop = older - latest`. If `drop >= min_drop_cents`, fire.
3. Dedup key: `fd:{alert_id}:{date}:{floor(now/4h)}` — at most one per 4h window.

### 4.3 Cycle low

See §3.2. Dedup: `cycle:{suburb_id}:{fuel_type_id}:{yyyy-mm-dd}`. Body includes the cheapest 3 stations in the user's home suburb (computed at fire-time).

### 4.4 Weekly digest

Inputs: per user with at least one digest alert active.
Computed at fire-time:
- "Best day to fill this week" — derived from the last 4 weeks' median day-of-week price for the user's suburb+fuel (data already in `price_readings_daily` materialised view).
- Top 3 cheapest stations within `radius_km` *right now* for `fuel_type_id`.
- "Verdict" chip from SP-4 (`cycle_signals`) for the user's suburb.

Dedup key: `digest:{alert_id}:{iso_year}-W{iso_week}`.

---

## 5. Dispatcher

### 5.1 Email

Interface (`src/lib/alerts/dispatcher/email/index.ts`):

```
interface EmailProvider {
  send(opts: { to, from, subject, html, text, replyTo?, headers?, tags? }): Promise<{ id: string }>
}
```

**Default implementation:** `resend.ts` using `resend` npm package. `RESEND_API_KEY` + `RESEND_FROM` env vars. From-domain matches Fillip sender domain (DKIM/SPF/DMARC must be live before launch).

**Swap path:** SES (`@aws-sdk/client-sesv2`) and Postmark are the recommended fallbacks — both have minimal API surface that maps cleanly onto the interface. No code outside `dispatcher/email/` should import the provider directly.

### 5.2 Web Push

Library: **`web-push`** (npm). VAPID keys generated once and stored in env:
- `VAPID_PUBLIC_KEY` (also exposed to the client via `NEXT_PUBLIC_VAPID_PUBLIC_KEY`)
- `VAPID_PRIVATE_KEY` (server-only)
- `VAPID_SUBJECT` (e.g. `mailto:alerts@fillip.com.au`)

These throw at module load if missing, matching the project convention in CLAUDE.md.

Send flow per subscription:
1. Build payload (see §6).
2. `webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60*60*4 })`.
3. On success → write `alert_deliveries` row, `last_seen_at = now()`.
4. On `404` / `410` → mark subscription `revoked_at`.
5. On `429` / `5xx` → exponential backoff, max 3 retries, then `status='failed'`.

The service worker (registered in SP-3) handles the `push` event and calls `self.registration.showNotification(title, options)` with the payload. Click handler navigates to the deep link in `payload.url` (focusing an existing tab if open).

---

## 6. Templating, payload & dedup

### 6.1 Email templates

- **Engine:** `react-email` (chosen for type-safety + JSX components matching the rest of the stack). Templates live in `src/lib/alerts/dispatcher/templates/email/`.
- **Variants:** one HTML + one plain-text per alert type. Plain-text is auto-derived where possible, hand-tuned for digest.
- **Common footer block** with: per-alert one-click pause link, unsubscribe-from-this-alert link, account preferences link, physical sender address (CAN-SPAM / Spam Act 2003 AU compliance).
- **Subject lines** must be benefit-led and ≤ 50 chars (e.g. `"U91 just hit $1.74 near you"`).

### 6.2 Web push payload

```json
{
  "title": "U91 — $1.74 at Shell Chermside",
  "body": "Down 12¢ from yesterday. 2.3 km from home.",
  "url": "/dashboard/station/9876?utm_source=push",
  "icon": "/icons/fillip-192.png",
  "badge": "/icons/fillip-badge.png",
  "tag": "fillip:pt:42:9876"
}
```

`tag` is the dedup key from §6.3 — the browser collapses notifications with the same tag, so a re-fire updates rather than stacks.

### 6.3 Rate limit & dedup

Two layers:

1. **`UNIQUE (alert_id, channel, dedup_key)`** in `alert_deliveries` — prevents identical deliveries even under race conditions.
2. **Per-alert minimum interval**, enforced in `rateLimit.ts`:

| Type | Min interval |
|---|---|
| `price_threshold` | 4 h |
| `favourite_drop` | 4 h |
| `cycle_low` | 24 h (and edge-trigger above) |
| `weekly_digest` | 7 d (one per ISO week) |

The interval is checked against `alerts.last_fired_at` *before* the dedup-key check; a suppressed delivery still gets logged with `status='suppressed_rate_limit'` for observability.

### 6.4 Quiet hours

Stored on `users` (TZ-aware). Applied **only to the push channel** — emails sit in the user's inbox harmlessly. If a push delivery falls inside quiet hours, the dispatcher writes `status='suppressed_quiet_hours'` and **does not retry on exit** (avoiding 7am push-storms). Threshold-style alerts will simply re-evaluate on the next scrape after 07:00.

---

## 7. Subscription management API

UI lives in SP-3-extended. SP-5 ships these endpoints under `src/app/api/alerts/`:

| Method + path | Purpose |
|---|---|
| `GET /api/alerts` | list current user's alerts |
| `POST /api/alerts` | create (validates `criteria_json` per type) |
| `PATCH /api/alerts/:id` | update criteria/channels/paused/label |
| `DELETE /api/alerts/:id` | hard-delete |
| `POST /api/alerts/:id/test` | send a one-off test delivery (dev/QA only; rate-limited 1/hr) |
| `GET /api/alerts/:id/history` | last 50 `alert_deliveries` for this alert |
| `GET /api/push/subscriptions` | list active push subs for current user |
| `POST /api/push/subscriptions` | register new sub (called by SW after `pushManager.subscribe`) |
| `DELETE /api/push/subscriptions/:id` | revoke a sub |
| `PATCH /api/me/quiet-hours` | update `quiet_hours_start`/`end`/`timezone` |
| `GET /api/alerts/unsubscribe?token=…` | one-click unsubscribe (signed JWT, no auth required) |
| `GET /api/alerts/pause?token=…` | one-click pause toggle (signed JWT) |

All routes (except the two token-signed ones) sit behind the existing JWT-session middleware (`src/middleware.ts`). The signed-link tokens use the existing `jose` helper with a 30-day expiry and an `aud` of `alert-mgmt`.

---

## 8. Permission flow for web push

We do **not** prompt for browser-push permission on first visit (low conversion + erodes trust). Instead:

1. User signs up + logs in (SP-2).
2. User creates their first alert via the dashboard.
3. If they ticked the `push` channel, *only then* does the UI call `Notification.requestPermission()` and on grant register the subscription via `POST /api/push/subscriptions`.
4. If they untick `push` for all alerts, we keep the subscription but stop sending until re-enabled — we do not auto-unsubscribe at the browser level (the cost of re-prompting is too high).

If permission is denied, the UI greys out the push channel toggle and shows a help link explaining how to re-enable in browser settings.

---

## 9. Test strategy

All tests live under `src/__tests__/alerts/` per project convention (Vitest).

### 9.1 Unit

- **Criteria validation** — Zod schemas accept good shapes, reject malformed/extra keys.
- **Rate limiter** — given last-fired-at + clock, returns expected suppress/allow.
- **Dedup-key derivation** — pure-function tests per alert type.
- **Quiet-hours predicate** — TZ-aware (Brisbane no DST, Sydney with DST, edge cases at midnight).

### 9.2 Integration (Postgres testcontainer or `pg-mem`)

- **Synthetic price changes** — seed stations + readings, run evaluator, assert `alert_deliveries` rows.
- **Cycle transition** — seed `cycle_signals` rows (`HOLD → FILL_NOW`), assert exactly one `cycle_low` delivery.
- **Idempotency** — run the evaluator twice over the same window, assert `alert_deliveries` count unchanged (UNIQUE constraint catches duplicates).
- **Push subscription cleanup** — feed mock 410 responses, assert `revoked_at` set after threshold.

### 9.3 Snapshot tests

- Each email template rendered against a fixed fixture, snapshot of HTML + text.
- Each push payload object snapshotted.

### 9.4 Mocked dispatchers

`EmailProvider` and `WebPushProvider` interfaces are stubbed in tests. The real providers are exercised only in a manual smoke-test script `scripts/alerts-smoke.ts` (gated behind a `RUN_LIVE=1` env var) that sends a single email + push to a configured test inbox / browser.

### 9.5 Load sanity

A one-off bench script that fakes 10k active alerts + a 5k-station scrape result and asserts evaluator wall-time < 5 s on the dev box. Not in CI; we just want a known-good baseline before national rollout (SP-1).

---

## 10. Privacy & compliance

- **PII stored:** email address (already in `users`), home lat/lng (in `user_settings`), push endpoint (opaque, but identifies the device). Nothing else.
- **VAPID private key:** secret env var, never logged, never returned by any API. Rotation procedure documented in `docs/runbooks/vapid-rotation.md` (out-of-scope artifact, mentioned for the SP-5 plan).
- **GDPR / Privacy Act 1988 (Cth) — APP 1, 5, 6, 11, 12:**
  - **Notice:** privacy policy updated to declare alert deliveries, retention, and provider sub-processors (Resend, push providers).
  - **Access & correction (APP 12 / GDPR Art 15-16):** existing account data export endpoint includes `alerts` and `alert_deliveries` filtered to the user.
  - **Erasure (GDPR Art 17):** `ON DELETE CASCADE` on both `alerts.user_id` and `web_push_subscriptions.user_id` ensures deletion of the user wipes all alert data. `alert_deliveries` is deleted via the alert cascade.
  - **Retention:** `alert_deliveries` rows older than 90 days are pruned by a nightly job (audit window long enough for "did I get the alert?" support, short enough to minimise PII footprint).
- **Spam Act 2003 (Cth):** every email contains a functional unsubscribe link reachable in ≤ 1 click and processable without login. Sender identification block in the footer.
- **Sub-processors:** Resend (US) for email, push services (Mozilla, Google, Apple) for push transport. Disclose in privacy policy.
- **Logging hygiene:** payload bodies and email HTML are **not** logged; only `payload_hash` + `dedup_key` + `provider_message_id`. Errors are logged with the message id but no body.

---

## 11. Operational concerns

- **Failure isolation:** evaluator/dispatcher failures must never break the scrape pipeline. The post-hook is invoked off the scrape's critical path (microtask) and wrapped in try/catch with structured error logs.
- **Observability:** add to `scrape_health` (or a sibling `alerts_health`) a per-run summary: `evaluator_ms`, `candidates`, `sent`, `suppressed_rate_limit`, `suppressed_quiet_hours`, `failed`. Emit healthchecks.io ping on weekly digest cron success (separate `HEALTHCHECKS_DIGEST_PING_URL`).
- **Backpressure:** if a single evaluator run produces > 5000 candidate deliveries (sanity ceiling), log a WARN, dispatch them in chunks of 200, and never exceed 100 outbound emails/sec to Resend (their free-tier ceiling — paid tier is higher).
- **Migration safety:** all 4 alert types ship behind a feature flag (`ALERTS_ENABLED_TYPES`) so a misbehaving type can be killed without a redeploy.

---

## 12. Open questions (with recommended defaults)

| # | Question | Recommended default | Status |
|---|---|---|---|
| Q1 | Email provider — Resend vs SES vs Postmark? | **Resend** for MVP (best DX, generous free tier, AU sender support). Behind interface so swap is cheap. | **Decision pending** (cdenn) |
| Q2 | Push library — `web-push` vs hosted (OneSignal)? | **`web-push`** self-host. Hosted services lock us into their UI/data. | **Decision pending** |
| Q3 | Email engine — `react-email` vs MJML vs raw? | **`react-email`** — JSX matches the rest of the stack; renders to inline-styled HTML. | Recommended; awaiting confirm |
| Q4 | Rate-limit window for `price_threshold` / `favourite_drop` | **4 h** | Recommended |
| Q5 | Default quiet hours | **21:00–07:00 local** | Recommended |
| Q6 | When to ask for push permission | **Only after first alert with `push` channel created** | Recommended |
| Q7 | `alert_deliveries` retention | **90 days** | Recommended |
| Q8 | Weekly digest day/time | **Sunday 06:00 local** | Per master spec |
| Q9 | Distance helper — keep great-circle JS or enable PostGIS? | **PostGIS** if national rollout (SP-1) goes first; else JS helper is fine for MVP | **Decision pending** — coordinate with SP-1 |
| Q10 | Should `cycle_low` push respect quiet hours? | **Yes** (consistent with §6.4); email always sends | Recommended |
| Q11 | Per-user alert volume cap? | **No cap MVP**, system-wide rate limit only. Revisit if abuse seen. | Future |
| Q12 | One-click unsubscribe — per-alert or master kill? | **Per-alert** (pauses); master-kill via account settings | Recommended |

---

## 13. Acceptance criteria (for the implementation plan to verify)

1. A user can create one alert of each of the 4 types via the API; criteria validation rejects bad input.
2. A simulated price change crossing a `price_threshold` produces exactly one delivery per channel within one scrape cycle.
3. A simulated `cycle_signals` transition into `FILL_NOW` produces exactly one `cycle_low` delivery, and a re-eval produces zero additional deliveries.
4. A weekly digest email is sent on Sunday at 06:00 user-local-TZ, and only once per ISO week.
5. Email contains working unsubscribe + pause links that function without login.
6. Web push permission is requested only after the user's first push-enabled alert is saved.
7. Quiet hours suppress push deliveries (logged as `suppressed_quiet_hours`) but not email.
8. Revoked / expired push subscriptions are cleaned up automatically and not retried.
9. Evaluator failure does not break the scrape pipeline (verified by injecting a thrown error).
10. All four templates have snapshot tests and pass `react-email` rendering.

---

*End of SP-5 design.*
