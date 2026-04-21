# Fillip SP-1 — National Data Adapters

**Status:** Draft v1
**Date:** 2026-04-22
**Author:** cdenn
**Parent:** [Fillip Master Design](./2026-04-22-fillip-master-design.md) §5.2
**Type:** Sub-project design spec
**Branch (when started):** `sp1-national-data`

---

## 1. Purpose & scope

Extend Fillip's ingestion layer from **QLD-only** to **national MVP coverage** (~75% of AU population, all data legally sourced from free government APIs).

### In scope
- New `FuelPriceProvider` adapters for: **NSW**, **WA**, **NT**, **TAS**, **ACT** (ACT piggybacks on NSW).
- `stations` schema additions for jurisdiction (state/region).
- Per-state scheduling (cadence varies — WA is daily, the rest are near-real-time).
- A first-class representation of WA's **T+1 day-ahead** pricing semantic.
- Per-adapter health, observability, and backfill where feasible.
- Migration of the existing QLD station rows into the new jurisdiction model.
- Test fixtures + mock harness per state.

### Out of scope (deferred — see master §5.2)
- **SA** and **VIC** (no government API — Phase 2, requires commercial licence or scrape).
- **NZ** (Phase 3).
- Cycle-detection or alert wiring on top of the new data (SP-4 / SP-5).
- UI changes to expose state filters or non-QLD geographies (touched by SP-3 UX).
- Any change to QLD ingestion semantics — QLD is the **contract reference**; we extend, not replace.

### Success criteria
1. All 5 MVP jurisdictions present in `stations` with `sourceProvider` correctly set.
2. `price_readings` receives rows from each provider on its expected cadence with no schema diverges.
3. WA T+1 prices are queryable as both "valid today" and "valid tomorrow" without polluting historical analytics.
4. Per-provider success/failure visible via `scrape_health` and a per-provider `/api/health` endpoint.
5. Existing QLD dashboard, alerts, trip planner continue to function unchanged.

---

## 2. Existing contract — the anchor

The provider interface already exists at `src/lib/providers/fuel/index.ts`:

```ts
export interface FuelPriceProvider {
  readonly id: string
  readonly displayName: string
  fetchStations(): Promise<NormalisedStation[]>
  fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]>
  healthCheck(): Promise<ProviderHealth>
}
```

The scheduler (`src/lib/scraper/scheduler.ts`) iterates `getProviders()` and dispatches each to `runProviderScrape(provider)` in `writer.ts`. `writer.ts` handles station upsert (by `id`), price deduplication (by `station_id + fuel_type_id + source_ts`), and `scrape_health` logging.

**Implication:** SP-1 is *primarily* a "write 4-5 new provider implementations" exercise. The hard problems are not the contract but: (a) station ID space collisions, (b) WA's T+1 semantics, (c) per-state cadence, and (d) brand/fuel-type vocabulary normalisation across providers.

---

## 3. Design

### 3.1 Station ID space

**Problem:** today `stations.id INTEGER` is the QLD `SiteId`. NSW, WA, NT, TAS each have their own integer ID spaces that **will** collide (e.g. NSW SiteId 12 and QLD SiteId 12 are different stations).

**Decision (recommended default):** introduce a synthetic surrogate primary key and demote the upstream identifier.

- New `stations.id BIGSERIAL PRIMARY KEY` (synthetic).
- Existing `external_id` (already present, `text`) + new `source_provider` form a composite UNIQUE.
- All FKs (currently only `price_readings.station_id`) repoint to the new surrogate.
- `price_readings.station_id` becomes `BIGINT`.

This is a breaking migration but unavoidable — collision is a correctness bug, not a UX nit. Migration plan in §6.

### 3.2 Stations table additions

```
ALTER TABLE stations ADD COLUMN state          VARCHAR(3)  NOT NULL DEFAULT 'QLD';
ALTER TABLE stations ADD COLUMN region         TEXT;        -- LGA / district where the source provides one
ALTER TABLE stations ADD COLUMN jurisdiction   TEXT;        -- normalised: 'AU-QLD', 'AU-NSW', 'AU-WA', 'AU-NT', 'AU-TAS', 'AU-ACT'
ALTER TABLE stations ADD COLUMN timezone       TEXT;        -- IANA TZ — needed for cycle/alert math
ALTER TABLE stations ADD COLUMN source_metadata JSONB;      -- raw provider blob for debugging / future enrichment
```

`timezone` matters because each state has different DST rules (Brisbane no DST; Sydney/Hobart/Canberra DST; Perth no DST; Darwin no DST). The existing `toBrisbaneHour()` helper must be generalised to `toLocalHour(tz)`.

### 3.3 Common adapter contract — clarifications

The existing interface is sufficient *but* needs three additions for SP-1:

1. **`cadence: { intervalMinutes: number; jitterSec?: number }`** — declared per provider; the scheduler uses this to decide when to invoke. Removes hard-coded 15 min from scheduler.
2. **`fetchPrices(recordedAt)` may return rows with a non-null `validFrom`** — see §3.4.
3. **`brandNormaliser`** — each provider plugs into the existing `src/lib/providers/fuel/brand-normaliser.ts` to map raw upstream brand strings into Fillip's canonical brand vocabulary (`Shell`, `7-Eleven`, `Ampol`, `BP`, `United`, `Liberty`, `Caltex` (legacy), `Independent`, `Other`).

A single new file `src/lib/providers/fuel/types.ts` documents these additions; existing types unchanged for QLD.

### 3.4 WA T+1 — the semantic quirk

**Background:** under the WA *Petroleum Products Pricing Amendment Act 2007*, retailers must notify the FuelWatch service of **tomorrow's** prices by 14:00 WST today. Tomorrow's prices then become effective from 06:00 WST tomorrow. So at any moment FuelWatch has at most two prices per station+fuel: today's (locked) and tomorrow's (announced).

**Recommended representation:** add a nullable `valid_from` column to `price_readings`, defaulting to `recorded_at` for non-WA providers.

```
ALTER TABLE price_readings ADD COLUMN valid_from TIMESTAMPTZ;
UPDATE  price_readings SET valid_from = recorded_at WHERE valid_from IS NULL;
ALTER TABLE price_readings ALTER COLUMN valid_from SET NOT NULL;
ALTER TABLE price_readings ALTER COLUMN valid_from SET DEFAULT NOW();
CREATE INDEX price_readings_valid_from_idx ON price_readings (station_id, fuel_type_id, valid_from DESC);
```

**Semantics:**
- For QLD/NSW/NT/TAS/ACT: `valid_from = source_ts ≈ recorded_at`. No behaviour change.
- For WA: `valid_from = upstream "PriceUpdatedFrom"` (which will be 06:00 WST of the effective day). For tomorrow's announcements, `valid_from > recorded_at`.

**Query pattern:** "current price" becomes `WHERE valid_from <= NOW() ORDER BY valid_from DESC LIMIT 1`. "Tomorrow's announced price" becomes `WHERE valid_from > NOW() ORDER BY valid_from ASC LIMIT 1`.

**Why a column, not a separate table?** A separate `announced_prices` table would force every "current price" query to UNION two sources forever after WA launches. A nullable-then-defaulted column keeps the hot path single-table. The added index is narrow.

**Alternative considered:** `is_announced BOOLEAN` flag. Rejected — `valid_from` carries strictly more information (you can derive the boolean as `valid_from > NOW()`).

**Decision pending:** whether to surface "tomorrow's price" in the UI from day one or hide it behind a feature flag until SP-3 designs the affordance. Default: **store but don't display** in SP-1.

### 3.5 Fuel type vocabulary

QLD uses integer `FuelId` codes (FuelTypeId 2 = U91, 5 = Diesel, etc.). NSW uses string codes (`U91`, `P95`, `P98`, `DL`, `EDL` etc.). WA uses similar string codes but with quirks (`ULP` vs `U91`).

**Decision (recommended default):** introduce a single canonical fuel-type table `fuel_types` (id INT PK, code TEXT, display_name TEXT) seeded with Fillip's vocabulary, and a per-provider lookup that maps upstream codes → canonical IDs. `price_readings.fuel_type_id` continues to reference the canonical ID.

This is a small migration but unblocks all non-QLD adapters cleanly.

---

## 4. Per-state adapter design

All adapters live under `src/lib/providers/fuel/{state}/` mirroring the existing `qld/` layout: `client.ts` (HTTP), `normaliser.ts` (mapping), `provider.ts` (the `FuelPriceProvider` impl), `__tests__/fixtures.json`.

### 4.1 NSW — FuelCheck (NSW Government)

| Field | Value |
|---|---|
| Auth | `apikey` + `transactionid` headers; OAuth client_credentials for token refresh |
| Base URL | `https://api.onegov.nsw.gov.au/FuelPriceCheck/v2/...` |
| Endpoints | `/fuel/prices` (full snapshot) ; `/fuel/prices/new` (deltas since timestamp) |
| Format | JSON |
| Fuel codes | `U91`, `P95`, `P98`, `DL`, `PDL`, `B20`, `LPG`, `E10`, `E85`, `EV` (EV ignored for v1) |
| Rate limit | 5 req/sec, soft daily cap; effectively unbounded for our use |
| Cadence | 15 min — same as QLD |
| Coverage | NSW + ACT (ACT stations carry `state: ACT` in the payload — see §4.5) |
| Backfill | None — API is current-state only. Historical is in the public NSW Open Data CSV dump (separate, monthly). |
| Cost | Free, requires registration |

**Provider id:** `nsw`
**Notes:** OAuth tokens last 12 hours — adapter caches and refreshes ~30 min before expiry. Use `/prices/new?timestamp=…` after first full-snapshot fetch to minimise payload.

### 4.2 WA — FuelWatch (WA Government)

| Field | Value |
|---|---|
| Auth | None |
| Base URL | `https://www.fuelwatch.wa.gov.au/api/sites` (JSON) and `/fuelWatchRSS` (legacy RSS) |
| Format | JSON preferred; RSS as fallback (some endpoints are RSS-only) |
| Fuel codes | `ULP`, `PULP` (95), `98RON`, `Diesel`, `LPG`, `B20`, `E85`, `Brand diesel` |
| Rate limit | Not documented; conservative 1 req/min |
| Cadence | **Once daily, ~14:30 WST**, after the 14:00 deadline. A second poll at ~06:30 WST confirms today's effective prices are correct. |
| Coverage | All WA stations |
| Backfill | Yes — `/fuelWatchRSS?Day=yesterday&Region=…` supports historical day queries (limited window) |
| Cost | Free |

**Provider id:** `wa`
**T+1 handling:** see §3.4. Each fetched record has a `date` field that becomes `valid_from`. The 14:30 fetch returns *tomorrow's* prices (`valid_from = tomorrow 06:00 WST`); the 06:30 fetch confirms *today's* (`valid_from = today 06:00 WST`).

### 4.3 NT — MyFuel NT

| Field | Value |
|---|---|
| Auth | API key (free, by request via NT Govt portal) |
| Base URL | `https://myfuelnt.nt.gov.au/Api/...` (subject to confirmation — see §10) |
| Format | JSON |
| Fuel codes | `U91`, `U95`, `U98`, `Diesel`, `LPG`, `Premium Diesel` |
| Rate limit | Undocumented; conservative 1 req/min |
| Cadence | 30 min — low station count makes 15 min wasteful |
| Coverage | All NT stations (~150 stations total — small dataset) |
| Backfill | No public bulk endpoint known |
| Cost | Free |

**Provider id:** `nt`

### 4.4 TAS — FuelCheck TAS

| Field | Value |
|---|---|
| Auth | API key (Govt registration, similar process to NSW) |
| Base URL | `https://www.fuelcheck.tas.gov.au/api/...` |
| Format | JSON (mirrors the NSW FuelCheck API closely — same vendor) |
| Fuel codes | Same set as NSW FuelCheck |
| Rate limit | Same as NSW — 5 req/sec soft |
| Cadence | 15 min |
| Coverage | All TAS stations (~250) |
| Backfill | None real-time; bulk CSV via TAS Open Data |
| Cost | Free |

**Provider id:** `tas`
**Implementation note:** because TAS FuelCheck reuses the NSW vendor stack, the `tas` adapter shares `client.ts` helpers with `nsw` via a shared `src/lib/providers/fuel/_fuelcheck/` module — but registers as a distinct provider with its own credentials and `state: TAS`.

### 4.5 ACT — derived from NSW

ACT stations are returned by NSW FuelCheck (the API covers both jurisdictions). ACT does not have its own API.

**Implementation:** no separate adapter. Inside the NSW normaliser, classify each station by postcode/state:
- Postcode in `2600-2620, 2900-2920` → `state: ACT`, `jurisdiction: AU-ACT`, `timezone: Australia/Sydney` (ACT shares Sydney TZ).
- Otherwise → `state: NSW`.

Station ingest will create both ACT and NSW rows under `sourceProvider: 'nsw'`. The `state` column distinguishes them for UI filtering.

**Provider id (logical):** `act` is a *view*, not a registered provider. Health rolls up under `nsw`.

---

## 5. Scheduler changes

Today: a single `*/15 * * * *` cron iterates all providers serially. This will break when WA only wants to run twice a day.

**Recommended default:** drive the scheduler from per-provider `cadence` declarations. Each provider exposes a `cronSpec` (and optional `timezone`) and the scheduler registers a separate `cron.schedule()` per provider.

```ts
const PROVIDERS: ProviderSchedule[] = [
  { provider: new QldFuelProvider(), cron: '*/15 * * * *', tz: 'Australia/Brisbane' },
  { provider: new NswFuelProvider(), cron: '*/15 * * * *', tz: 'Australia/Sydney' },
  { provider: new TasFuelProvider(), cron: '*/15 * * * *', tz: 'Australia/Hobart' },
  { provider: new NtFuelProvider(),  cron: '*/30 * * * *', tz: 'Australia/Darwin' },
  { provider: new WaFuelProvider(),  cron: '30 14,6 * * *', tz: 'Australia/Perth' },
]
```

`noOverlap: true` is set per-job (already supported by node-cron v4.2.1). Immediate-on-startup behaviour (D-11) preserved per provider.

**Concurrency:** running providers concurrently is *safe* because `runProviderScrape` already filters insertions by `(station_id, fuel_type_id, source_ts)`. We will, however, stagger startup pings by 30 s each to avoid hammering DB connection pool on cold boot.

**Healthchecks.io:** the existing single ping URL becomes per-provider `HEALTHCHECKS_PING_URL_{QLD,NSW,WA,NT,TAS}`. If a provider env var is unset, no ping is sent for that provider (silent no-op, same as today).

---

## 6. Migration plan for existing QLD data

Migrations live in `src/lib/db/migrations/` as plain SQL (see CLAUDE.md). Numbering picks up after the current highest (assume `0006_*`).

| # | File | Contents | Notes |
|---|---|---|---|
| 0006 | `0006_fuel_types.sql` | CREATE TABLE `fuel_types`; seed canonical vocabulary; add `fuel_type_id` FK constraint | Must run before stations changes |
| 0007 | `0007_stations_jurisdiction.sql` | ADD COLUMNs `state`, `region`, `jurisdiction`, `timezone`, `source_metadata`; backfill all existing rows to `QLD/AU-QLD/Australia/Brisbane` | Safe — `DEFAULT 'QLD'` on add |
| 0008 | `0008_stations_surrogate_pk.sql` | Add `BIGSERIAL` surrogate `id_new`; add unique on `(source_provider, external_id)`; rewrite FK on `price_readings`; rename `id_new` → `id` | **Disruptive — requires brief downtime, run during nightly maintenance window** |
| 0009 | `0009_price_readings_valid_from.sql` | ADD COLUMN `valid_from`; backfill = `recorded_at`; SET NOT NULL; create index | Safe online migration on a Timescale hypertable (requires per-chunk loop — see Timescale docs) |
| 0010 | `0010_provider_health.sql` | ADD COLUMN `provider TEXT NOT NULL DEFAULT 'qld'` to `scrape_health`; add index `(provider, scraped_at DESC)` | Health observability per §7 |

**Order matters.** 0008 is the only risky one. Recommend:
1. Schedule a 5-min maintenance window.
2. `pg_dump` snapshot first (the existing `db-backup` sidecar covers this — confirm a recent backup exists before cutover).
3. Run 0008 during the window; verify row counts pre/post.

**Rollback:** all migrations have an inverse `down.sql` committed alongside; 0008's down requires recreating the original integer FK with QLD `external_id`. Tested in CI against a seeded fixture DB.

---

## 7. Health & observability

Per master spec each adapter is independently observable.

### 7.1 `scrape_health` per provider
Add `provider` column (migration 0010). Existing UI in `/api/health` aggregates last successful run per provider.

### 7.2 `/api/health` extension
Today returns a single heartbeat. Extend to:
```json
{
  "providers": {
    "qld":  { "status": "ok", "lastSuccessAt": "...", "lastError": null,  "rowsLastRun": 1820 },
    "nsw":  { "status": "ok", "lastSuccessAt": "...", "lastError": null,  "rowsLastRun": 2614 },
    "wa":   { "status": "degraded", "lastSuccessAt": "...", "lastError": "RSS 503", "rowsLastRun": 0 },
    ...
  },
  "overall": "degraded"
}
```

### 7.3 Per-provider Healthchecks.io
Each provider gets its own check + grace period matching its cadence (15 min providers → 20 min grace; WA → 26 hours grace). Failure of any one provider does not silently mask others.

### 7.4 Logging
All adapter logs prefix with `[scraper:<provider-id>]` (already the convention in `writer.ts`). Structured fields: `provider`, `runId`, `durationMs`, `pricesUpserted`, `stationsUpserted`, `apiCalls`.

---

## 8. Backfill strategy

Backfill is **best-effort, not blocking** for SP-1 launch. Each adapter that has a historical source will get a one-shot `npm run backfill:<provider> -- --from YYYY-MM-DD --to YYYY-MM-DD` script under `src/lib/scraper/backfill/`.

| Provider | Source | Plan |
|---|---|---|
| QLD | CKAN monthly CSV (already integrated — `ckan-client.ts`) | Reuse existing code; backfill last 90 days during initial rollout |
| NSW | NSW Open Data — monthly CSV exports | New downloader script; CSV → normaliser → bulk insert |
| WA | FuelWatch RSS with `Day=` parameter | Iterate days, conservative throttle |
| NT | None known | Skip — start collecting from day one |
| TAS | TAS Open Data CSV | Same shape as NSW backfill |
| ACT | Inherits from NSW backfill | Filtered by postcode |

Backfill rows distinguished by `source_provider = 'qld-backfill'` etc. — keeps live vs. backfill traceable. Backfill runs are *not* tracked in `scrape_health` (would distort SLO numbers).

---

## 9. Test strategy

Existing tests live in `src/__tests__/` (Vitest). Pattern per adapter:

1. **Fixture-based unit tests** (`src/lib/providers/fuel/{state}/__tests__/`):
   - One real captured response payload per endpoint (`fixtures/sites.json`, `fixtures/prices.json`).
   - Tests cover: schema validation, brand normalisation, fuel-type mapping, price encoding edge cases, ACT-from-NSW classification.
2. **Contract tests** (shared, `src/__tests__/providers/contract.test.ts`):
   - For every registered provider, assert: returns valid `NormalisedStation[]`, `priceCents` falls in 50–400 range, `fuel_type_id` resolves to canonical table.
3. **WA T+1 specific tests**:
   - Insert one announced + one effective price; assert "current price" query returns effective; assert "announced" query returns announced.
   - Time-travel via `vi.useFakeTimers()` to verify what was "tomorrow" becomes "current" the next day.
4. **Migration tests**:
   - Spin up empty Postgres; run all migrations 0000→0010; assert FK integrity; insert sample QLD row; verify dashboard query path still returns it.
5. **Scheduler tests**:
   - Mock `cron.schedule`; assert each provider gets its declared cadence.

Mock fixtures captured via a helper script `npm run capture:provider -- nsw` that hits the live API once and writes a redacted payload.

---

## 10. Open questions (with recommended defaults)

| # | Question | Recommended default | Status |
|---|---|---|---|
| Q1 | Surrogate PK migration — is the brief downtime acceptable? | Yes; schedule for 02:00 Brisbane window during the nightly cron. | **decision pending** — Chris signoff |
| Q2 | Display WA T+1 "tomorrow" price in v1 UI? | No — store, don't display. SP-3 owns the affordance. | **decision pending** |
| Q3 | Per-state cadence vs. single 15-min loop? | Per-state (declarative `cronSpec`). | proposed |
| Q4 | NT API base URL & auth flow — confirmed? | Need confirmation; treat as unknown until SP-1 kickoff WebFetch. | **blocking unknown** |
| Q5 | NSW + TAS sharing `_fuelcheck/` helpers — overengineering? | No — same vendor, identical schema. Worth ~200 LoC reuse. | proposed |
| Q6 | Brand normalisation — existing `brand-normaliser.ts` covers all states? | Audit during impl; expect 5–10 new mappings (e.g. WA's `Better Choice`, NT's `Puma`). | proposed |
| Q7 | Should we accept ACT as a registered provider id (for symmetry) even though it has no fetch logic? | No — keep it as a derived `state` only. Two ids confuse the registry. | proposed |
| Q8 | Backfill — block launch on it? | No — best-effort, ships incrementally after SP-1. | proposed |
| Q9 | Per-provider Healthchecks check IDs — who creates them? | Chris, before merge. Provision via env vars only. | **decision pending** |
| Q10 | Do we need a `state_coverage` config table for the UI to know which jurisdictions are "live"? | Yes — small, but cleaner than hard-coding in the UI. SP-3 will consume it. | proposed |

---

## 11. Dependencies on other sub-projects

- **SP-0 (rebrand):** none — adapters are infra. Can ship in parallel.
- **SP-3 (UX core):** SP-3 will need the `state` field to render state filters and a "national availability" badge. SP-1 must land the schema migration before SP-3's UI depth-charges into national maps.
- **SP-4 (cycle engine):** consumes `(suburb, fuel, day)` aggregates — needs canonical `fuel_types`, which SP-1 introduces.
- **SP-5 (alerts):** consumes per-station price changes — provider-agnostic via the existing `price_readings` schema.

SP-1 is on the critical path for SP-3 and SP-4; not a blocker for SP-2 (auth).

---

## 12. Rollout plan (high level — implementation plan owns the detail)

1. **Week 1:** schema migrations 0006–0010 + fuel-type vocab + scheduler refactor. QLD continues to scrape; no behaviour change for users.
2. **Week 2:** NSW adapter (covers ACT). First non-QLD provider live behind a `FILLIP_ENABLE_NSW=true` flag. Health monitored for 48h before flag removed.
3. **Week 3:** TAS + NT adapters (small datasets, low risk).
4. **Week 4:** WA adapter + T+1 query path validation. End-to-end check that `/api/prices` returns correct "current" prices nationally.
5. **Week 5:** backfill scripts + CKAN-equivalent historical loads for NSW/WA/TAS.

Each week's slice is independently revertable via the feature flag and the per-provider Healthchecks alarms.

---

## 13. Explicit non-goals (restating)

- No SA / VIC / NZ in this sub-project.
- No UI work — `state` and `valid_from` are stored but not surfaced (SP-3 owns surfacing).
- No alert / cycle / trip integration — those sub-projects consume what SP-1 produces.
- No change to QLD ingestion semantics. The QLD adapter is the contract reference and stays unchanged except for receiving the `state='QLD'` backfill in migration 0007.
