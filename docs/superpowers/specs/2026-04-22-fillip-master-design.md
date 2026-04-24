# Fillip — Master Design Spec

**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Branch:** `fuel-spy` (codename — product brand is **Fillip**)
**Type:** Strategic umbrella spec (per brainstorming guidance — sub-projects each get their own design + plan)

---

## 1. Why this spec exists

FuelSniffer is a self-hosted, QLD-only, friends-group fuel-price dashboard. We are now committing to turn it into **Fillip** — a public, national, AU-wide fuel-price product positioned to beat **PetrolSpy** (petrolspy.com.au), the incumbent.

This document is the **north-star reference** for that effort. It locks in:

- The 5 differentiators we are betting on
- The rebrand and product principles
- The architectural deltas required (national data, accounts, alerts, etc.)
- The phased roadmap and dependencies between sub-projects
- The success metrics

Every sub-project below gets its **own** detailed design spec + implementation plan when work on it starts. This document does not attempt to be implementable on its own.

---

## 2. The opportunity

PetrolSpy is the incumbent. Their public surface is surprisingly thin:

**Strengths:** national + NZ coverage, well-known cycle graphs, mobile apps, brand recognition, $25/day giveaway.

**Gaps:** no web accounts, no web alerts, no user price submissions on web, no trip planning, no "fill up today?" guidance, dated and ad-heavy UX, closed data ($250/mo API), no community/reviews, no EV/alt-fuel, no fleet tooling.

There is room for a faster, smarter, friendlier product that helps drivers **decide and act** rather than just look at a map.

---

## 3. Product principles

1. **Decide, don't display.** Every screen should tell the user *what to do*, not just hand them raw data.
2. **Speed is a feature.** Map interactive < 2 s on 4G; alerts arrive within seconds of price changes.
3. **Honest by default.** No dark patterns, no engagement-maximising tricks, ad slots are clearly labelled and fuel-related only.
4. **National from day one of GA**, even if launched in QLD-only beta.
5. **Best-in-class UX** is the moat. Design quality alone should convert PetrolSpy users.

---

## 4. The 5 differentiators

### D1. Predictive "fill up now vs. wait" engine

**Headline:** *"FILL NOW — your suburb's at cycle low. Prices likely +$0.18/L by Friday."*

**Phased approach:**
- **Phase A (MVP):** rule-based cycle detector. Per-suburb-fuel rolling median over 14 d; detect local trough/peak; output 4-state signal `FILL_NOW | HOLD | WAIT_FOR_DROP | UNCERTAIN`. Explainable, ships in days.
- **Phase B (≤6 months post-MVP):** statistical forecast (ARIMA / Prophet) per city-fuel pair, 7-day forward forecast with confidence interval. Surfaces "+$0.14/L by Fri (72% conf)."

**Surfaces:**
- Big "Today's verdict" chip on dashboard, scoped to user's home suburb
- Badge on every station card / popup
- Drives `cycle_low` alert type (D3)

**Out of scope for MVP:** ML models (gradient-boosted etc.), per-station predictions.

---

### D2. Trip & route-aware fuel planning (polish-only for v1)

Already half-built at `/dashboard/trip`. Scope for Fillip v1 is **A — polish what exists**, not adding multi-stop or optimisation algorithms.

**Polish work:**
- Fix any remaining pricing/UX bugs
- Re-skin to match Fillip design system
- Make it the best **single-trip** A→B fuel planner in AU
- Tight integration with D1 ("verdict" chip on each candidate station)
- Tight integration with D4 (true-cost prices on trip results)

**Explicitly deferred:** multi-stop optimisation, towing/load profiles, EV mixed-mode, live re-routing. Future sub-project.

---

### D3. Real price alerts (web push + email)

**Channels:** Email (Resend or similar) + Web Push (VAPID + service worker). No SMS, no native push for v1.

**Alert types (all four in MVP):**
1. **Price threshold** — "U91 within X km of `home` drops below $Y"
2. **Cycle low** — "your suburb just hit its cycle trough" (driven by D1)
3. **Favourite station drop** — "Shell Chermside dropped $0.12 in the last hour"
4. **Weekly digest** — Sunday email: "best day to fill up this week is Tuesday; here's the cheapest 3 stations near you"

**Out of scope:** SMS, in-app notification centre (just web push + email for MVP), per-user quotas.

---

### D4. True-cost prices (after discounts & loyalty) — user-entered for MVP

User ticks programmes they're enrolled in (settings page):
- 7-Eleven Fuel App (My 7-Eleven)
- RACQ / NRMA / RACV / RAA / RAC / RACT membership
- Woolworths / Coles 4¢ docket "available now" toggle
- Shell V-Power Rewards
- EG Ampol AmpolCash
- United Convenience

Static discount values per programme (curated config). Pylon price → "you pay" price is shown everywhere a price is shown (station card, popup, list, trip, alerts).

**Phase 2 (separate spec):** scraped retailer programmes + rules engine for time-bound offers.
**Explicitly deferred:** 7-Eleven Fuel-lock integration (no API, legal/technical rabbit hole).

---

### D5. Best-in-class UX + viral hooks

**Core UX (in scope, all MVP):**
- Dark mode (system-aware + manual)
- PWA install (add-to-homescreen, offline station cache, standalone display)
- Performance budget: map interactive < 2 s on 4G, Lighthouse ≥ 90
- Redesigned station card + popup (current is functional but busy)
- WCAG AA accessibility (keyboard + screen reader)

**Ads (kept — monetisation):**
- Existing 3 slots only: bottom banner, sidebar unit, popup card
- **Fuel-related creative only** for v1 (no off-category)
- Future premium tier removes ads (out of scope for this spec)

**Viral hooks (in scope):**
- **Share-a-fill card** — auto-generated OG image when user taps "share": "I paid $1.74 at Shell Chermside — cheapest in 5 km. Fillip" with deep-link back. Shareable to Twitter/IG/FB/WhatsApp.
- **Weekly "cheapest postcode in AU" social bot** — auto-post to X / BlueSky / Mastodon every Monday morning.

**Deferred:** referral credits (needs rewards system), suburb leaderboard pages (SEO play, valuable but bigger than MVP).

---

## 5. Foundational changes (cross-cutting)

### 5.1 Rebrand: FuelSniffer → Fillip

- New name: **Fillip** (noun: a stimulus or boost; double meaning with "fill-up")
- New domain (TBD — `fillip.com.au` if available, else `fillip.app` / `getfillip.com`)
- New logo (out of scope for spec; commission separately)
- Re-theme of all UI surfaces
- Email sender domain, OG card branding, PWA name, social bot handle

### 5.2 National data coverage (phased, govt APIs first)

| State / Territory | Source | Effort | Phase |
|---|---|---|---|
| QLD | fuelpricesqld.com.au (existing) | done | MVP |
| NSW | FuelCheck API (govt, free) | medium | MVP |
| WA | FuelWatch RSS (govt, free, T+1 prices) | medium | MVP |
| NT | MyFuel NT (govt, free) | small | MVP |
| TAS | FuelCheck TAS (govt, free) | small | MVP |
| ACT | piggyback on NSW where possible | small | MVP |
| SA | no govt API — commercial / scrape | large | Phase 2 |
| VIC | no govt API — commercial / scrape | large | Phase 2 |
| NZ | no single source — scrape | large | Phase 3 |

MVP coverage = ~75 % of AU population, 100 % legal, 100 % free. Each state adapter is a separate sub-project; all share a common ingestion contract that `writer.ts` already implements.

### 5.3 Accounts & auth

- **Drop:** invite codes as user-facing flow (keep table + admin tool for beta cohort gating)
- **Add:** magic-link email auth (primary)
- **Add:** Google OAuth + Apple OAuth (one-click options)
- **Drop:** passwords entirely

Existing JWT session model in `src/lib/session.ts` is fine to keep; only the *signup/login* surface changes.

### 5.4 Monetisation (no change in v1)

Three existing ad slots only, fuel-related creative only. Premium tier (removes ads) is a future sub-project.

---

## 6. Architectural deltas

### 6.1 Data model additions (high level)

- `users` — replace/augment current invite-coded users; OAuth identities
- `user_settings` — home location, preferred fuel(s), enrolled loyalty programmes (D4)
- `favourite_stations` — many-to-many user × station
- `alerts` — alert definitions (type, criteria, channel preferences, paused flag)
- `alert_deliveries` — log of fired alerts (rate-limit, dedupe, audit)
- `web_push_subscriptions` — VAPID endpoint + keys per device
- `cycle_signals` — denormalised D1 output per suburb-fuel-day (source of truth for verdict chip + cycle_low alerts)
- `share_card_renders` — cached OG images for share-a-fill (CDN-friendly)

### 6.2 New services / modules

- `src/lib/cycle/` — D1 rule-based detector (Phase A); forecast (Phase B)
- `src/lib/alerts/` — evaluator (cron, runs after each scrape), dispatcher (email + web push), template engine
- `src/lib/auth/` — magic link + OAuth providers
- `src/lib/discount/` — programme registry + true-cost calculation
- `src/lib/share/` — OG image generation (server-side, satori or similar)
- `src/lib/social-bot/` — weekly post composer (cron, auth tokens per network)
- `src/lib/scraper/adapters/{nsw,wa,nt,tas}/` — per-state ingestion adapters behind a common interface

### 6.3 Cross-cutting

- All scraper adapters emit to the same normalised `price_readings` schema
- Alert evaluator runs as a post-hook on each scraper completion
- Cycle signals recomputed nightly + lightly updated after each scrape
- Web push requires VAPID keys (env vars) + a service worker added to the PWA shell

---

## 7. Roadmap (sub-projects + dependencies)

Each sub-project below gets its **own design spec + implementation plan** when started.

```
                ┌─────────────────────────────┐
                │  SP-0  Rebrand + foundations │  ← starts first
                │  (name, theme, domain, ads   │
                │   stay, JWT keep)            │
                └──────────────┬───────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐      ┌────────────────┐     ┌────────────────┐
│ SP-1 National │      │ SP-2 Auth v2   │     │ SP-3 UX core   │
│ data adapters │      │ (magic link +  │     │ (dark mode,    │
│ (NSW/WA/NT/   │      │  Google/Apple) │     │  PWA, perf,    │
│  TAS/ACT)     │      │                │     │  a11y, cards)  │
└──────┬────────┘      └───────┬────────┘     └────────┬───────┘
       │                       │                       │
       └───────────┬───────────┘                       │
                   ▼                                   │
           ┌───────────────┐                           │
           │ SP-4 Cycle    │                           │
           │ engine Phase A│                           │
           │ (D1 rule-based)│                          │
           └───────┬───────┘                           │
                   │                                   │
                   ▼                                   │
           ┌───────────────┐                           │
           │ SP-5 Alerts   │◀──────────────────────────┘
           │ (D3 — needs   │      (needs auth + UX shell)
           │  auth, cycle, │
           │  web push)    │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │ SP-6 True-cost │
           │ (D4 user-entered)
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │ SP-7 Trip      │
           │ polish (D2)    │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │ SP-8 Viral     │
           │ (share-card +  │
           │  social bot)   │
           └───────────────┘
```

**Phase boundaries:**
- **MVP cut-line:** SP-0 → SP-8 above. This is the "Fillip 1.0" public launch.
- **Post-MVP Phase 2:** D1 forecast (Phase B), SA/VIC adapters, premium tier (no-ads), suburb leaderboard SEO pages.
- **Post-MVP Phase 3:** NZ coverage, multi-stop trip optimisation, EV/alt-fuel, fleet tier, community signal (D4 retired alternative).

---

## 8. Success metrics

**North-star:** Weekly Active Users (WAU)
**Supporting:** monthly fills-assisted (alerts fired + trip plans + share cards) + organic SERP share of voice across top 500 AU postcodes.

**Stake-in-the-ground 12-month targets** *(v1 numbers — revisit after MVP launch)*:
- **50,000 WAU** by month 12
- **200,000 fills-assisted / month** by month 12
- **Top-3 organic rank for "cheap fuel [suburb]" in 250 of top 500 AU postcodes** by month 12

Instrumentation strategy is out of scope for this doc (lives in SP-3 UX spec).

---

## 9. Explicitly out of scope

For clarity — these came up in brainstorming and are *deliberately not* in v1:

- EV / alt-fuel coverage (D5 from candidate list)
- Community signal / user price submissions / station ratings (D4 from candidate list)
- Fleet & business tier (D7 from candidate list)
- Open public API / embeddable widgets (D8 from candidate list)
- Referral rewards system
- Suburb leaderboard SEO pages
- Premium / paid tier (no-ads, etc.)
- Multi-stop trip optimisation
- 7-Eleven Fuel-lock integration
- SMS alerts
- Native mobile apps
- SA, VIC, NZ data coverage

All listed above are valid future sub-projects; none belong in MVP.

---

## 10. Cross-cutting decisions (locked 2026-04-23)

These decisions apply across multiple sub-projects and were resolved before any sub-project planning began. Sub-project specs should reflect these as fact, not open questions.

| # | Decision | Value |
|---|----------|-------|
| 1 | Email provider | **Resend** (behind a swappable `EmailProvider` interface) |
| 2 | Web push | **Self-hosted** (`web-push` lib + VAPID, no third-party service) |
| 3 | Suburb-key namespacing | **`lower(suburb)\|lower(state)`** across SP-1 ingestion and SP-4 cycle keys |
| 4 | Geo radius queries | **PostGIS** (SP-1 enables the extension; SP-5 reuses it) |
| 5 | Brand accent colour | **Keep amber** (`#f59e0b`) — no rebrand recolour |
| 6 | Final domain | **`fillip.clarily.au`** (subdomain on existing Clarily property) |
| 7 | SP-0 dark mode handling | **Light mode is the default** post-rebrand; **toggle ships in SP-0** so users can opt back into dark while SP-3 finalises the proper theme system |
| 8 | Apple Sign In | **Yes — in scope for SP-2** (Apple Developer account to be provisioned) |

### Still open (deferred to their owning sub-project)

- Logo + visual identity direction (commission externally)
- OG image renderer choice (SP-8 — recommendation: Satori + ResVG)
- Social bot day-1 networks (SP-8 — recommendation: X + BlueSky + Mastodon)
- Discount registry curator post-MVP (SP-6)
- 12-month numeric targets in §8 (revisit before launch)

Each remaining open item lives in the relevant sub-project spec's §13/§14/§15 "open questions" section with a recommended default already noted.
