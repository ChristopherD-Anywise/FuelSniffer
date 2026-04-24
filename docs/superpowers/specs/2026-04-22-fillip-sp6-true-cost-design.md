# SP-6 — True-Cost Prices (D4, user-entered loyalty/discount programmes)

**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Parent spec:** `2026-04-22-fillip-master-design.md` §4 D4
**Depends on:** SP-2 (Auth v2 — needs `users` table), SP-3 (UX shell — settings route)
**Feeds:** SP-5 (Alerts — effective price as default threshold), SP-7 (Trip polish — true-cost on candidate stations)

---

## 1. Goal & non-goals

### Goal

Show the **price the user actually pays at the pump** — not just the pylon (sign) price — everywhere a price is rendered (station card, popup, list, trip results, alerts, share-card). The user tells us once which loyalty/discount programmes they're enrolled in; we apply the best-applicable static discount per station and surface a struck-through pylon price next to a bold "you pay" price.

This is the v1 / MVP slice of differentiator **D4**. Discount values are curated in repo, programmes are user-entered (ticked in settings), and applicability is computed deterministically from a programme registry.

### Non-goals (v1)

- **Scraped retailer programmes** (e.g. live 7-Eleven price-lock pulls, real-time docket scraping) — Phase 2.
- **7-Eleven Fuel-lock API integration** — explicitly out of scope per master spec; no API exists, legal/ToS risk.
- **Time-bound / personalised offers** ("4¢ off Tuesdays only", "double points this weekend") — Phase 2 rules engine.
- **Per-station overrides** ("RACQ doesn't work at *this specific* United"). v1 trusts the brand-level rule.
- **Automatic detection** of which programmes a user is in (e.g. via OAuth into Woolworths). User self-declares.
- **Stacking maths** beyond a single-step "best programme wins". Stacking is configurable per-programme but defaults to OFF for v1 (see §6.4).
- **Cycle-engine inputs** — D1 cycle signal stays on pylon prices (it's a market signal, not a wallet signal). Documented in §9.

---

## 2. User stories

1. **First-time setup.** As a new user, I want to tick the loyalty programmes I'm enrolled in (RACQ, Woolworths docket, 7-Eleven Fuel App) on a settings page so my price views reflect what I actually pay.
2. **Always-on discount.** As an enrolled RACQ member, every Ampol/Caltex station I see should show "you pay $1.84 (RACQ)" with the $1.88 pylon struck through.
3. **Toggleable docket.** As someone who sometimes has a Woolies 4¢ docket, I want a quick toggle ("docket available now") that I flip on/off without un-enrolling.
4. **Smart "best of".** If two of my programmes apply at one station, I see the cheaper one and the label tells me which.
5. **Honest comparison.** I can hover/tap the price to see the pylon and which programme was applied; I can also turn the whole feature off and see pure pylon prices.
6. **Alert respects wallet.** When I set a "<$1.80" alert, the threshold is checked against my effective price by default — i.e. it fires when the *true cost* drops below $1.80.

---

## 3. Programmes shipped in v1

| ID | Name | Type | Default discount | Notes |
|---|---|---|---|---|
| `seven_eleven_fuel_app` | 7-Eleven Fuel App | rewards | 4 ¢/L | "Daily price-match snapshot" — model as flat 4 ¢ off pylon for v1; *not* the fuel-lock feature |
| `racq` | RACQ Membership | membership | 4 ¢/L | Ampol-branded sites |
| `nrma` | NRMA Membership | membership | 4 ¢/L | Ampol-branded sites |
| `racv` | RACV Membership | membership | 4 ¢/L | Ampol-branded sites |
| `raa` | RAA Membership (SA) | membership | 4 ¢/L | Ampol/Caltex |
| `rac_wa` | RAC Membership (WA) | membership | 4 ¢/L | Ampol-branded sites |
| `ract` | RACT Membership (TAS) | membership | 4 ¢/L | Ampol-branded sites |
| `woolworths_docket` | Woolworths 4¢ docket | docket | 4 ¢/L | User-toggled "I have one" flag; eligible at EG Ampol partner sites |
| `coles_docket` | Coles 4¢ docket | docket | 4 ¢/L | User-toggled; eligible at Coles Express / Shell Coles Express |
| `shell_vpower_rewards` | Shell V-Power Rewards | rewards | 4 ¢/L | Shell-branded sites |
| `eg_ampolcash` | EG Ampol AmpolCash | rewards | 6 ¢/L | EG Ampol sites; check current rate at curation time |
| `united_convenience` | United Convenience | rewards | 5 ¢/L | United-branded sites |

> **Curation note.** Discount values above are *placeholders pending verification at registry-seed time*. The product owner (cdenn) signs off the seeded JSON before merge. See §10.

All programme discounts above are stored in the registry (§5), not hard-coded.

---

## 4. Programme registry

### 4.1 Storage choice — versioned JSON in repo

Recommendation: **single JSON file checked into the repo**, not a DB table.

Reasoning:
- Discount values + eligibility rules change rarely (months, not days) and have legal/disclaimer implications. PR review is exactly the gate we want.
- Diffs in `git log` give us auditable provenance ("when did we change RACQ from 4¢ to 6¢, who approved it, why?").
- No migration ceremony when a programme is added/removed.
- The runtime cost is zero — load once at module init.
- DB-backed config invites silent edits via psql in production. We do not want that for anything that affects displayed prices.

**Path:** `src/lib/discount/programmes.json` (read-only, validated by Zod at module load).
**Sibling:** `src/lib/discount/brand-aliases.json` (see §6).
**Versioning:** add a `schema_version` field; bump major when shape changes.

### 4.2 Programme schema

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-04-22T00:00:00Z",
  "programmes": [
    {
      "id": "racq",                              // stable kebab/snake; never reused
      "name": "RACQ Membership",                 // display
      "type": "membership",                      // membership | docket | rewards
      "eligible_brand_codes": ["ampol", "caltex_starcard"],
      "eligible_fuel_types": ["U91", "U95", "U98", "DSL", "PDL"],
      "discount_cents_per_litre": 4,
      "stackable": false,
      "conditions_text": "RACQ members receive 4¢/L off pylon at participating Ampol service stations. Discount applied at point of sale on presentation of card / app.",
      "source_url": "https://www.racq.com.au/cars-and-driving/fuel/fuel-discounts",
      "last_verified_at": "2026-04-22",
      "verified_by": "cdenn",
      "notes": "Excludes AdBlue, LPG, premium oils."
    }
    // ... one entry per programme
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Stable identifier; appears in `applied_programme_id` on API responses. Never renamed; deprecate by adding `deprecated_at`. |
| `name` | yes | Displayed in UI labels ("you pay $1.84 with **RACQ**") |
| `type` | yes | `membership | docket | rewards`. Drives UI grouping on settings page only. |
| `eligible_brand_codes[]` | yes | Joined against canonical brand codes (see §6). Empty array = applies nowhere (= disabled). |
| `eligible_fuel_types[]` | yes | Fuel-type IDs from our existing `fuel_types` table. Use `["*"]` for all. |
| `discount_cents_per_litre` | yes | Integer cents. Stored at **whole-cent** granularity to match how programmes advertise. |
| `stackable` | yes | Boolean. v1 default = `false`. See §6.4. |
| `conditions_text` | yes | Long-form, shown in tooltip + settings page. |
| `source_url` | yes | URL we sourced the rule from; required for audit trail. |
| `last_verified_at` | yes | ISO date. Used by curation cadence (§10) to surface stale entries. |
| `verified_by` | yes | Username; PR author by convention. |
| `notes` | no | Free text; not displayed. |

### 4.3 Validation

- Zod schema in `src/lib/discount/registry.ts`.
- Hard fail at server boot if `programmes.json` is malformed (no silent fallback).
- Lint: every `eligible_brand_codes` entry must exist in the brand-alias canonical list. Every `eligible_fuel_types` entry must exist in `fuel_types`. CI test: `pnpm test discount/registry`.

---

## 5. Brand mapping

The QLD adapter (and forthcoming state adapters) populate `stations.brand` with whatever string the upstream API gives — "Ampol", "Caltex", "Caltex Woolworths", "EG Ampol", "Coles Express", "Shell Coles Express", etc. We need a stable canonical code per brand so the registry doesn't have to enumerate every alias.

### 5.1 Canonical brand codes

Lookup table at `src/lib/discount/brand-aliases.json`:

```jsonc
{
  "schema_version": 1,
  "canonical_brands": [
    {
      "code": "ampol",
      "display": "Ampol",
      "aliases": ["ampol", "ampol foodary", "ampol metro", "caltex starcard"]
    },
    {
      "code": "shell",
      "display": "Shell",
      "aliases": ["shell", "shell select", "shell v-power"]
    },
    {
      "code": "shell_coles_express",
      "display": "Shell Coles Express",
      "aliases": ["shell coles express", "coles express", "coles express shell"]
    },
    {
      "code": "eg_ampol",
      "display": "EG Ampol",
      "aliases": ["eg ampol", "eg fuelco", "euro garages"]
    },
    {
      "code": "united",
      "display": "United Petroleum",
      "aliases": ["united", "united petroleum", "united convenience"]
    },
    {
      "code": "seven_eleven",
      "display": "7-Eleven",
      "aliases": ["7-eleven", "7 eleven", "7eleven", "seven eleven"]
    }
    // ... all known QLD brands seeded from current production data
  ]
}
```

### 5.2 Resolution algorithm

```
resolveBrandCode(rawBrand: string | null) -> brandCode | "unknown"
  1. trim, lowercase, collapse whitespace, strip punctuation
  2. exact-match against any alias
  3. on miss: prefix-match against aliases (longest wins)
  4. on miss: return "unknown" and log to telemetry table `unknown_brand_log`
```

`unknown_brand_log` (lightweight DB table: `raw_brand TEXT PK, count INT, last_seen_at TIMESTAMPTZ`) lets curators add aliases on a recurring cadence (§10) without any user-facing impact in the meantime — unknown brands simply get no programme applied and show pure pylon price.

### 5.3 Why a flat alias table (not regex / fuzzy match)

- Determinism: every UI render and every alert evaluation must produce the same brand code from the same input.
- Reviewable diffs: adding "ampol foodary express" as an alias is a one-line PR.
- Cheap: O(1) hashmap lookup, built once at server boot.

---

## 6. True-cost calculation

### 6.1 Inputs

| Input | Source |
|---|---|
| `pylon_price_cents` | `price_readings.price_cents` (latest per station+fuel) |
| `station.brand` | resolved via §5 to canonical brand code |
| `fuel_type_id` | request param / station-level fuel selection |
| `enrolled_programme_ids[]` | `user_programmes` joined for current user; docket-type entries also require `paused = false` |

### 6.2 Output (added to every PriceResult)

```ts
{
  // ... existing fields ...
  pylon_price_cents: string,          // alias of price_cents — keep both for clarity
  effective_price_cents: string,      // = pylon_price_cents - applied.discount, or = pylon if no programme
  applied_programme_id: string | null,
  applied_programme_name: string | null,
  applied_discount_cents: number,     // 0 when null applied
  considered_programme_ids: string[]  // every programme that *could* apply, for UI tooltip
}
```

### 6.3 Algorithm (single-step, no stacking)

```
computeEffective(pylon, brandCode, fuelTypeId, enrolledIds):
  candidates = registry.programmes.filter(p =>
    enrolledIds.includes(p.id) &&
    p.eligible_brand_codes.includes(brandCode) &&
    (p.eligible_fuel_types.includes("*") || p.eligible_fuel_types.includes(fuelTypeId))
  )
  if candidates.empty: return { effective: pylon, applied: null, discount: 0, considered: [] }
  best = candidates.maxBy(p => p.discount_cents_per_litre)
  return {
    effective: pylon - best.discount_cents_per_litre,
    applied: best,
    discount: best.discount_cents_per_litre,
    considered: candidates.map(c => c.id)
  }
```

### 6.4 Tie-breaking

When two programmes give the same discount (e.g. RACQ 4¢ vs Woolies docket 4¢ at an EG Ampol):

1. **Higher specificity wins** — programme with fewer `eligible_brand_codes` is treated as more specific (membership for one brand beats a broad rewards card).
2. If still tied: **prefer non-`docket` type** (memberships are persistent; dockets are perishable and feel "wasted" if applied unnecessarily).
3. If still tied: **lexicographic on `id`** (deterministic, debuggable).

Rationale: a tie that picks the *least disposable* discount is closer to "what a sensible person would actually do at the pump."

### 6.5 Stacking (configurable, default OFF in v1)

`stackable: true` on a programme allows it to **add to** the best non-stackable winner. Concretely:

```
nonStackBest = max(discount among non-stackable candidates)
stackBonus   = sum(discounts among stackable candidates)
effective    = pylon - nonStackBest - stackBonus
```

For v1 ship, **every programme has `stackable: false`**. The mechanism exists so we can opt one in later (e.g. AmpolCash + RACQ stacking is real; we ship it once we've verified the rule). Documented but unused at launch.

### 6.6 Edge cases

| Case | Behaviour |
|---|---|
| Brand resolves to `"unknown"` | No discount applied, log raw brand for curation. |
| User has zero programmes enabled | Skip entire calculation; `effective_price_cents = pylon_price_cents`, `applied_programme_id = null`. |
| Pylon price is null / stale > 7 days | Don't compute — return `effective: null` and let UI render the existing "stale" treatment. |
| Discount > pylon (impossible but defensive) | Clamp to 0; surface a server-side warning log. |
| User logged out | Return pylon only; never compute anonymously (we have no enrolled list). |

---

## 7. Data model

### 7.1 New table: `user_programmes`

```sql
CREATE TABLE user_programmes (
  user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_id   TEXT         NOT NULL,
  enabled_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  paused         BOOLEAN      NOT NULL DEFAULT false,
  paused_until   TIMESTAMPTZ,
  PRIMARY KEY (user_id, programme_id)
);
CREATE INDEX user_programmes_user_idx ON user_programmes(user_id);
```

Notes:
- `programme_id` is **not** a foreign key — programmes live in JSON in repo. Validation enforced at API layer.
- `paused` (and optional `paused_until`) supports the docket toggle ("I used my docket, turn it off until I get another"). For docket-type programmes, the UI surfaces this as a primary toggle; for membership/rewards types, it's hidden behind a "pause" advanced control.
- No per-station overrides for v1 (master spec confirms).
- No history of past changes for v1 — we don't need an audit trail of user pref changes.

### 7.2 New table: `unknown_brand_log` (telemetry)

```sql
CREATE TABLE unknown_brand_log (
  raw_brand     TEXT          PRIMARY KEY,
  count         BIGINT        NOT NULL DEFAULT 1,
  last_seen_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

Upserted on cache miss in brand resolver. Used by curation review (§10).

### 7.3 No changes required to

- `stations` (brand stays as-is — resolution happens at calculation time)
- `price_readings` (effective price is computed on read, never stored)
- `fuel_types`

---

## 8. API surface

### 8.1 Settings endpoints

```
GET  /api/me/programmes
PUT  /api/me/programmes/:programmeId       body: { enabled: boolean, paused?: boolean, paused_until?: ISODate | null }
DELETE /api/me/programmes/:programmeId      (semantically equivalent to enabled:false; provided for clarity)
GET  /api/programmes                        public — returns the registry (sanitised: no notes field)
```

`GET /api/me/programmes` returns:

```jsonc
{
  "programmes": [
    {
      "id": "racq",
      "name": "RACQ Membership",
      "type": "membership",
      "discount_cents_per_litre": 4,
      "eligible_brand_codes": ["ampol"],
      "conditions_text": "...",
      "source_url": "...",
      "enrolled": true,
      "paused": false,
      "paused_until": null
    }
    // ... one entry per programme in the registry
  ]
}
```

The merged shape (registry + user state) keeps the settings page to a single fetch.

### 8.2 Augmented price endpoints

Every endpoint that returns a price gets the new fields from §6.2. Concretely:

- `GET /api/prices` — list (filterable by fuel/location/radius)
- `GET /api/prices/history` — adds `effective_price_cents` per bucket (computed against today's enrolment)
- `GET /api/search` — station search results include effective when fuel context exists
- `GET /api/trip/...` — every candidate station carries effective price

**Behaviour for unauthenticated requests:** return `effective_price_cents = pylon_price_cents` and `applied_programme_id = null`. No 401 — the dashboard works logged out.

**Behaviour for users with no enrolled programmes:** identical to unauthenticated — no programmes to apply.

### 8.3 Caching

- Registry loaded once at server boot, hot-reloaded only via redeploy (it's in repo).
- Per-user enrolment fetched on first request per session and cached in-memory for the JWT lifetime; bust on PUT.
- No DB read per price calculation — the calculator is pure, takes the in-memory enrolment list as an arg.

---

## 9. UI surface contracts

### 9.1 StationCard (`src/components/StationCard.tsx`)

Today shows: `184.5¢` big, with `change` chip below.

After SP-6:
- If `applied_programme_id !== null`:
  - Big number = `effective_price_cents` (e.g. `180.5¢`)
  - Below big number, replace/append: small struck-through pylon `184.5¢` plus a programme tag chip `RACQ`
- If `null`: render exactly as today (no behavioural change for users with no programmes — zero regression risk for the existing QLD beta).

Tag chip styling: small pill, brand-coloured background (e.g. RACQ red, Shell yellow), legible at 11 px. Uses the existing `f59e0b` accent for "applied saving" treatment.

### 9.2 StationPopup (`src/components/StationPopup.tsx`)

- Top price block: render effective as the headline number; struck pylon and programme name on a second line. Period-change calculation continues to use **pylon** (apples to apples — change ¢ shouldn't bounce when a user toggles a docket on/off).
- Add a small info icon next to the programme name → tooltip: `"Discount shown is typical; actual savings depend on programme terms. Tap to manage your programmes."` Linking to settings.
- Chart Y-axis stays on pylon; effective price is a wallet view, not a market view.

### 9.3 Settings page — new route `/dashboard/settings/programmes`

Layout: grouped list, three sections (`Memberships`, `Dockets`, `Rewards`) corresponding to `type`.

Per row:
- Programme name + small brand-eligible chips ("Ampol", "Caltex")
- Discount summary ("4¢/L")
- Toggle (`enabled`)
- For `docket` type only: secondary toggle (`paused`) with copy "I have a docket right now"
- Conditions text, collapsible
- "Last verified [date]" + source-link icon

Page header includes the standing disclaimer (§11).

### 9.4 Logged-out treatment

The dashboard is usable logged-out. Logged-out users see pure pylon prices. A lightweight "Sign in to see your true price" banner appears once per session above the station list. Not intrusive; feeds SP-2 conversion.

### 9.5 Trip results (SP-7 dependency)

Every candidate station in `/dashboard/trip` shows effective price; ranking is by **effective**, not pylon. This is the single biggest user-facing benefit of D4 — and the trip planner is where the wallet view *is* the right view (it reflects the actual fill cost being optimised).

---

## 10. Integrations with sibling sub-projects

### 10.1 SP-4 Cycle engine — uses **pylon** prices

The cycle detector measures market dynamics, not wallet dynamics. If we fed it post-discount prices, the signal would be polluted by per-user enrolment. We document this explicitly:

> **Cycle signals are computed against pylon prices.** A user enrolled in RACQ does not have a different cycle-low than a user not enrolled. The "FILL NOW" verdict reflects the market trough; the price the user pays at that trough is then post-processed via SP-6.

The verdict chip surfaces both: "FILL NOW — pylon $1.78, you pay $1.74 with RACQ".

### 10.2 SP-5 Alerts — uses **effective** prices by default

Threshold alerts ("U91 within 5 km drops below $1.80") are evaluated against `effective_price_cents` for each enrolled user. Per-alert override:

```jsonc
{
  "type": "price_threshold",
  "threshold_cents": 180,
  "compare_against": "effective"  // default; alt: "pylon"
}
```

Rationale: a user setting a $1.80 budget cares about wallet hit, not signage. Power users who want to track market conditions can flip the toggle.

The alerts copy must mention which basis was used: "U91 dropped below $1.80 (effective price with RACQ) at Ampol Chermside — pylon is $1.84."

### 10.3 SP-8 Share-card — pylon **and** effective both rendered

Share card OG image shows: "I paid $1.74 at Shell Chermside (pylon $1.78 with Shell V-Power Rewards) — cheapest in 5 km. Fillip."

Honesty + viral hook. The "you saved 4¢" framing is its own potential virality lever.

---

## 11. Disclaimers & legal

### 11.1 Required disclaimer wording

Display **"Discounts shown are typical; actual savings depend on programme terms"** in:

1. The settings page header (always visible).
2. The popup tooltip when the user taps a programme tag.
3. The footer of every alert email that uses effective pricing.
4. The share-card OG image (small footer line).

### 11.2 Why this wording

Australian Consumer Law (ACL) — specifically the misleading-and-deceptive-conduct provisions of §18 of the Competition and Consumer Act 2010 — requires any price representation to be substantiable. Stating "you pay $1.84 with RACQ" without qualification is a representation that the user *will* pay that price; in reality, programme terms can disqualify a transaction (e.g. fuel type excluded, member card not present, point-of-sale discount system down). The disclaimer addresses this.

We are not lawyers. Before public launch, the registry + disclaimer copy goes through a legal review pass (out of this spec's scope; flagged in master spec §10).

### 11.3 What we will not do

- Claim any partnership with any of these programmes (none exist).
- Use programme logos at >32 px or in a way that implies endorsement. Brand chips use brand colour + text only.
- Track or report user fills back to programme operators.

---

## 12. Programme curation cadence

### 12.1 Ownership

- **Owner:** product (cdenn) for v1; transition to a small "data team" rotation post-launch.
- **Cadence:**
  - **Monthly:** spot-check every programme's `source_url`; if a discount value or eligibility rule changed, open a PR.
  - **Quarterly (April / July / Oct / Jan):** full audit — re-verify every programme; update `last_verified_at` even if no change. PR titled `chore(discount): Q2 2026 registry audit`.
  - **Continuous:** `unknown_brand_log` queried weekly; aliases added ad-hoc.

### 12.2 Process

1. Curator reviews each programme's source page.
2. Updates `programmes.json` + bumps `last_verified_at`.
3. Opens PR; another team member reviews.
4. Merge → next deploy.

### 12.3 Stale-data telemetry

A daily server log warns if any programme has `last_verified_at` older than 120 days. Surfaced in admin dashboard (`/admin/registry-health`) — a tiny page that simply lists each programme + verification age + colour-coded freshness.

---

## 13. Test strategy

### 13.1 Calculator golden tests (`src/__tests__/discount/calculator.test.ts`)

Fixture-driven. Each fixture is a tuple:

```
{
  name: "RACQ at Ampol Chermside, U91",
  pylon_cents: 188,
  brand_raw: "Ampol Foodary",
  fuel_type_id: "U91",
  enrolled: ["racq", "woolworths_docket"],
  expected: {
    effective_cents: 184,
    applied: "racq",
    considered: ["racq"]   // Woolies docket doesn't apply at Ampol
  }
}
```

Minimum fixture set:

| Scenario | Coverage goal |
|---|---|
| One programme applies | Happy path per programme (12 fixtures) |
| Zero programmes apply | Returns pylon untouched |
| Two programmes apply, different discount | Best wins |
| Two programmes apply, same discount | Tie-break specificity |
| Two programmes apply, same discount + same specificity | Tie-break docket vs membership |
| Stackable + non-stackable | Stack adds to best non-stack |
| Brand `"unknown"` | No application |
| Fuel-type excluded | No application |
| Discount > pylon | Clamped to zero, warning logged |
| Pylon null | Returns null effective |
| User has zero enrolled | No DB hit, returns pylon |

### 13.2 Brand-resolver tests

For every alias in `brand-aliases.json`, assert the canonical code is returned. Plus negative tests for case/whitespace/punctuation variants. Coverage target: 100 % of seeded aliases.

### 13.3 Registry-validation tests

- `programmes.json` parses against Zod schema.
- Every `eligible_brand_codes` value is a known canonical brand.
- Every `eligible_fuel_types` value is a real fuel type or `"*"`.
- `id` uniqueness.
- Every entry has non-null `source_url` and `last_verified_at`.

### 13.4 API contract tests

- `GET /api/me/programmes` returns merged shape with default `enrolled: false` for new user.
- `PUT /api/me/programmes/:id` validates programme id against registry; returns 404 for unknown.
- Price endpoints return `effective_price_cents` field even when no programme applies (= pylon).

### 13.5 UI integration tests

Playwright/Vitest browser tests:
- StationCard renders struck-through pylon when programme applied.
- Settings page toggling RACQ → reload → station card shows effective immediately.
- Logged-out shopper sees pylon only and "Sign in for true price" banner.

---

## 14. Rollout

1. **Behind a feature flag** (`FILLIP_TRUE_COST=1`) for the first week post-merge — internal users only.
2. Verify against a few real station/programme combinations the curator personally has accounts for.
3. Flip flag for the QLD beta cohort. Watch:
   - `unknown_brand_log` growth (should plateau within days)
   - Dashboard error rate
   - Settings-page completion rate (proxy for "do users understand it")
4. Public Fillip 1.0 launch enables it for everyone.

No data migration required.

---

## 15. Open questions (with recommended defaults — *decision pending*)

| # | Question | Recommended default | Decision |
|---|---|---|---|
| Q1 | Discount value of 7-Eleven Fuel App in v1 (no fuel-lock) — model as flat 4¢, or omit? | Ship as flat 4¢ with a clear conditions_text noting it's an approximation. Programme is too important to omit; flat 4¢ aligns with how 7-Eleven advertises typical savings. | pending |
| Q2 | Should AmpolCash + RACQ be marked stackable on day 1? | **No.** Ship both as non-stackable in v1; verify the actual stack rule against Ampol T&Cs in the first quarterly audit, then enable. | pending |
| Q3 | Per-state membership programmes (RACQ in QLD vs RACV in VIC) — should we hide programmes from users in a different state? | **No.** Many users are members of out-of-state auto clubs (e.g. former Victorians in QLD). Show all; trust the user. | pending |
| Q4 | Should logged-out users see effective prices via a "guest mode" cookie storing programme selections client-side? | **No for v1.** Settings live in DB, requires login. Push users to sign up — this is the conversion lever. | pending |
| Q5 | Display unit — show effective in cents or AUD/L (e.g. `$1.84`)? | **Match existing dashboard convention** (cents with ¢ glyph). Don't introduce a second unit just for effective price. | pending |
| Q6 | Where does the "best of N" tooltip live on mobile (no hover)? | Tap on the programme tag chip → bottomsheet listing all considered programmes + which won + why. | pending |
| Q7 | Honesty toggle — should we offer a global "show pylon prices only" preference? | **Yes.** Single toggle in `/settings/programmes` header. Power-users and journalists deserve a clean view. Implementation cost is trivial. | pending |
| Q8 | When a user un-enrols a programme, do we clear from their active alerts that referenced it? | Alerts use effective price by default but don't *reference* a specific programme. No-op. | resolved |
| Q9 | Should `programme_id` ever be re-used after a programme is removed? | **Never.** Add `deprecated_at` and stop applying it; keep the row in JSON for history. | pending |

---

## 16. Out-of-scope reminders (for clarity)

- 7-Eleven Fuel-lock — never in v1, see master spec §9.
- Real-time scraping of programme websites for current discount values — Phase 2.
- Per-fill receipt verification ("did you actually save 4¢?") — never; we don't see receipts.
- Loyalty point accrual maths ("you'll earn 12 Flybuys") — out of scope; this is a price-display feature, not a rewards calculator.
- VIC/SA-only programmes — defer until SP-1 phase 2 brings those states online (no point shipping a programme that has no eligible stations in our data).

---

## 17. Estimated size

- Backend (registry, calculator, brand resolver, APIs, tests): ~2 days
- DB migration + user_programmes + unknown_brand_log: ~0.5 day
- UI (StationCard + StationPopup deltas, new settings page, info tooltips): ~2 days
- Programme registry seeding + manual verification of all 12 programmes: ~1 day (curator time, not engineering)
- Disclaimer copy + legal review pass: ~0.5 day eng + external dependency
- E2E tests + golden fixtures: ~1 day

**Total:** ~7 dev-days + 1 day curator + legal review wait. One sprint.

---

## 18. Success criteria

- Every price-rendering surface shows effective price for enrolled users.
- Calculator golden tests pass at 100 %.
- Brand-resolver covers ≥ 95 % of station rows in production at launch (measured via `unknown_brand_log`).
- Settings page completion rate (% of authenticated users who enrol ≥ 1 programme) ≥ 40 % within 30 days of launch.
- Zero ACL-related complaints / takedown requests in first 90 days post-launch.
- Alerts that fire against effective price have ≤ 5 % "false positive" rate (user reports the price isn't what they paid). Measured via a thumbs-down on alert emails — that instrumentation is part of SP-5.
