# Fillip SP-6 — True-Cost Prices (D4) Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the price the user actually pays at the pump — not just the pylon (sign) price — everywhere a price is rendered. User self-declares their loyalty/discount programmes once in a settings page; we apply the best-applicable static discount per station using a repo-versioned programme registry.

**Depends on:** SP-2 (Auth v2 — `users` table, session helpers), SP-3 (UX shell — `SlotTrueCost` placeholder, `SlotVerdict`)

**Feeds:** SP-5 (Alerts — effective price as default alert threshold), SP-7 (Trip polish — true-cost on candidates)

**Architecture:** Programme definitions live as versioned JSON in `src/lib/discount/programmes.json`. Brand aliases in `src/lib/discount/brand-aliases.json`. A pure-function calculator in `src/lib/discount/calculator.ts` takes pylon price + brand code + fuel type + enrolled programme IDs and returns the effective price. Two new DB migrations add `user_programmes` and `unknown_brand_log`. API routes under `/api/me/programmes` and `/api/programmes` manage enrolment. The existing `/api/prices/*` endpoints are augmented to return effective price fields derived from the session user's enrolled programmes.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Zod (runtime validation of registry JSON) · Drizzle (DB queries) · jose (session) · Vitest (unit + golden tests).

---

## File Structure

**Files created** (all under `fuelsniffer/`):

| Path | Responsibility |
|---|---|
| `src/lib/discount/programmes.json` | Versioned registry: 12 v1 programmes with schema\_version, eligibility, discount, conditions |
| `src/lib/discount/brand-aliases.json` | Canonical brand codes + alias lists for all known QLD brands |
| `src/lib/discount/registry.ts` | Zod schema + loader; validates programmes.json + brand-aliases.json at module load; exports `getRegistry()` and `resolveBrandCode()` |
| `src/lib/discount/calculator.ts` | Pure function: `computeEffective(pylon, brandCode, fuelTypeId, enrolledIds)` → `EffectiveResult` |
| `src/lib/db/migrations/0018_user_programmes.sql` | `user_programmes` table (user\_id FK → users.id, programme\_id TEXT, enabled\_at, paused, paused\_until) |
| `src/lib/db/migrations/0019_unknown_brand_log.sql` | `unknown_brand_log` table (raw\_brand PK, count, last\_seen\_at) for curation telemetry |
| `src/app/api/me/programmes/route.ts` | `GET` (merged registry + user state), `PUT /:id` (toggle enabled/paused), `DELETE /:id` (disable) |
| `src/app/api/me/programmes/[programmeId]/route.ts` | Dynamic segment for `PUT` / `DELETE` on a specific programme |
| `src/app/api/programmes/route.ts` | `GET` — public registry (sanitised: omits `notes` field) |
| `src/app/dashboard/settings/programmes/page.tsx` | Settings page: grouped list of programmes by type (Memberships / Dockets / Rewards) with toggles, conditions text, verified date |
| `src/__tests__/discount/calculator.test.ts` | Golden test matrix: all 12 programmes × eligible brand × eligible fuel; tie-breaking; stackable; edge cases |
| `src/__tests__/discount/registry.test.ts` | Registry validation: Zod schema, brand-code integrity, fuel-type integrity, id uniqueness |
| `src/__tests__/discount/brand-resolver.test.ts` | Brand alias resolver: every seeded alias → canonical code; case/whitespace/punctuation variants |
| `src/__tests__/api/programmes-api.test.ts` | API contract: GET /api/me/programmes shape, PUT toggle, 404 for unknown id, public GET /api/programmes |

**Files modified:**

| Path | Change |
|---|---|
| `src/lib/db/queries/prices.ts` | Extend `PriceResult` interface with `effective_price_cents`, `applied_programme_id`, `applied_programme_name`, `applied_discount_cents`, `considered_programme_ids`; add `computePricesWithEffective()` helper that wraps `getLatestPrices()` |
| `src/app/api/prices/route.ts` | Accept session; pass enrolled programme IDs to effective-price computation; return augmented fields |
| `src/components/slots/SlotTrueCost.tsx` | Replace placeholder with real rendering: effective price headline + struck pylon + programme chip when `applied_programme_id !== null`; collapsed (`display:none`) in popup context |
| `src/components/StationCard.tsx` | Pass `trueCost` prop from API response to `SlotTrueCost` |
| `src/components/StationPopup.tsx` | Render effective price as headline in price row; struck pylon + programme name on second line; info icon tooltip with disclaimer |
| `src/app/dashboard/DashboardClient.tsx` | Thread enrolled-programme IDs from session down to price fetch; pass to SlotTrueCost |

**Deliberately NOT changed:**
- `price_readings` table — effective price is computed on read, never stored
- `stations` table — brand stays raw; resolution happens at calculation time
- Cycle engine (SP-4) — uses pylon prices only; see §Sibling SP notes below
- SP-5 alerts design (SP-5's concern) — contract documented, not implemented here

---

## Tasks

### T1 — DB migrations
- [ ] Write `0018_user_programmes.sql`: create `user_programmes` table with PK `(user_id, programme_id)`, FK to `users(id)` ON DELETE CASCADE, `enabled_at TIMESTAMPTZ DEFAULT now()`, `paused BOOLEAN DEFAULT false`, `paused_until TIMESTAMPTZ`; add index `user_programmes_user_idx`
- [ ] Write `0019_unknown_brand_log.sql`: create `unknown_brand_log` table with `raw_brand TEXT PRIMARY KEY`, `count BIGINT DEFAULT 1`, `last_seen_at TIMESTAMPTZ DEFAULT now()`

### T2 — Brand alias JSON + resolver
- [ ] Write `src/lib/discount/brand-aliases.json` with `schema_version: 1` and `canonical_brands[]` array. Canonical codes to seed: `ampol`, `caltex`, `shell`, `shell_coles_express`, `eg_ampol`, `united`, `seven_eleven`, `bp`, `liberty`, `puma`, `metro`, `caltex_woolworths`. Each entry: `{code, display, aliases[]}` where aliases are lowercased, trimmed strings
- [ ] Write `src/lib/discount/registry.ts` with:
  - `BrandAliasSchema` (Zod) and `ProgrammeSchema` (Zod) matching the spec §4.2 shape
  - `loadBrandAliases()` — reads JSON, validates, builds `Map<string, string>` (alias → canonical code)
  - `resolveBrandCode(rawBrand: string | null): string` — trim/lowercase/collapse-whitespace/strip-punctuation → exact match → prefix match → "unknown" + upsert `unknown_brand_log`
  - `getRegistry()` — memoised on first call; returns validated programme list

### T3 — Programme registry JSON
- [ ] Write `src/lib/discount/programmes.json` with `schema_version: 1`, `generated_at`, and all 12 v1 programmes as per spec §3 table:
  - `seven_eleven_fuel_app`: rewards, 4¢/L, `seven_eleven` brand, all standard fuels
  - `racq`: membership, 4¢/L, `["ampol", "caltex"]` brands
  - `nrma`: membership, 4¢/L, `["ampol", "caltex"]`
  - `racv`: membership, 4¢/L, `["ampol", "caltex"]`
  - `raa`: membership, 4¢/L, `["ampol", "caltex"]`
  - `rac_wa`: membership, 4¢/L, `["ampol", "caltex"]`
  - `ract`: membership, 4¢/L, `["ampol", "caltex"]`
  - `woolworths_docket`: docket, 4¢/L, `["eg_ampol", "caltex_woolworths"]`
  - `coles_docket`: docket, 4¢/L, `["shell_coles_express"]`
  - `shell_vpower_rewards`: rewards, 4¢/L, `["shell"]`
  - `eg_ampolcash`: rewards, 6¢/L, `["eg_ampol"]`
  - `united_convenience`: rewards, 5¢/L, `["united"]`
  - All programmes: `stackable: false`, full conditions\_text, source\_url, last\_verified\_at, verified\_by
- [ ] Add Zod validation in `registry.ts` that runs at module load and hard-fails on schema error

### T4 — Calculator
- [ ] Write `src/lib/discount/calculator.ts`:
  - Export `EffectiveResult` interface: `{ effective_price_cents: number | null, applied_programme_id: string | null, applied_programme_name: string | null, applied_discount_cents: number, considered_programme_ids: string[] }`
  - Export `computeEffective(pylonCents: number | null, brandCode: string, fuelTypeId: string | number, enrolledIds: string[]): EffectiveResult`
  - Filtering: enrolled ∩ eligible_brand_codes ∩ eligible_fuel_types (support `"*"` wildcard)
  - Tie-breaking: 1) highest discount 2) fewest eligible\_brand\_codes (specificity) 3) non-docket preferred 4) lex order on id
  - Stacking (configurable, all stackable:false in v1): `nonStackBest + stackableSum`
  - Edge cases: null pylon → return null effective; discount > pylon → clamp to 0 + warn; no enrolled → return pylon

### T5 — Calculator golden tests
- [ ] Write `src/__tests__/discount/calculator.test.ts` covering every scenario in spec §13.1:
  - One programme applies (one fixture per programme = 12 fixtures)
  - Zero programmes apply → returns pylon
  - Two programmes apply, different discount → best wins
  - Two programmes apply, same discount → tie-break by specificity
  - Two programmes apply, same discount + same specificity → tie-break non-docket > docket
  - Two programmes apply, still tied → tie-break lex order on id
  - Stackable + non-stackable (mark one stackable in test only, not in registry)
  - Brand `"unknown"` → no application
  - Fuel-type excluded → no application
  - Discount > pylon → clamped to 0
  - Pylon null → returns null effective
  - User has zero enrolled → returns pylon, no registry lookup
  - `"*"` fuel wildcard → applies to any fuel type

### T6 — Registry validation tests
- [ ] Write `src/__tests__/discount/registry.test.ts`:
  - `programmes.json` parses cleanly against Zod schema
  - All `eligible_brand_codes` values are known canonical codes
  - `id` uniqueness
  - Every entry has non-null `source_url` and `last_verified_at`
- [ ] Write `src/__tests__/discount/brand-resolver.test.ts`:
  - Every alias in `brand-aliases.json` resolves to its canonical code
  - Uppercase, extra whitespace, dash-vs-space, punctuation variants for key brands
  - null input returns "unknown"
  - Genuinely unknown brand returns "unknown"

### T7 — API: /api/programmes (public)
- [ ] Write `src/app/api/programmes/route.ts` — GET handler returning the sanitised registry (all fields except `notes`); no auth required; no caching headers needed (loaded from module memory)

### T8 — API: /api/me/programmes (authed)
- [ ] Write `src/app/api/me/programmes/route.ts` — GET handler:
  - `getSession(req)` → 401 if null
  - Fetch `user_programmes` rows for the user
  - Merge with registry: for every programme in registry, produce merged row with `enrolled: boolean`, `paused: boolean`, `paused_until: string | null`
  - Return `{ programmes: MergedProgramme[] }`
- [ ] Write `src/app/api/me/programmes/[programmeId]/route.ts` — PUT handler:
  - `getSession(req)` → 401 if null
  - Validate `programmeId` against registry → 404 if unknown
  - Parse body `{ enabled: boolean, paused?: boolean, paused_until?: string | null }`
  - Upsert `user_programmes` row (INSERT ON CONFLICT DO UPDATE)
  - DELETE row if `enabled: false` (cleaner than a disabled flag)
  - Return 200 with the updated merged row
  - Also handle DELETE method (same as PUT with enabled:false)

### T9 — Augment /api/prices route
- [ ] Extend `PriceResult` interface in `src/lib/db/queries/prices.ts` with the five new fields (nullable when no session/no programmes)
- [ ] Add helper `applyEffectivePrices(results: PriceResult[], enrolledIds: string[]): PriceResult[]` that iterates results, calls `computeEffective()` per row (using `resolveBrandCode(station.brand)`), and attaches the new fields
- [ ] Modify `src/app/api/prices/route.ts` to: call `getSession(req)` (non-blocking — continue if null), load enrolled IDs from DB if session exists, pass to `applyEffectivePrices()`, return augmented results
- [ ] Unauthenticated or zero-enrolled: `effective_price_cents = price_cents`, `applied_programme_id = null`, `applied_discount_cents = 0`, `considered_programme_ids = []`

### T10 — SlotTrueCost real rendering
- [ ] Rewrite `src/components/slots/SlotTrueCost.tsx`:
  - Props: `station: PriceResult`, `context?: 'card' | 'popup' | 'detail'`
  - If `station.applied_programme_id` is null → render empty reserved line (preserve SP-3 layout footprint in card context; null in popup/detail)
  - If applied → in card: show `"You pay {effective}¢ · {programmeName}"` with struck-through pylon; in popup: show same with info icon
  - Disclaimer tooltip on info icon click: `"Discounts shown are typical; actual savings depend on programme terms."`
  - Programme chip: small pill, programme-type colour (membership=amber, docket=green, rewards=blue), max 12ch truncation
- [ ] Update `src/__tests__/slots/SlotComponents.test.tsx` to cover the new rendering paths (applied vs not-applied)

### T11 — Settings page /dashboard/settings/programmes
- [ ] Create `src/app/dashboard/settings/programmes/page.tsx` (server component shell + client child):
  - Page header: disclaimer `"Discounts shown are typical; actual savings depend on programme terms"` (§11.1 requirement)
  - Global pylon-only toggle ("Show pylon prices only") at top
  - Three sections: `Memberships`, `Dockets`, `Rewards`
  - Per row: name, eligible brand chips, discount summary, enabled toggle, (docket-only) paused toggle with "I have a docket right now" label, collapsible conditions text, "Last verified [date]" + source-link icon
  - Fetch from `/api/me/programmes`; PUTs on toggle

### T12 — Update StationCard + StationPopup
- [ ] `StationCard.tsx`: The `SlotTrueCost` component already receives `station` — no interface change needed if `PriceResult` is extended. Verify the existing prop threading is sufficient.
- [ ] `StationPopup.tsx`: Update the price headline block to:
  - If `applied_programme_id !== null`: display `effective_price_cents` as the big number; add a second line with struck pylon + programme name chip + info icon tooltip
  - Period-change calculation stays on pylon (per spec §9.2)
  - Chart Y-axis: no change (pylon market view)

### T13 — Lint + test sweep
- [ ] Run `npm run test:run` — target: all calculator golden tests pass, no regressions
- [ ] Run `npm run lint` — target: no new errors above the 42-error baseline
- [ ] Run `npm run build` — target: clean build

---

## Sibling SP notes (for SP-4, SP-5 reviewers)

**SP-4 Cycle engine:** Cycle signals MUST use `price_cents` (pylon). Never pass `effective_price_cents` to the cycle detector. The "FILL NOW" verdict chip can surface both: "FILL NOW — pylon $1.78, you pay $1.74 with RACQ." That display-layer concern is SP-4's to implement.

**SP-5 Alerts:** Threshold alerts default to `effective_price_cents`. Per-alert override: `compare_against: "effective" | "pylon"`. The alert copy must state the basis: "U91 dropped below $1.80 (effective with RACQ) at Ampol Chermside — pylon is $1.84." This API contract is SP-5's to honour; SP-6 just provides the data.

**SP-7 Trip:** Trip candidate stations rank by `effective_price_cents` when available (the primary user-value benefit of D4). SP-7 implementation responsibility.

---

## Enrolment cache strategy

- Per-user enrolled IDs: fetched from DB on first authenticated price request per server instance lifetime. In practice: at Next.js request time, we query `user_programmes` once per request (no long-lived server state in Next.js edge model).
- Registry: loaded once at module initialisation, cached in module scope (restart required to pick up registry changes, which only happen on redeploy).
- No Redis / KV needed for v1.

---

## ACL disclaimer placement checklist (§11.1)

- [x] Settings page header (T11)
- [x] Popup info-icon tooltip (T10)
- [ ] Alert email footer — SP-5's responsibility; documented here for handoff
- [ ] Share-card footer — SP-8's responsibility; documented here for handoff

---

## Feature flag

`FILLIP_TRUE_COST=1` env var gates the effective-price computation. When unset: `applyEffectivePrices()` is a no-op (returns pylon-only results). Allows week-1 internal rollout before QLD beta.
