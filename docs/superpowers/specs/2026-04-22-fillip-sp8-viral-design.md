# Fillip — SP-8 Sub-Project Design Spec

**Sub-project:** SP-8 Viral Hooks (Share-a-Fill Card + Weekly Cheapest-Postcode Bot)
**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `docs/superpowers/specs/2026-04-22-fillip-master-design.md` (§4 D5 viral hooks)
**Depends on:** SP-0 (brand), SP-3 (design tokens), SP-1 (national data)
**Blocks:** none — last MVP sub-project

---

## 1. Purpose

Two narrowly scoped, low-cost growth mechanics that exploit fuel-price content's
inherent shareability:

- **Part A — Share-a-Fill card:** when a user finds a great price (or confirms a
  fill), one tap produces a branded social-card image that says *"I paid $1.74 at
  Shell Chermside — cheapest in 5 km. Fillip"*. The image is shareable to any
  network and embeds correctly as an OG preview when the deep-link is pasted.
- **Part B — Weekly cheapest-postcode bot:** every Monday 07:00 AEST, an autonomous
  process posts to X / BlueSky / Mastodon: *"Cheapest U91 postcode in AU last week:
  4000 (Brisbane CBD) at $1.74 avg. fillip.com.au"* with a small image (re-using
  the share-card renderer) and a deep link.

Both surfaces double as **earned-media flywheels** (each share = a free impression)
and **brand reinforcement** (every render carries the Fillip logo, palette, and a
recognisable card silhouette).

Success looks like: shares per WAU > 0.05/wk by month 3; weekly bot post earns
≥ 100 impressions/network by month 3; ≥ 5 % click-through from share-card link
previews.

---

## 2. Scope

### In scope

- Server-rendered OG image route (PNG + OG meta) for Share-a-Fill
- Web Share API integration on station-card "Share" button + post-fill confirm flow
- Signed, cacheable image URLs
- DB cache index (`share_card_renders`) and CDN cache headers
- Weekly cron job composing + posting to social networks
- Per-network adapter abstraction (one file each for X, BlueSky, Mastodon)
- Editorial guard hook (designed in, off-by-default for MVP)
- UTM-tagged deep links + minimal share/click analytics
- Golden-image renderer tests; mocked-adapter unit tests; cron job tests
- Privacy guarantee: no user identifiers ever in cards or posts

### Out of scope (MVP, deferable)

- In-app share-card editor / customiser
- Per-user share history page
- Native mobile share sheets beyond the Web Share API
- Referral attribution / reward system (master §4 D5 explicitly defers this)
- Suburb leaderboard SEO pages
- Instagram (no straightforward auto-post API; requires Graph API + Business
  account — flag as Phase 2)
- TikTok / FB / WhatsApp auto-posting
- Multi-language captions; English-AU only

---

## 3. Architecture overview

```
                         ┌────────────────────────────────┐
                         │ User taps Share on station card│
                         └──────────────┬─────────────────┘
                                        ▼
                  ┌────────────────────────────────────────┐
              A   │ /share/s/:hash  page (deep link target)│
                  │   ├── <head> OG meta → /api/og/fill?…  │
                  │   ├── Web Share API call (PNG blob)    │
                  │   └── Fallback: copy link UI           │
                  └──────────────┬─────────────────────────┘
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │ /api/og/fill (Edge runtime, signed params)       │
        │   1. verify HMAC sig                             │
        │   2. lookup or insert share_card_renders by hash │
        │   3. Satori → SVG → ResVG → PNG                  │
        │   4. respond image/png + Cache-Control immutable │
        └──────────────────────────────────────────────────┘

                   ──────────  Part B (bot)  ──────────

  Mon 07:00 AEST                       composer
  ┌──────────┐   ┌────────────────┐    ┌──────────────────┐
  │ scheduler│──▶│ weekly query   │──▶ │ build social_post│
  │ (cron)   │   │ (cheapest      │    │ record + image   │
  └──────────┘   │  postcode last │    │ via share render │
                 │  7 d, per fuel)│    └────────┬─────────┘
                 └────────────────┘             ▼
                                       ┌──────────────────┐
                                       │ editorial guard? │
                                       │ (off in MVP)     │
                                       └────────┬─────────┘
                                                ▼
                              ┌─────────────────────────────────┐
                              │ network adapters (parallel)     │
                              │   x.ts │ bluesky.ts │ masto.ts  │
                              └────────────────┬────────────────┘
                                               ▼
                                  social_posts row updated
                                  (status, response_json)
```

---

## 4. Data model

Two new tables in `src/lib/db/schema.ts` and a Drizzle SQL migration in
`src/lib/db/migrations/`.

### 4.1 `share_card_renders`

Cache index — actual PNG bytes live in CDN/storage, this table is the lookup
plus an audit trail.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `hash` | `text` UNIQUE NOT NULL | sha256 of normalised input tuple (see §6.3) |
| `station_id` | `bigint` FK → `stations.id` | NOT NULL |
| `fuel_type_id` | `int` NOT NULL | |
| `price_cents` | `int` NOT NULL | snapshot of the price at render time |
| `radius_km` | `int` NULL | "cheapest in X km" claim, NULL if not used |
| `variant` | `text` NOT NULL DEFAULT `'default'` | room for future card layouts |
| `generated_at` | `timestamptz` NOT NULL DEFAULT now() | |
| `last_served_at`| `timestamptz` NOT NULL DEFAULT now() | bumped on every cache hit |
| `served_count` | `int` NOT NULL DEFAULT 1 | popularity signal |

Index: `(hash)` unique. Index: `(station_id, generated_at desc)` for admin
exploration.

No PII. No user FK. The hash is content-addressed, so two users sharing the
same station+price collapse to one row.

### 4.2 `social_posts`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `network` | `text` NOT NULL | `'x' \| 'bluesky' \| 'mastodon'` |
| `kind` | `text` NOT NULL | `'weekly_cheapest_postcode'` for now |
| `composed_at` | `timestamptz` NOT NULL | when the composer produced the record |
| `posted_at` | `timestamptz` NULL | NULL until adapter succeeds |
| `content_text` | `text` NOT NULL | exact body sent (network-specific length already trimmed) |
| `content_image_url` | `text` NULL | absolute URL of the image shown |
| `deep_link` | `text` NOT NULL | UTM-tagged URL embedded in the post |
| `status` | `text` NOT NULL | `'pending' \| 'approved' \| 'posted' \| 'failed' \| 'cancelled'` |
| `response_json` | `jsonb` NULL | raw network response for audit / debugging |
| `error_text` | `text` NULL | last failure reason |
| `dry_run` | `boolean` NOT NULL DEFAULT false | true when posting to test account |

Indexes: `(network, posted_at desc)`, `(status, composed_at)`.

### 4.3 No new user-facing tables

No `share_events`, no per-user counts. We track aggregate share/click counts
through UTM analytics (§9), not in-DB.

---

## 5. Renderer architecture

### 5.1 Stack: Satori + ResVG (recommended)

- **Satori** (Vercel) takes JSX-shaped layout → SVG. ~50 ms cold, ~5 ms warm.
- **@resvg/resvg-js** rasterises SVG → PNG. Small WASM, runs anywhere.
- Both work in Node and (with WASM bindings) Edge runtime.

**Why not Puppeteer:** ~250 MB Chromium image, 1-2 s cold-start, painful in
Docker, painful at the edge. We do not need full HTML/CSS — Satori covers our
needs.

**Why not a CDN service (Bannerbear, Placid):** vendor lock-in, $/render at
scale, latency. We can self-host the entire pipeline in < 5 MB of dependencies.

### 5.2 Runtime: Edge for `/api/og/fill`, Node for the bot

- The image route runs at the **Edge runtime**. Next.js 16 supports Satori +
  ResVG (WASM build) at the edge. This gives geo-distributed rendering with
  cold starts measured in tens of ms.
- The weekly-bot composer runs in **Node** (it lives next to the scheduler in
  `src/instrumentation.ts`, which is explicitly Node-only — see file header).
  The composer calls Satori/ResVG via the Node build. Same JSX layout module
  works for both runtimes — only the rasteriser import differs.

A small layout module `src/lib/share/layout.tsx` exports a pure JSX function;
`src/lib/share/render-edge.ts` and `src/lib/share/render-node.ts` are thin
adapters that wire up the right Satori + ResVG bindings.

### 5.3 Card content + brand

Per master spec §4 D5 + SP-0 brand + SP-3 tokens:

```
┌───────────────────────────────────────────────────────────────┐
│  [Fillip wordmark + pump icon]                       v1       │
│                                                               │
│   I paid                                                      │
│   $1.74                  ← display price, hero treatment      │
│   /L for U91                                                  │
│                                                               │
│   at Shell Chermside                                          │
│   Cheapest within 5 km                                        │
│                                                               │
│  ───────────────────────────────────────────────────────────  │
│  fillip.com.au · know before you fill                         │
└───────────────────────────────────────────────────────────────┘
```

- 1200 × 630 px (canonical OG dimensions; also fine for X large image cards
  and BlueSky/Mastodon previews).
- Background uses Fillip primary; price uses Fillip accent.
- Station logo placeholder slot (top-right) — for MVP show only the brand
  string ("Shell"); real per-brand logos require a curated asset library
  (deferred — flagged in §13).
- Pump icon + Fillip wordmark drawn from SP-3 SVG asset set.
- Fonts: bundle two weights of the SP-0 brand sans (Inter or chosen alt) as
  TTF/WOFF inside the renderer. Satori needs raw font bytes.

### 5.4 Cache strategy

- **HTTP**: `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`
  — 1 h fresh + 1 d stale-while-revalidate. Prices move; we don't want to lock
  in a wrong number for a day.
- **CDN**: rely on Cloudflare (the cloudflared tunnel sits in front already);
  the URL itself encodes the hash so a price change naturally produces a new
  URL with no cache busting needed.
- **DB**: `share_card_renders` row is the canonical "we have rendered this
  before" check. On cache hit we may still re-render (cheap) but we bump
  `served_count` and `last_served_at` for analytics.
- **Storage**: PNG bytes are NOT stored in DB or on disk in MVP — the route
  always re-renders. Re-render is ~80 ms; the expensive thing is the CDN edge
  cache, which absorbs all repeat traffic. (If render p99 ever exceeds 250 ms
  we add R2/S3 PNG storage keyed by hash.)

---

## 6. OG image route: `/api/og/fill`

### 6.1 Signed query params

```
/api/og/fill?s=<station_id>&f=<fuel_type_id>&p=<price_cents>&r=<radius_km?>&v=<variant?>&sig=<hmac>
```

Why signed: prevents rando from generating arbitrary "I paid $0.01 at Coles
Express" cards and pasting them into Twitter. Server signs only when the
share button is pressed for a real, currently-displayed price.

- HMAC-SHA256 over the canonical query string with `SHARE_SIGNING_SECRET`
  (new env var; rotation = double-sign window of 7 days, see §10.4).
- `sig` is base64url, 16 bytes (truncated — collision risk is irrelevant
  here, signing is for abuse not authenticity).
- Edge route returns 400 on bad/missing sig.

### 6.2 Hash computation (cache key)

```
hash = sha256(`${station_id}|${fuel_type_id}|${price_cents}|${radius_km ?? ''}|${variant}`)
```

The hash excludes `sig` (signatures rotate; cards do not).

### 6.3 Response

`image/png`, ~30-80 KB typical. ETag = hash. 200 always (unless sig fails →
400, or station id unknown → 404).

### 6.4 Companion page `/share/s/:hash`

This is the deep-link target — the URL that gets pasted into chats/tweets.

- Server-rendered minimal page with:
  - `<meta property="og:image">` → `/api/og/fill?…`
  - `<meta name="twitter:card" content="summary_large_image">`
  - `<title>` and `<meta name="description">` with the same price claim
  - Body: a station summary + CTA "Open in Fillip" linking to `/dashboard?station=...`
- Page also primes the cache: GET hits `share_card_renders` and bumps the
  served_count.

---

## 7. Web Share API integration (client)

Trigger surfaces:
- Share button on every station card / popup (always visible)
- Post-fill confirmation modal (a "Share this win" CTA)

Behaviour:

1. Client calls `POST /api/share/sign` with `{station_id, fuel_type_id, price_cents, radius_km?}`. Server returns the signed URL + the deep-link URL.
2. If `navigator.share` is available **and** `navigator.canShare({ files: [pngBlob] })`, fetch the PNG, call `navigator.share({ title, text, url, files: [pngBlob] })`.
3. If `navigator.share` is available without files, share `{ title, text, url }` only — the recipient's app will fetch the OG preview.
4. Fallback: copy `url` to clipboard, show a toast "Link copied — paste anywhere".
5. All paths fire a client-side analytics event `share.attempted` with `{network: 'native'|'clipboard', station_id}` (no user id).

Web Share API is not available on desktop Firefox or some embedded browsers —
clipboard fallback is the universal escape hatch.

---

## 8. Bot infrastructure (Part B)

### 8.1 Where the cron lives

**Recommendation: keep it in `src/instrumentation.ts`** alongside the existing
scraper scheduler.

| Option | Pro | Con |
|---|---|---|
| `instrumentation.ts` (recommended) | one process, one deploy, env vars already wired, `node-cron` already imported | cron ties to app uptime — but the app runs 24/7 by design |
| Vercel Cron | external, decoupled | we are not on Vercel; self-hosted Docker stack |
| External scheduler (GitHub Action, systemd timer) | no app-uptime dependency | duplicates infra; needs DB credentials in another place |

We pick the in-app cron because it matches existing convention (`scheduler.ts`)
and the app's uptime is already required for the scraper to function.

A new module `src/lib/social-bot/scheduler.ts` exports `startBotScheduler()`,
called from `instrumentation.ts` next to `startScheduler()`. Schedule expression:
`0 7 * * 1` with timezone `Australia/Brisbane` (node-cron supports tz option).

### 8.2 Composer

`src/lib/social-bot/composer.ts`:

1. Query last 7 days of `price_readings_daily` grouped by postcode + fuel type;
   compute mean `price_cents` per group; rank ascending.
2. Default content (per master spec D5): **AU-wide top-1 per fuel type**.
   Pick the headline fuel = U91. Optional thread: top 1 per state for U91
   only (one extra post per state, max 8). For MVP ship **headline-only**;
   thread is a flag we leave wired but disabled.
3. Build content text per network (length budgets: X 280, BlueSky 300,
   Mastodon 500). Include UTM-tagged deep link.
4. Render image via the share-card renderer with `variant='weekly_postcode'`.
5. Insert `social_posts` row with `status='approved'` (or `'pending'` if
   editorial guard is enabled — see §8.5).

### 8.3 Network adapters

Each network gets a thin adapter implementing `SocialAdapter`:

```
interface SocialAdapter {
  network: 'x' | 'bluesky' | 'mastodon';
  post(p: { text: string; imageUrl: string }): Promise<{ id: string; raw: unknown }>;
}
```

| Network | Lib | Auth | Notes |
|---|---|---|---|
| **X (Twitter)** | `twitter-api-v2` | OAuth 2.0 user context, refresh token in env | API v2 free tier allows 500 posts/mo — way over our needs (4 posts/mo). Image upload via v1.1 media endpoint still required (the "v2 + v1.1" hybrid is documented). |
| **BlueSky** | `@atproto/api` | App password (handle + app-specific password), stored in env | Simplest auth of the three; no OAuth dance. Image upload + post in one transaction. |
| **Mastodon** | plain `fetch` | Bearer token (created once via Mastodon UI) | Pick a server we host on (recommendation: `aus.social`). Token is long-lived; rotation is manual. |

Adapter behaviour:
- 30 s timeout per call.
- On error, write `error_text` + `status='failed'` to the row, do not retry
  inline. A separate manual `npm run social:retry <post_id>` script handles
  re-posting (avoids accidental double-posts).
- On success, write `posted_at`, `response_json.id`, `status='posted'`.

Adapters run in parallel via `Promise.allSettled` so one network failing
doesn't block the others.

### 8.4 Auth tokens + rotation

New env vars (added to `.env.example`, `docker-compose.yml`, and the runtime
config validator that throws on missing values per project conventions):

```
SOCIAL_X_OAUTH_CLIENT_ID
SOCIAL_X_OAUTH_CLIENT_SECRET
SOCIAL_X_REFRESH_TOKEN
SOCIAL_BLUESKY_HANDLE
SOCIAL_BLUESKY_APP_PASSWORD
SOCIAL_MASTODON_INSTANCE_URL
SOCIAL_MASTODON_ACCESS_TOKEN
SHARE_SIGNING_SECRET
```

Bot only fails the network whose env vars are missing — it does not crash the
app. Missing values are logged at startup with `[social-bot] x adapter disabled (missing SOCIAL_X_*)`.

**Rotation procedure:**
- X refresh token rotates automatically on each use; we persist the new value
  back into env via a `secrets/` file mounted as a volume (since env vars
  baked into the container image cannot be mutated). Document this in the
  ops README — manual cycle if the file is wiped.
- BlueSky app password: regenerate quarterly, hot-swap via env reload.
- Mastodon token: indefinite; revoke + recreate on suspected compromise.

### 8.5 Dry-run mode

`SOCIAL_DRY_RUN=true` env var. When set:

- Composer still runs end-to-end and inserts a `social_posts` row with
  `dry_run=true`.
- Adapter is replaced by a no-op that logs the would-be post and returns a
  fake `id`.
- Recommended for the **first scheduled run** post-deploy. Flip to false once
  we've confirmed the row + image look right.

Additionally, each adapter supports a "test account" mode controlled by
`SOCIAL_<NETWORK>_TEST_HANDLE` — when set, the adapter posts to that account
instead of the production one. Use during the first 1-2 weeks of operation.

### 8.6 Editorial guard (designed in, off in MVP)

`SOCIAL_REQUIRE_APPROVAL=false` (default).

When `true`:
- Composer inserts row with `status='pending'`.
- An admin route `/admin/social/pending` lists pending posts with image
  preview + the exact text per network. Buttons: Approve, Cancel, Edit-text.
- Approving sets `status='approved'` and a separate cron tick (every 5 min)
  picks up approved-but-not-posted rows and dispatches them.

For MVP we ship `false` — full auto. The schema, route stub, and dispatcher
split exist so flipping the flag is a one-line config change if the first
weeks produce embarrassing output.

### 8.7 Fallback when no clear winner

Composer protects against three failure modes:

1. **Data outage** — < N price_readings in last 7 d → skip the week, log
   `[social-bot] insufficient data, skipping` and write a row with
   `status='cancelled'`, `error_text='insufficient_data'`. No post.
2. **Tie at top** — > 1 postcode within 0.2 ¢/L of cheapest → pick the more
   populous postcode (ABS data, baked-in lookup) and append "(tied with
   N other postcodes)" to the text.
3. **Implausibly low price** — winner price < 5th percentile of last 90 d →
   composer drops it as likely a bad reading and picks runner-up. Log the
   skip; do not auto-post the suspicious one.

---

## 9. Analytics

Lightweight, aggregate-only.

- Every share-card URL embeds `?utm_source=share-card&utm_medium=<network>&utm_campaign=fill&utm_content=<hash6>`.
  - `<network>` = `native | clipboard` (from §7) or `x | bluesky | mastodon` (from §8).
  - `<hash6>` = first 6 chars of the render hash, lets us group impressions
    by which card was shared without exposing station id in plaintext.
- Every weekly-bot URL: `?utm_source=social-bot&utm_medium=<network>&utm_campaign=weekly_cheapest_postcode&utm_content=<isoweek>`.
- Server logs UTM params on landing-page hit; aggregated nightly into a
  `share_analytics_daily` view (defer creation to first time we want a
  dashboard — for MVP, raw logs suffice).
- Counters tracked: `share.attempted`, `share.completed`, `share.fallback_copy`,
  `share_card.served`, `bot.posted.<network>`, `bot.failed.<network>`.

No third-party analytics library required for MVP — counters write to
existing structured logs and the access log.

---

## 10. Privacy

- **No user identifiers** in any rendered card or social post. Cards reference
  station + price + radius only. The server route never accepts a user id.
- The hash deliberately excludes any user-derived input.
- The deep-link target page (`/share/s/:hash`) is publicly accessible without
  auth — sharing is a public act by definition.
- The bot never names a user, suburb at sub-postcode resolution, or station
  in the weekly post (postcode + price only).
- We do **not** correlate share events back to user accounts in the DB.
  Aggregate UTM logs are not joined to `users`.

---

## 11. Test strategy

### 11.1 Renderer

- **Golden image tests** under `src/__tests__/share/`: a small set of canonical
  inputs (cheap price, expensive price, very long station name, missing
  radius, special chars in suburb, weekly-postcode variant) → render PNG →
  compare pixel-diff against checked-in reference using `pixelmatch`. Tolerance
  ~0.1 % pixels. Refresh references via `npm run test:share:update`.
- **Determinism**: pin font version in `package-lock.json`; pin Satori/ResVG.
- **Performance assertion**: render must complete in < 200 ms in CI on the
  Node runtime.

### 11.2 Signing

- Unit tests for HMAC sign/verify, including expiry semantics if introduced
  later (MVP signatures don't expire; the URL itself becomes stale via cache
  TTL).

### 11.3 Adapters

- Each network adapter is a pure function over an injected HTTP client.
- Tests use `nock` (or fetch-mock) to assert exact request shape (endpoint,
  headers, multipart for image upload, JSON body).
- One test per adapter for happy path + 401 + 5xx + timeout.

### 11.4 Composer

- Snapshot test: feed in fixture `price_readings_daily` rows → assert the
  generated `social_posts` row text matches a fixture string per network.
- Test all three fallback branches (§8.7).

### 11.5 Cron job

- Test that `startBotScheduler()` registers exactly one task at the expected
  cron expression and tz.
- Test that calling the scheduled function with a mocked composer + mocked
  adapters produces the expected DB rows and adapter calls.

### 11.6 Web Share API

- Vitest + jsdom: mock `navigator.share` / `navigator.canShare` to assert
  the three branches (with files / without files / clipboard).

---

## 12. Sequencing & effort estimate

Within SP-8, in order:

1. Schema + migration (`share_card_renders`, `social_posts`) — 0.5 d
2. Renderer module + layout + golden tests — 1.5 d
3. `/api/og/fill` route + signing + share/s page + cache headers — 1 d
4. Client share button + Web Share API integration — 1 d
5. Bot scheduler + composer + fallback rules — 1.5 d
6. Three network adapters + dry-run mode — 1.5 d
7. Editorial guard route stubs (off-by-default) — 0.5 d
8. UTM analytics wiring — 0.5 d
9. End-to-end smoke + test-account first run — 0.5 d

Total: ~8.5 dev-days. SP-8 is the smallest of the MVP sub-projects.

---

## 13. Open questions (with recommended defaults)

| # | Question | Recommended default | Status |
|---|---|---|---|
| 1 | **Which networks at day-1?** | X + BlueSky + Mastodon (all three — adapter abstraction makes the marginal cost ~half a day each; X is mandatory for reach, BlueSky for the Aus tech crowd, Mastodon for the noisy fediverse early-adopter signal). Drop Mastodon if access becomes painful. | **decision pending** |
| 2 | **Who owns the social accounts?** | cdenn personally creates `@fillip_au` (or whatever handle we land on after SP-0 brand). Move to a generic ops mailbox post-launch. | **decision pending** |
| 3 | **Launch bot with MVP, or 2 weeks later?** | **Launch 2 weeks after MVP.** Two-week delay lets us collect a real story ("Brisbane CBD was cheapest 3 weeks running…") and avoids posting "the cheapest postcode this week was [station-data-was-broken]" as our debut tweet. The share-a-fill card ships at MVP. | **decision pending** |
| 4 | **Per-brand station logos in card?** | Defer — text-only "Shell" wordmark in MVP. Per-brand SVG library is its own curation/legal effort (trademark usage). | resolved (defer) |
| 5 | **Image storage backend** | None — re-render every cache miss; rely on CDN. Add R2/S3 only if p99 render exceeds 250 ms. | resolved |
| 6 | **Mastodon instance?** | `aus.social` (Aus general-interest, > 10k users, friendly to consumer brands). Confirm ToS allows automated posts. | **decision pending** |
| 7 | **OG image dimensions** | 1200×630 — canonical. | resolved |
| 8 | **Where does the deep-link land?** | `/share/s/:hash` (purpose-built page) which then offers "Open station in Fillip" CTA → `/dashboard?station=...`. Don't dump the user straight onto the dashboard — we want one page where we control the OG meta + can add upsell copy. | resolved |
| 9 | **Threaded follow-up tweets per state?** | Disabled by default in MVP (`SOCIAL_THREAD_PER_STATE=false`). Code path exists; flip on after we see how the headline post performs. | resolved |
| 10 | **Editorial guard on or off at launch?** | Off (full auto). Schema + route are designed in so flipping on takes 5 min. | resolved |
| 11 | **Instagram / FB / WhatsApp?** | Out of scope for MVP — no native auto-post APIs without Business / Graph friction. Revisit Phase 2. | resolved |
| 12 | **Sig rotation cadence?** | `SHARE_SIGNING_SECRET` rotates yearly. Keep a 7-day overlap window where both the previous and current secret validate. | resolved |

---

## 14. Risks

- **Brand reputational risk from auto-posts.** Mitigation: dry-run first
  week, editorial-guard hook always present, kill-switch env var
  `SOCIAL_BOT_DISABLED=true` short-circuits the whole job.
- **Stale prices in shared cards.** A user shares "I paid $1.74"; an hour
  later the price is $1.92. Cache TTL is 1 h; the card itself snapshots the
  price at render time and that's intentional — the user *did* pay $1.74.
  Card copy never says "current price", it says "I paid".
- **Rate limits.** X v2 free tier is 500 posts/mo; we use 4/mo. BlueSky and
  Mastodon are effectively unlimited at our volume. Image uploads are the
  rate-limited path on X — keep an eye on `x-rate-limit-remaining` headers
  in `response_json` and alert if < 5.
- **Renderer drift.** Font/library bumps subtly change pixel output and
  break golden tests. Documented update procedure: bump → run
  `test:share:update` → eyeball each golden → commit references with the
  bump.
- **Sig leakage.** If someone scrapes signed URLs from the wire they can
  re-share them. Acceptable — they only re-share *real* prices that we
  already published. The signing secret is not for confidentiality.
- **Self-hosted CDN single point of failure.** Cloudflare tunnel is the
  only edge. If it's down the bot's image URL 502s and the post becomes
  text-only. Bot tolerates this (`content_image_url` may be null).

---

## 15. Acceptance criteria

- [ ] Share button on station card produces a native share sheet on iOS
      Safari + Chrome Android with PNG attachment, and falls back to copy
      on desktop Firefox.
- [ ] Pasting a `/share/s/:hash` URL into Slack, X, iMessage, WhatsApp
      produces a card-shaped OG preview within 2 s.
- [ ] `/api/og/fill` returns a valid PNG in < 200 ms p95 (warm).
- [ ] Bad signature on `/api/og/fill` returns 400.
- [ ] Bot dry-run produces a `social_posts` row with `dry_run=true` and
      logs the would-be content; no network calls made.
- [ ] Bot real run posts to all three networks, persists `posted_at` +
      `response_json.id`, and the deep link in the post resolves to the
      correct `/share/s/:hash` page.
- [ ] Renderer golden tests pass on CI.
- [ ] No user identifier appears in any rendered card or post (verified by
      grepping the renderer + composer for `user`).
- [ ] Killing `SOCIAL_BOT_DISABLED=true` prevents the cron from firing.
- [ ] Lighthouse score for `/share/s/:hash` ≥ 90.

---

## 16. Cross-references

- Master spec §4 D5 (viral hooks subsection) — source of truth for product copy.
- Master spec §6.2 — confirms `src/lib/share/` and `src/lib/social-bot/` as the agreed module locations.
- SP-0 (rebrand) — required for final brand string "Fillip", logo SVG, palette tokens.
- SP-3 (UX core) — required for shared design tokens consumed by the renderer JSX.
- SP-1 (national data) — required for the weekly-bot composer to have AU-wide postcode coverage; without SP-1 the bot would post QLD-only headlines and undermine the brand promise.
- `src/instrumentation.ts` — the single place where both the existing scraper scheduler and the new bot scheduler are bootstrapped.
