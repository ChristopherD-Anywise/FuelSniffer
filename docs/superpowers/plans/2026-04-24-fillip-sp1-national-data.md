# Fillip SP-1 — National Data Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Fillip's ingestion layer from QLD-only to national MVP coverage — NSW, WA, NT, TAS, and ACT (via NSW). Add the schema foundations (PostGIS geom column, surrogate PK, fuel_types table, valid_from column, per-provider scrape_health) that SP-3, SP-4, and SP-5 depend on. Refactor the scheduler to per-provider cadence. Extend /api/health to per-provider status.

**Spec:** `/Users/cdenn/Projects/FuelSniffer/docs/superpowers/specs/2026-04-22-fillip-sp1-national-data-design.md`

**Branch:** `sp1-national-data` (worktree at `/Users/cdenn/Projects/FuelSniffer/.worktrees/sp1`)

**Baseline (SP-0):** 207 tests passing, 4 DB-dependent file failures (expected), 38 lint errors.

**Architecture:** QLD remains the contract reference and is not functionally changed. New providers (NSW/TAS share `_fuelcheck/` helpers; WA uses FuelWatch JSON API; NT uses stub pending Q4 verification) are added alongside. The scheduler grows from a single 15-min cron to per-provider cron entries. The `stations` table gains `state`, `jurisdiction`, `timezone`, `source_metadata` columns. A new `fuel_types` lookup table bridges integer (QLD) vs string (NSW/WA) fuel codes. `price_readings` gains `valid_from` for WA T+1 semantics. `scrape_health` gains a `provider` column.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Drizzle ORM · PostgreSQL 17 + PostGIS · node-cron v4 · axios · Zod · Vitest.

**NT API status:** Q4 in spec is open — the NT MyFuel API base URL is unconfirmed. Implementation will produce a best-guess stub adapter with a `FILLIP_ENABLE_NT=true` feature flag; the stub throws a clearly-labelled `NtApiUnverified` error until the URL is confirmed out-of-band by Chris.

---

## File Structure

**Files created** (all under `fuelsniffer/`):

| Path | Responsibility |
|---|---|
| `src/lib/providers/fuel/types.ts` | Extended SP-1 types: `NormalisedStation` additions (state/jurisdiction/timezone), `NormalisedPrice` addition (validFrom), `ProviderSchedule` interface |
| `src/lib/providers/fuel/_fuelcheck/client.ts` | Shared FuelCheck HTTP helpers (used by both NSW and TAS) |
| `src/lib/providers/fuel/_fuelcheck/normaliser.ts` | Shared FuelCheck normalisation helpers |
| `src/lib/providers/fuel/nsw/client.ts` | NSW FuelCheck OAuth + HTTP client |
| `src/lib/providers/fuel/nsw/normaliser.ts` | NSW → canonical mapping (fuel codes, brands, ACT postcode classification) |
| `src/lib/providers/fuel/nsw/provider.ts` | `NswFuelProvider` implementing `FuelPriceProvider` |
| `src/lib/providers/fuel/nsw/__tests__/fixtures/sites.json` | Captured NSW station payload fixture (redacted) |
| `src/lib/providers/fuel/nsw/__tests__/fixtures/prices.json` | Captured NSW price payload fixture (redacted) |
| `src/lib/providers/fuel/nsw/__tests__/normaliser.test.ts` | NSW normaliser unit tests |
| `src/lib/providers/fuel/nsw/__tests__/provider.test.ts` | NSW provider integration tests (mocked HTTP) |
| `src/lib/providers/fuel/tas/client.ts` | TAS FuelCheck client (thin wrapper of `_fuelcheck/client.ts`) |
| `src/lib/providers/fuel/tas/normaliser.ts` | TAS-specific mappings |
| `src/lib/providers/fuel/tas/provider.ts` | `TasFuelProvider` implementing `FuelPriceProvider` |
| `src/lib/providers/fuel/tas/__tests__/fixtures/sites.json` | TAS station payload fixture |
| `src/lib/providers/fuel/tas/__tests__/fixtures/prices.json` | TAS price payload fixture |
| `src/lib/providers/fuel/tas/__tests__/normaliser.test.ts` | TAS normaliser unit tests |
| `src/lib/providers/fuel/wa/client.ts` | WA FuelWatch JSON API client |
| `src/lib/providers/fuel/wa/normaliser.ts` | WA → canonical mapping (fuel codes, T+1 validFrom logic) |
| `src/lib/providers/fuel/wa/provider.ts` | `WaFuelProvider` implementing `FuelPriceProvider` |
| `src/lib/providers/fuel/wa/__tests__/fixtures/sites.json` | WA station fixture |
| `src/lib/providers/fuel/wa/__tests__/fixtures/prices.json` | WA price fixture (includes tomorrow T+1 entry) |
| `src/lib/providers/fuel/wa/__tests__/normaliser.test.ts` | WA normaliser + T+1 semantics tests |
| `src/lib/providers/fuel/nt/client.ts` | NT MyFuel stub client (throws `NtApiUnverified` until Q4 resolved) |
| `src/lib/providers/fuel/nt/normaliser.ts` | NT mappings (best-guess, mirrors NSW shape) |
| `src/lib/providers/fuel/nt/provider.ts` | `NtFuelProvider` implementing `FuelPriceProvider` |
| `src/lib/providers/fuel/nt/__tests__/provider.test.ts` | NT provider tests (verifies stub throws + feature flag no-op) |
| `src/__tests__/providers/contract.test.ts` | Cross-provider contract: every registered provider passes shape checks |
| `src/__tests__/providers/wa-valid-from.test.ts` | WA T+1 query semantics (fake timers) |
| `src/__tests__/providers/scheduler.test.ts` | Per-provider cron registration assertions |
| `src/lib/db/migrations/0013_fuel_types.sql` | CREATE TABLE fuel_types; seed canonical vocab; FK on price_readings |
| `src/lib/db/migrations/0014_stations_jurisdiction.sql` | ADD state/region/jurisdiction/timezone/source_metadata; backfill QLD rows |
| `src/lib/db/migrations/0015_stations_surrogate_pk.sql` | BIGSERIAL surrogate PK; unique (source_provider, external_id); rewrite FK |
| `src/lib/db/migrations/0016_price_readings_valid_from.sql` | ADD valid_from; backfill; NOT NULL; index |
| `src/lib/db/migrations/0017_scrape_health_provider.sql` | ADD provider column to scrape_health; backfill 'qld'; index |

**Files modified:**

| Path | Change |
|---|---|
| `src/lib/providers/fuel/index.ts` | Add extended types from `types.ts`; re-export `ProviderSchedule` |
| `src/lib/providers/fuel/brand-normaliser.ts` | Add WA `Better Choice`, NT `Puma Energy`, NSW additional brands |
| `src/lib/db/schema.ts` | Add `state`, `jurisdiction`, `timezone`, `sourceMetadata` to `stations`; add `validFrom` to `priceReadings`; add `provider` to `scrapeHealth`; add `fuelTypes` table |
| `src/lib/scraper/scheduler.ts` | Per-provider `ProviderSchedule[]` with individual cron entries; staggered startup pings |
| `src/lib/scraper/writer.ts` | Pass `provider` to `scrapeHealth` insert; per-provider healthchecks.io ping URL |
| `src/app/api/health/route.ts` | Extend to per-provider response shape |
| `src/__tests__/health.test.ts` | Extend existing tests to cover per-provider shape |

**Deliberately NOT changed:**
- QLD provider code (`src/lib/providers/fuel/qld/`) — contract reference, untouched
- QLD scrape semantics — `validFrom` defaults to `recordedAt` for QLD via migration backfill
- Auth, dashboard UI, trip planner — SP-1 is infra-only
- Existing migration files 0000–0012

---

## Task 0: Confirm baseline

**Files:** none (read-only checks)

- [ ] **Step 1: Confirm branch and worktree**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git branch --show-current
# Expected: sp1-national-data
```

- [ ] **Step 2: Run baseline tests**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer
npm run test:run 2>&1 | tail -8
# Expected: Tests 207 passed, 4 files failed (DATABASE_URL)
```

- [ ] **Step 3: Run baseline lint**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer
npm run lint 2>&1 | tail -3
# Expected: 38 errors, N warnings
```

---

## Task 1: Extended provider types

**Files created:** `src/lib/providers/fuel/types.ts`
**Files modified:** `src/lib/providers/fuel/index.ts`

This task adds the SP-1 type additions to the provider contract without touching any existing QLD code. The `NormalisedStation` interface gains optional fields; `NormalisedPrice` gains optional `validFrom`; `ProviderSchedule` is introduced for the scheduler refactor.

- [ ] **Step 1: Create `src/lib/providers/fuel/types.ts`**

```typescript
/**
 * SP-1 extended provider types.
 *
 * These additions extend the base FuelPriceProvider contract for national
 * adapters. All new fields are optional so existing QLD code compiles unchanged.
 */

/** Canonical jurisdiction codes used across all providers. */
export type Jurisdiction =
  | 'AU-QLD'
  | 'AU-NSW'
  | 'AU-WA'
  | 'AU-NT'
  | 'AU-TAS'
  | 'AU-ACT'

/**
 * Extended NormalisedStation fields added in SP-1.
 * The base `NormalisedStation` in index.ts keeps `state` and `suburb`
 * as plain strings. These optional additions carry SP-1 metadata.
 */
export interface StationJurisdictionFields {
  /** Two/three-letter state code: QLD, NSW, WA, NT, TAS, ACT */
  state?: string
  /** LGA / district where the source provides one */
  region?: string | null
  /** Canonical jurisdiction code, e.g. AU-NSW */
  jurisdiction?: Jurisdiction
  /** IANA timezone string, e.g. Australia/Sydney */
  timezone?: string
  /** Raw provider blob for debugging / future enrichment */
  sourceMetadata?: Record<string, unknown> | null
}

/**
 * WA T+1 extension for NormalisedPrice.
 * For all non-WA providers: validFrom = sourceTs = recordedAt (effectively).
 * For WA: validFrom = upstream "PriceUpdatedFrom" (06:00 WST of effective day).
 */
export interface PriceValidFromField {
  /** When this price becomes (or became) effective. Defaults to recordedAt if omitted. */
  validFrom?: Date
}

/**
 * Per-provider schedule declaration.
 * The scheduler uses this to register a separate cron.schedule() per provider.
 */
export interface ProviderSchedule {
  /** node-cron cron expression */
  cron: string
  /** IANA timezone for the cron expression */
  timezone: string
}

/**
 * Canonical fuel type vocabulary.
 * Maps provider-specific codes to Fillip's canonical IDs.
 * QLD uses integer FuelId codes; NSW/WA/NT/TAS use string codes.
 */
export interface CanonicalFuelType {
  id: number
  code: string
  displayName: string
}

/**
 * Fuel type mapping for a provider.
 * Each provider supplies a map from its upstream code/id to a canonical FuelType id.
 */
export type FuelTypeMap = Map<string | number, number>
```

- [ ] **Step 2: Update `src/lib/providers/fuel/index.ts` to import and re-export SP-1 types**

Add to the existing interfaces:
- Import `StationJurisdictionFields`, `PriceValidFromField`, `ProviderSchedule` from `./types`
- Extend `NormalisedStation` with `StationJurisdictionFields`
- Extend `NormalisedPrice` with `PriceValidFromField`
- Re-export `ProviderSchedule`, `Jurisdiction`, `FuelTypeMap`, `CanonicalFuelType`

The key change to `index.ts`:

```typescript
// Add at top:
import type {
  StationJurisdictionFields,
  PriceValidFromField,
  ProviderSchedule,
  Jurisdiction,
  FuelTypeMap,
  CanonicalFuelType,
} from './types'

// NormalisedStation becomes:
export interface NormalisedStation extends StationJurisdictionFields {
  id: number
  externalId: string
  sourceProvider: string
  name: string
  brand: string | null
  address: string | null
  suburb: string | null     // MUST be lower(suburb) per SP-0 §0 amendment
  postcode: string | null
  latitude: number
  longitude: number
}

// NormalisedPrice becomes:
export interface NormalisedPrice extends PriceValidFromField {
  stationId: number
  fuelTypeId: number
  priceCents: string
  recordedAt: Date
  sourceTs: Date
  sourceProvider: string
}

// Re-exports at bottom:
export type { ProviderSchedule, Jurisdiction, FuelTypeMap, CanonicalFuelType }
```

- [ ] **Step 3: Verify existing tests still pass (NormalisedStation/Price shape is backward-compat)**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run test:run 2>&1 | tail -8
# Expected: still 207 passing, no new failures
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/providers/fuel/types.ts fuelsniffer/src/lib/providers/fuel/index.ts
git commit -m "feat(sp1): extend provider types — NormalisedStation/Price SP-1 fields, ProviderSchedule"
```

---

## Task 2: Brand normaliser additions

**Files modified:** `src/lib/providers/fuel/brand-normaliser.ts`

Audit and extend the existing brand alias map for brands that appear in WA, NT, and additional NSW variations not yet present.

- [ ] **Step 1: Add new brand aliases**

Additions to `ALIASES` in `brand-normaliser.ts`:

```typescript
// WA-specific
'better choice': 'Better Choice',
'better choice petroleum': 'Better Choice',
'wesco': 'Wesco',
'peak': 'Peak',

// NT-specific  
'puma energy': 'Puma',  // already 'puma' → 'Puma', add this variant

// NSW / national additional
'caltex woolworths': 'Woolworths',
'shell': 'Shell',         // already present — skip
'independent': 'Independent', // already present — skip
'budget': 'Budget',
'budget petrol': 'Budget',
'matilda': 'Matilda',
'matilda service station': 'Matilda',
'on the run': 'On The Run',
'otr': 'On The Run',
'speedway': 'Speedway',
'speedway fuel': 'Speedway',
```

- [ ] **Step 2: Run brand normaliser tests**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run test:run src/__tests__/brand-normaliser.test.ts 2>&1
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/providers/fuel/brand-normaliser.ts
git commit -m "feat(sp1): extend brand normaliser with WA/NT/NSW brand aliases"
```

---

## Task 3: Database schema updates (Drizzle schema.ts)

**Files modified:** `src/lib/db/schema.ts`

Update the Drizzle schema to reflect the new columns that migrations 0013–0017 will add. Drizzle schema must stay in sync with the actual DB DDL.

- [ ] **Step 1: Add `fuelTypes` table to schema.ts**

```typescript
export const fuelTypes = pgTable('fuel_types', {
  id:          integer('id').primaryKey(),
  code:        text('code').notNull().unique(),
  displayName: text('display_name').notNull(),
})

export type FuelType = typeof fuelTypes.$inferSelect
export type NewFuelType = typeof fuelTypes.$inferInsert
```

- [ ] **Step 2: Add jurisdiction columns to `stations` table**

```typescript
// Add to stations pgTable:
state:          varchar('state', { length: 3 }).notNull().default('QLD'),
region:         text('region'),
jurisdiction:   text('jurisdiction'),
timezone:       text('timezone'),
sourceMetadata: jsonb('source_metadata'),
```

- [ ] **Step 3: Add `validFrom` to `priceReadings` table**

```typescript
// Add to priceReadings pgTable:
validFrom: timestamp('valid_from', { withTimezone: true }),
```

- [ ] **Step 4: Add `provider` to `scrapeHealth` table**

```typescript
// Add to scrapeHealth pgTable:
provider: text('provider').notNull().default('qld'),
```

- [ ] **Step 5: Add jsonb import to schema.ts imports**

```typescript
import {
  pgTable,
  integer,
  text,
  boolean,
  doublePrecision,
  serial,
  bigserial,
  timestamp,
  numeric,
  varchar,
  jsonb,   // ADD THIS
} from 'drizzle-orm/pg-core'
```

- [ ] **Step 6: Verify tests pass (schema imports used in mocked tests)**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run test:run 2>&1 | tail -8
```

- [ ] **Step 7: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/db/schema.ts
git commit -m "feat(sp1): schema — fuelTypes table, stations jurisdiction cols, validFrom, scrapeHealth.provider"
```

---

## Task 4: Database migrations (0013–0017)

**Files created:** 5 SQL migration files in `src/lib/db/migrations/`

Migrations pick up at 0013 (0012 is `route_cache`). Each migration is paired with a comment explaining its rollback strategy.

- [ ] **Step 1: Create `0013_fuel_types.sql`**

```sql
-- Migration 0013: Canonical fuel types lookup table
-- Bridges QLD integer FuelId codes and NSW/WA/NT/TAS string codes.
-- price_readings.fuel_type_id continues to reference this canonical ID.
-- Rollback: DROP TABLE fuel_types CASCADE (removes FK from price_readings).

CREATE TABLE IF NOT EXISTS fuel_types (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL
);

-- Canonical vocabulary seed
INSERT INTO fuel_types (id, code, display_name) VALUES
  (2,  'U91',     'Unleaded 91'),
  (3,  'DL',      'Diesel'),
  (4,  'LPG',     'LPG'),
  (5,  'P95',     'Premium 95'),
  (8,  'P98',     'Premium 98'),
  (12, 'E10',     'E10 Ethanol'),
  (14, 'PDL',     'Premium Diesel'),
  (19, 'E85',     'E85 Ethanol'),
  (20, 'B20',     'Biodiesel B20'),
  (21, 'EV',      'EV Charge')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Create `0014_stations_jurisdiction.sql`**

```sql
-- Migration 0014: Jurisdiction columns on stations
-- Adds state, region, jurisdiction, timezone, source_metadata.
-- Safe online migration — columns are nullable or have defaults.
-- Rollback: ALTER TABLE stations DROP COLUMN state, region, jurisdiction, timezone, source_metadata;

ALTER TABLE stations ADD COLUMN IF NOT EXISTS state          VARCHAR(3)   NOT NULL DEFAULT 'QLD';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS region         TEXT;
ALTER TABLE stations ADD COLUMN IF NOT EXISTS jurisdiction   TEXT         NOT NULL DEFAULT 'AU-QLD';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS timezone       TEXT         NOT NULL DEFAULT 'Australia/Brisbane';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- Backfill existing QLD rows
UPDATE stations
SET
  state        = 'QLD',
  jurisdiction = 'AU-QLD',
  timezone     = 'Australia/Brisbane'
WHERE source_provider = 'qld';

-- Index for state-based filtering (SP-3 will use this)
CREATE INDEX IF NOT EXISTS stations_state_idx ON stations (state);
CREATE INDEX IF NOT EXISTS stations_jurisdiction_idx ON stations (jurisdiction);
```

- [ ] **Step 3: Create `0015_stations_surrogate_pk.sql`**

```sql
-- Migration 0015: Surrogate BIGSERIAL PK on stations
-- DISRUPTIVE — requires brief maintenance window (approx 30s on small dataset).
-- Resolves station ID space collision between QLD (integer SiteId) and other states.
-- After this migration: stations.id is a synthetic BIGSERIAL; upstream IDs are in external_id.
-- The existing unique (source_provider, external_id) index from 0007 is preserved.
-- Rollback: complex — see rollback notes below. Requires pg_dump snapshot before running.
--
-- ROLLBACK NOTES:
-- 1. Restore from pg_dump snapshot taken before migration window.
-- 2. If restoring is not an option: recreate integer PK via new column, repoint FK, rename.
-- This migration MUST be run during a maintenance window with a confirmed recent backup.

-- Step 1: Add new surrogate id column (will become the PK)
ALTER TABLE stations ADD COLUMN IF NOT EXISTS id_new BIGSERIAL;

-- Step 2: Drop the old PK constraint (does NOT drop the column)
ALTER TABLE stations DROP CONSTRAINT IF EXISTS stations_pkey;

-- Step 3: Add new PK on the surrogate column
ALTER TABLE stations ADD PRIMARY KEY (id_new);

-- Step 4: Add the unique constraint on (source_provider, external_id) if not already present
-- (0007 already created this index, but we need the constraint form for FK references)
ALTER TABLE stations ADD CONSTRAINT IF NOT EXISTS stations_provider_external_id_uniq
  UNIQUE (source_provider, external_id);

-- Step 5: Update price_readings.station_id FK to point at id_new
-- First, drop old FK (if it was a formal constraint)
ALTER TABLE price_readings DROP CONSTRAINT IF EXISTS price_readings_station_id_fkey;

-- Step 6: Add temp column on price_readings for the new FK value
ALTER TABLE price_readings ADD COLUMN IF NOT EXISTS station_id_new BIGINT;

-- Step 7: Populate station_id_new by joining stations via (source_provider, external_id)
-- For QLD: source_provider='qld', external_id = station_id::text
UPDATE price_readings pr
SET station_id_new = s.id_new
FROM stations s
WHERE s.source_provider = pr.source_provider
  AND s.external_id = pr.station_id::text;

-- Step 8: Set NOT NULL after backfill
ALTER TABLE price_readings ALTER COLUMN station_id_new SET NOT NULL;

-- Step 9: Rename columns (old id → id_legacy, id_new → id; station_id_new → station_id replacement)
-- We keep station_id as BIGINT going forward
ALTER TABLE price_readings DROP COLUMN station_id;
ALTER TABLE price_readings RENAME COLUMN station_id_new TO station_id;

-- Step 10: Rename stations surrogate
ALTER TABLE stations DROP COLUMN id;
ALTER TABLE stations RENAME COLUMN id_new TO id;

-- Step 11: Re-add FK on price_readings
ALTER TABLE price_readings ADD CONSTRAINT price_readings_station_id_fkey
  FOREIGN KEY (station_id) REFERENCES stations(id);

-- Step 12: Update sequence ownership
ALTER SEQUENCE stations_id_new_seq OWNED BY stations.id;
```

- [ ] **Step 4: Create `0016_price_readings_valid_from.sql`**

```sql
-- Migration 0016: valid_from column on price_readings
-- Enables WA T+1 (day-ahead) pricing semantics.
-- For all non-WA providers: valid_from = recorded_at (same value, no semantic change).
-- For WA: valid_from = upstream "PriceUpdatedFrom" (06:00 WST of effective day).
-- Rollback: ALTER TABLE price_readings DROP COLUMN valid_from; DROP INDEX price_readings_valid_from_idx;

ALTER TABLE price_readings ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;

-- Backfill existing rows: valid_from = recorded_at
UPDATE price_readings SET valid_from = recorded_at WHERE valid_from IS NULL;

-- Set NOT NULL and default after backfill
ALTER TABLE price_readings ALTER COLUMN valid_from SET NOT NULL;
ALTER TABLE price_readings ALTER COLUMN valid_from SET DEFAULT NOW();

-- Index for "current price" and "announced price" queries
CREATE INDEX IF NOT EXISTS price_readings_valid_from_idx
  ON price_readings (station_id, fuel_type_id, valid_from DESC);
```

- [ ] **Step 5: Create `0017_scrape_health_provider.sql`**

```sql
-- Migration 0017: Per-provider scrape_health tracking
-- Adds 'provider' column so each provider's health is independently observable.
-- Existing rows are backfilled to 'qld'.
-- Rollback: ALTER TABLE scrape_health DROP COLUMN provider; DROP INDEX scrape_health_provider_idx;

ALTER TABLE scrape_health ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'qld';

-- Backfill existing rows
UPDATE scrape_health SET provider = 'qld' WHERE provider = 'qld';  -- no-op, default covers it

-- Index for per-provider health queries (ordered by time)
CREATE INDEX IF NOT EXISTS scrape_health_provider_idx
  ON scrape_health (provider, scraped_at DESC);
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/db/migrations/
git commit -m "feat(sp1): migrations 0013-0017 — fuel_types, jurisdiction cols, surrogate PK, valid_from, scrape_health.provider"
```

---

## Task 5: Shared FuelCheck helpers (`_fuelcheck/`)

**Files created:** `src/lib/providers/fuel/_fuelcheck/client.ts`, `_fuelcheck/normaliser.ts`

NSW and TAS share the same FuelCheck vendor stack (same API schema). Rather than duplicating, a `_fuelcheck/` module holds the shared HTTP and normalisation logic.

- [ ] **Step 1: Create `src/lib/providers/fuel/_fuelcheck/client.ts`**

```typescript
/**
 * Shared FuelCheck API client helpers.
 * Used by NSW (api.onegov.nsw.gov.au) and TAS (fuelcheck.tas.gov.au).
 * Each adapter passes its own baseUrl, apiKey, and optional OAuth config.
 */
import axios, { type AxiosInstance } from 'axios'
import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const FuelCheckSiteSchema = z.object({
  serviceStationName: z.string(),
  address:            z.string().optional(),
  suburb:             z.string().optional(),
  state:              z.string().optional(),
  postcode:           z.string().optional(),
  brand:              z.string().optional(),
  stationCode:        z.string(),         // external station ID
  latitude:           z.number(),
  longitude:          z.number(),
})

export const FuelCheckPriceSchema = z.object({
  stationCode: z.string(),
  fuelType:    z.string(),
  price:       z.number(),               // price in cents per litre (e.g. 145.9)
  lastupdated: z.string().optional(),    // ISO timestamp
  transactionDateutc: z.string().optional(),
})

export const FuelCheckSitesResponseSchema = z.object({
  stations: z.array(FuelCheckSiteSchema),
})

export const FuelCheckPricesResponseSchema = z.object({
  prices: z.array(FuelCheckPriceSchema),
})

export type FuelCheckSite = z.infer<typeof FuelCheckSiteSchema>
export type FuelCheckPrice = z.infer<typeof FuelCheckPriceSchema>

// ── HTTP client factory ───────────────────────────────────────────────────────

export interface FuelCheckClientConfig {
  baseUrl: string
  apiKey: string
  /** Optional: transaction/request ID header name (NSW uses 'transactionid') */
  transactionIdHeader?: string
}

export interface FuelCheckClient {
  getSites(): Promise<FuelCheckSite[]>
  getPrices(): Promise<FuelCheckPrice[]>
}

export function createFuelCheckClient(config: FuelCheckClientConfig): FuelCheckClient {
  const http: AxiosInstance = axios.create({
    baseURL: config.baseUrl,
    headers: {
      apikey: config.apiKey,
      ...(config.transactionIdHeader
        ? { [config.transactionIdHeader]: crypto.randomUUID() }
        : {}),
    },
    timeout: 20_000,
  })

  return {
    async getSites() {
      const response = await http.get('/fuel/prices/station')
      const parsed = FuelCheckSitesResponseSchema.parse(response.data)
      return parsed.stations
    },

    async getPrices() {
      const response = await http.get('/fuel/prices')
      const parsed = FuelCheckPricesResponseSchema.parse(response.data)
      return parsed.prices
    },
  }
}
```

- [ ] **Step 2: Create `src/lib/providers/fuel/_fuelcheck/normaliser.ts`**

```typescript
/**
 * Shared FuelCheck normalisation helpers.
 * Both NSW and TAS adapters use these, passing state-specific overrides.
 */
import { normaliseBrand } from '../brand-normaliser'
import type { FuelCheckSite, FuelCheckPrice } from './client'
import type { NormalisedStation, NormalisedPrice } from '../index'
import type { Jurisdiction } from '../types'

// ── Fuel type mapping ─────────────────────────────────────────────────────────

/**
 * FuelCheck string code → canonical fuel_type_id
 * Canonical IDs defined in migration 0013.
 */
export const FUELCHECK_FUEL_MAP: Record<string, number> = {
  'U91':  2,
  'ULP':  2,   // WA alias for U91
  'DL':   3,
  'LPG':  4,
  'P95':  5,
  'PULP': 5,   // WA "Premium Unleaded"
  'P98':  8,
  '98RON': 8,  // WA alias
  'E10':  12,
  'PDL':  14,  // Premium Diesel
  'B20':  20,
  'E85':  19,
  // Ignore EV for v1
}

// ── ACT postcode classification ────────────────────────────────────────────────

/**
 * NSW FuelCheck returns ACT stations with state='ACT'.
 * Where the API doesn't set the state field, we classify by postcode.
 * ACT postcode ranges: 0200-0299 (university area), 2600-2620, 2900-2920.
 */
export function classifyActByPostcode(postcode: string | undefined): boolean {
  if (!postcode) return false
  const n = parseInt(postcode, 10)
  if (isNaN(n)) return false
  return (n >= 200 && n <= 299) || (n >= 2600 && n <= 2620) || (n >= 2900 && n <= 2920)
}

export function resolveState(
  apiState: string | undefined,
  postcode: string | undefined,
  defaultState: string
): { state: string; jurisdiction: Jurisdiction; timezone: string } {
  const st = (apiState ?? '').toUpperCase()

  if (st === 'ACT' || (!st && classifyActByPostcode(postcode))) {
    return { state: 'ACT', jurisdiction: 'AU-ACT', timezone: 'Australia/Sydney' }
  }
  if (st === 'NSW' || defaultState === 'NSW') {
    return { state: 'NSW', jurisdiction: 'AU-NSW', timezone: 'Australia/Sydney' }
  }
  if (st === 'TAS' || defaultState === 'TAS') {
    return { state: 'TAS', jurisdiction: 'AU-TAS', timezone: 'Australia/Hobart' }
  }
  // Fallback
  return { state: defaultState, jurisdiction: `AU-${defaultState}` as Jurisdiction, timezone: 'Australia/Brisbane' }
}

// ── Station normaliser ────────────────────────────────────────────────────────

export function normaliseFuelCheckStation(
  site: FuelCheckSite,
  sourceProvider: string,
  defaultState: string,
  idCounter: () => number
): NormalisedStation {
  const { state, jurisdiction, timezone } = resolveState(site.state, site.postcode, defaultState)

  return {
    id:             idCounter(),
    externalId:     site.stationCode,
    sourceProvider,
    name:           site.serviceStationName,
    brand:          normaliseBrand(site.brand ?? null),
    address:        site.address ?? null,
    suburb:         site.suburb ? site.suburb.toLowerCase() : null,
    postcode:       site.postcode ?? null,
    latitude:       site.latitude,
    longitude:      site.longitude,
    state,
    jurisdiction,
    timezone,
    region:         null,
    sourceMetadata: null,
  }
}

// ── Price normaliser ──────────────────────────────────────────────────────────

export function normaliseFuelCheckPrice(
  price: FuelCheckPrice,
  stationIdMap: Map<string, number>,
  recordedAt: Date,
  sourceProvider: string
): NormalisedPrice | null {
  const stationId = stationIdMap.get(price.stationCode)
  if (stationId === undefined) return null

  const fuelTypeId = FUELCHECK_FUEL_MAP[price.fuelType]
  if (!fuelTypeId) return null

  // Validate price range (50–400 c/L)
  if (price.price < 50 || price.price > 400) {
    console.warn(`[_fuelcheck] Price out of range: stationCode=${price.stationCode} fuelType=${price.fuelType} price=${price.price}`)
    return null
  }

  const tsRaw = price.transactionDateutc ?? price.lastupdated
  const sourceTs = tsRaw ? new Date(tsRaw) : recordedAt

  return {
    stationId,
    fuelTypeId,
    priceCents:     price.price.toFixed(1),
    recordedAt,
    sourceTs,
    sourceProvider,
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/providers/fuel/_fuelcheck/
git commit -m "feat(sp1): shared FuelCheck client + normaliser helpers (_fuelcheck/)"
```

---

## Task 6: NSW provider

**Files created:** `src/lib/providers/fuel/nsw/client.ts`, `normaliser.ts`, `provider.ts`, `__tests__/`

The NSW FuelCheck API uses API key + optional OAuth. For SP-1 we use API key auth only (OAuth token refresh is a SP-2/hardening concern). The NSW adapter also emits ACT stations — classified by the `_fuelcheck/` helpers.

- [ ] **Step 1: Create `src/lib/providers/fuel/nsw/client.ts`**

```typescript
/**
 * NSW FuelCheck API client.
 * Auth: apikey header + transactionid header per request.
 * Base URL: https://api.onegov.nsw.gov.au/FuelPriceCheck/v2
 */
import { createFuelCheckClient, type FuelCheckClient } from '../_fuelcheck/client'

export function createNswClient(): FuelCheckClient {
  const apiKey = process.env.NSW_FUELCHECK_API_KEY
  if (!apiKey) {
    throw new Error(
      'NSW_FUELCHECK_API_KEY environment variable is not set. ' +
      'Register at https://api.nsw.gov.au to obtain a key.'
    )
  }

  return createFuelCheckClient({
    baseUrl: 'https://api.onegov.nsw.gov.au/FuelPriceCheck/v2',
    apiKey,
    transactionIdHeader: 'transactionid',
  })
}
```

- [ ] **Step 2: Create `src/lib/providers/fuel/nsw/normaliser.ts`**

```typescript
/**
 * NSW-specific normalisation.
 * Thin wrapper around _fuelcheck/normaliser with NSW defaults.
 */
export {
  normaliseFuelCheckStation as normaliseNswStation,
  normaliseFuelCheckPrice as normaliseNswPrice,
  classifyActByPostcode,
  resolveState,
  FUELCHECK_FUEL_MAP,
} from '../_fuelcheck/normaliser'
```

- [ ] **Step 3: Create `src/lib/providers/fuel/nsw/provider.ts`**

```typescript
import { createNswClient } from './client'
import {
  normaliseFuelCheckStation,
  normaliseFuelCheckPrice,
} from '../_fuelcheck/normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class NswFuelProvider implements FuelPriceProvider {
  readonly id = 'nsw'
  readonly displayName = 'NSW FuelCheck'

  // Station ID counter: starts at 10_000_000 to avoid QLD collision
  // This is a temporary measure until migration 0015 (surrogate PK) is deployed.
  // Post-0015, station identity is via (source_provider, external_id) UNIQUE.
  private _idCounter = 10_000_000

  private nextId(): number {
    return this._idCounter++
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_NSW) return []

    const client = createNswClient()
    const sites = await client.getSites()
    return sites.map(s => normaliseFuelCheckStation(s, 'nsw', 'NSW', () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_NSW) return []

    const client = createNswClient()
    const [sites, prices] = await Promise.all([
      client.getSites(),
      client.getPrices(),
    ])

    // Build stationCode → surrogate id map
    const stationIdMap = new Map<string, number>()
    let counter = 10_000_000
    for (const s of sites) {
      stationIdMap.set(s.stationCode, counter++)
    }

    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseFuelCheckPrice(p, stationIdMap, recordedAt, 'nsw')
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_NSW) {
      return { status: 'ok', lastRunAt: null, message: 'NSW provider disabled (FILLIP_ENABLE_NSW not set)' }
    }
    try {
      const client = createNswClient()
      await client.getSites()
      return { status: 'ok', lastRunAt: new Date() }
    } catch (err) {
      return {
        status: 'down',
        lastRunAt: null,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
```

- [ ] **Step 4: Create NSW test fixtures and tests**

Create `src/lib/providers/fuel/nsw/__tests__/fixtures/sites.json`:

```json
{
  "stations": [
    {
      "serviceStationName": "Test BP Parramatta",
      "address": "1 Test St, Parramatta NSW 2150",
      "suburb": "Parramatta",
      "state": "NSW",
      "postcode": "2150",
      "brand": "BP",
      "stationCode": "NSW001",
      "latitude": -33.8136,
      "longitude": 151.0034
    },
    {
      "serviceStationName": "Test Shell Civic",
      "address": "2 London Cct, Civic ACT 2601",
      "suburb": "Civic",
      "state": "ACT",
      "postcode": "2601",
      "brand": "Shell",
      "stationCode": "ACT001",
      "latitude": -35.2809,
      "longitude": 149.1300
    }
  ]
}
```

Create `src/lib/providers/fuel/nsw/__tests__/fixtures/prices.json`:

```json
{
  "prices": [
    {
      "stationCode": "NSW001",
      "fuelType": "U91",
      "price": 173.5,
      "transactionDateutc": "2026-04-24T01:00:00Z"
    },
    {
      "stationCode": "NSW001",
      "fuelType": "DL",
      "price": 195.9,
      "transactionDateutc": "2026-04-24T01:00:00Z"
    },
    {
      "stationCode": "ACT001",
      "fuelType": "U91",
      "price": 171.2,
      "transactionDateutc": "2026-04-24T01:00:00Z"
    }
  ]
}
```

Create `src/lib/providers/fuel/nsw/__tests__/normaliser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import sitesFixture from './fixtures/sites.json'
import pricesFixture from './fixtures/prices.json'
import { normaliseFuelCheckStation, normaliseFuelCheckPrice, classifyActByPostcode, resolveState } from '../../_fuelcheck/normaliser'
import type { FuelCheckSite, FuelCheckPrice } from '../../_fuelcheck/client'

describe('NSW normaliser — ACT classification', () => {
  it('classifyActByPostcode: returns true for ACT postcode 2601', () => {
    expect(classifyActByPostcode('2601')).toBe(true)
  })

  it('classifyActByPostcode: returns true for 2910', () => {
    expect(classifyActByPostcode('2910')).toBe(true)
  })

  it('classifyActByPostcode: returns false for NSW postcode 2150', () => {
    expect(classifyActByPostcode('2150')).toBe(false)
  })

  it('resolveState: explicit ACT state field wins', () => {
    const { state, jurisdiction } = resolveState('ACT', '2601', 'NSW')
    expect(state).toBe('ACT')
    expect(jurisdiction).toBe('AU-ACT')
  })

  it('resolveState: NSW default', () => {
    const { state, jurisdiction } = resolveState('NSW', '2150', 'NSW')
    expect(state).toBe('NSW')
    expect(jurisdiction).toBe('AU-NSW')
  })
})

describe('NSW normaliser — station normalisation', () => {
  it('emits lower-case suburb (SP-1 §0 amendment)', () => {
    const site = sitesFixture.stations[0] as FuelCheckSite
    let counter = 10_000_000
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.suburb).toBe('parramatta')
  })

  it('ACT station gets state=ACT and jurisdiction=AU-ACT', () => {
    const site = sitesFixture.stations[1] as FuelCheckSite
    let counter = 10_000_001
    const station = normaliseFuelCheckStation(site, 'nsw', 'NSW', () => counter++)
    expect(station.state).toBe('ACT')
    expect(station.jurisdiction).toBe('AU-ACT')
    expect(station.timezone).toBe('Australia/Sydney')
  })
})

describe('NSW normaliser — price normalisation', () => {
  it('maps U91 → fuelTypeId 2', () => {
    const recordedAt = new Date('2026-04-24T02:00:00Z')
    const stationIdMap = new Map([['NSW001', 10_000_000], ['ACT001', 10_000_001]])
    const price = pricesFixture.prices[0] as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).not.toBeNull()
    expect(norm!.fuelTypeId).toBe(2)
    expect(parseFloat(norm!.priceCents)).toBeGreaterThan(50)
    expect(parseFloat(norm!.priceCents)).toBeLessThan(400)
  })

  it('returns null for unknown fuelType code', () => {
    const recordedAt = new Date()
    const stationIdMap = new Map([['NSW001', 10_000_000]])
    const price = { stationCode: 'NSW001', fuelType: 'UNKNOWN', price: 150.0 } as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).toBeNull()
  })

  it('returns null for out-of-range price', () => {
    const recordedAt = new Date()
    const stationIdMap = new Map([['NSW001', 10_000_000]])
    const price = { stationCode: 'NSW001', fuelType: 'U91', price: 5.0 } as FuelCheckPrice
    const norm = normaliseFuelCheckPrice(price, stationIdMap, recordedAt, 'nsw')
    expect(norm).toBeNull()
  })
})
```

- [ ] **Step 5: Run NSW tests**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run test:run -- src/lib/providers/fuel/nsw 2>&1
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/providers/fuel/nsw/
git commit -m "feat(sp1): NSW FuelCheck provider (covers ACT via postcode classification)"
```

---

## Task 7: TAS provider

**Files created:** `src/lib/providers/fuel/tas/` (4 files + fixtures)

TAS FuelCheck is structurally identical to NSW. The adapter wraps the shared `_fuelcheck/` helpers with TAS-specific credentials and state defaults.

- [ ] **Step 1: Create `src/lib/providers/fuel/tas/client.ts`**

```typescript
/**
 * TAS FuelCheck API client.
 * Same vendor stack as NSW. Distinct credentials and base URL.
 */
import { createFuelCheckClient, type FuelCheckClient } from '../_fuelcheck/client'

export function createTasClient(): FuelCheckClient {
  const apiKey = process.env.TAS_FUELCHECK_API_KEY
  if (!apiKey) {
    throw new Error(
      'TAS_FUELCHECK_API_KEY environment variable is not set. ' +
      'Register at https://www.fuelcheck.tas.gov.au to obtain a key.'
    )
  }

  return createFuelCheckClient({
    baseUrl: 'https://www.fuelcheck.tas.gov.au/api',
    apiKey,
  })
}
```

- [ ] **Step 2: Create `src/lib/providers/fuel/tas/normaliser.ts`** (re-export `_fuelcheck` with TAS defaults)

```typescript
export {
  normaliseFuelCheckStation as normaliseTasStation,
  normaliseFuelCheckPrice as normaliseTasPrice,
  FUELCHECK_FUEL_MAP,
} from '../_fuelcheck/normaliser'
```

- [ ] **Step 3: Create `src/lib/providers/fuel/tas/provider.ts`**

```typescript
import { createTasClient } from './client'
import {
  normaliseFuelCheckStation,
  normaliseFuelCheckPrice,
} from '../_fuelcheck/normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class TasFuelProvider implements FuelPriceProvider {
  readonly id = 'tas'
  readonly displayName = 'TAS FuelCheck'

  // TAS stations start at 20_000_000 to avoid collision with NSW (10M+)
  private _idCounter = 20_000_000

  private nextId(): number {
    return this._idCounter++
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_TAS) return []

    const client = createTasClient()
    const sites = await client.getSites()
    return sites.map(s => normaliseFuelCheckStation(s, 'tas', 'TAS', () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_TAS) return []

    const client = createTasClient()
    const [sites, prices] = await Promise.all([
      client.getSites(),
      client.getPrices(),
    ])

    const stationIdMap = new Map<string, number>()
    let counter = 20_000_000
    for (const s of sites) {
      stationIdMap.set(s.stationCode, counter++)
    }

    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseFuelCheckPrice(p, stationIdMap, recordedAt, 'tas')
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_TAS) {
      return { status: 'ok', lastRunAt: null, message: 'TAS provider disabled (FILLIP_ENABLE_TAS not set)' }
    }
    try {
      const client = createTasClient()
      await client.getSites()
      return { status: 'ok', lastRunAt: new Date() }
    } catch (err) {
      return {
        status: 'down',
        lastRunAt: null,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
```

- [ ] **Step 4: Create TAS fixtures and test**

Create `src/lib/providers/fuel/tas/__tests__/fixtures/sites.json` and `prices.json` (same shape as NSW, state=TAS).

Create `src/lib/providers/fuel/tas/__tests__/normaliser.test.ts` that verifies TAS state classification and priceCents range.

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/providers/fuel/tas/
git commit -m "feat(sp1): TAS FuelCheck provider (shares _fuelcheck/ helpers)"
```

---

## Task 8: WA FuelWatch provider

**Files created:** `src/lib/providers/fuel/wa/` (4 files + fixtures)

WA's FuelWatch has T+1 semantics: the 14:30 WST daily fetch returns tomorrow's prices with `valid_from` = 06:00 WST tomorrow. The 06:30 WST fetch confirms today's effective prices.

- [ ] **Step 1: Create `src/lib/providers/fuel/wa/client.ts`**

```typescript
/**
 * WA FuelWatch API client.
 * Auth: none.
 * Base URL: https://www.fuelwatch.wa.gov.au/api
 * Format: JSON preferred.
 *
 * T+1 semantics: each price record has a 'date' field indicating when
 * the price becomes effective. The 14:30 WST fetch returns tomorrow's
 * announced prices; the 06:30 WST fetch confirms today's prices.
 */
import axios from 'axios'
import { z } from 'zod'

const FuelWatchSiteSchema = z.object({
  site_id:   z.union([z.string(), z.number()]),
  name:      z.string(),
  address:   z.string().optional(),
  suburb:    z.string().optional(),
  postcode:  z.string().optional(),
  brand:     z.string().optional(),
  latitude:  z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
})

const FuelWatchPriceSchema = z.object({
  site_id:   z.union([z.string(), z.number()]),
  fuel_type: z.string(),
  price:     z.union([z.string(), z.number()]),
  date:      z.string().optional(),  // YYYY-MM-DD effective date
})

const FuelWatchSitesResponseSchema  = z.object({ sites:  z.array(FuelWatchSiteSchema) })
const FuelWatchPricesResponseSchema = z.object({ prices: z.array(FuelWatchPriceSchema) })

export type FuelWatchSite  = z.infer<typeof FuelWatchSiteSchema>
export type FuelWatchPrice = z.infer<typeof FuelWatchPriceSchema>

export interface FuelWatchClient {
  getSites(): Promise<FuelWatchSite[]>
  getPrices(): Promise<FuelWatchPrice[]>
}

export function createWaClient(): FuelWatchClient {
  const http = axios.create({
    baseURL: 'https://www.fuelwatch.wa.gov.au/api',
    timeout: 20_000,
  })

  return {
    async getSites() {
      const response = await http.get('/sites')
      const parsed = FuelWatchSitesResponseSchema.parse(response.data)
      return parsed.sites
    },

    async getPrices() {
      const response = await http.get('/prices')
      const parsed = FuelWatchPricesResponseSchema.parse(response.data)
      return parsed.prices
    },
  }
}
```

- [ ] **Step 2: Create `src/lib/providers/fuel/wa/normaliser.ts`**

```typescript
/**
 * WA FuelWatch normalisation.
 * Key concern: T+1 valid_from computation.
 * WA prices become effective at 06:00 WST (UTC+8) on the stated date.
 */
import { normaliseBrand } from '../brand-normaliser'
import type { FuelWatchSite, FuelWatchPrice } from './client'
import type { NormalisedStation, NormalisedPrice } from '../index'

// ── Fuel type mapping (WA codes → canonical IDs) ──────────────────────────────

export const WA_FUEL_MAP: Record<string, number> = {
  'ULP':           2,   // Unleaded — WA name for U91
  'PULP':          5,   // Premium Unleaded — WA name for P95
  '98RON':         8,
  'Diesel':        3,
  'LPG':           4,
  'B20':           20,
  'E85':           19,
  'Brand diesel':  14,  // Brand Diesel ≈ Premium Diesel
  'PDL':           14,
}

// ── T+1 valid_from computation ─────────────────────────────────────────────────

/**
 * Convert a WA date string (YYYY-MM-DD) to the UTC timestamp at which
 * WA prices for that date become effective: 06:00 WST = 22:00 UTC previous day.
 */
export function waDateToValidFrom(dateStr: string): Date {
  // WA effective time: 06:00 WST = UTC+8, so 06:00 WST = 22:00 UTC of prev day
  const [year, month, day] = dateStr.split('-').map(Number)
  // Construct as 06:00 AWST = UTC+8
  const localDate = new Date(Date.UTC(year, month - 1, day, 6 - 8, 0, 0))
  // When hour goes negative, JS Date auto-adjusts the day — which is correct here
  // (06:00 WST - 8h = 22:00 UTC previous day)
  return new Date(Date.UTC(year, month - 1, day - 1, 22, 0, 0))
}

// ── Station normaliser ────────────────────────────────────────────────────────

export function normaliseWaStation(
  site: FuelWatchSite,
  idCounter: () => number
): NormalisedStation {
  return {
    id:             idCounter(),
    externalId:     String(site.site_id),
    sourceProvider: 'wa',
    name:           site.name,
    brand:          normaliseBrand(site.brand ?? null),
    address:        site.address ?? null,
    suburb:         site.suburb ? site.suburb.toLowerCase() : null,
    postcode:       site.postcode ?? null,
    latitude:       typeof site.latitude === 'string' ? parseFloat(site.latitude) : (site.latitude ?? 0),
    longitude:      typeof site.longitude === 'string' ? parseFloat(site.longitude) : (site.longitude ?? 0),
    state:          'WA',
    jurisdiction:   'AU-WA',
    timezone:       'Australia/Perth',
    region:         null,
    sourceMetadata: null,
  }
}

// ── Price normaliser ──────────────────────────────────────────────────────────

export function normaliseWaPrice(
  price: FuelWatchPrice,
  stationIdMap: Map<string, number>,
  recordedAt: Date
): NormalisedPrice | null {
  const stationId = stationIdMap.get(String(price.site_id))
  if (stationId === undefined) return null

  const fuelTypeId = WA_FUEL_MAP[price.fuel_type]
  if (!fuelTypeId) return null

  const rawPrice = typeof price.price === 'string' ? parseFloat(price.price) : price.price
  if (isNaN(rawPrice) || rawPrice < 50 || rawPrice > 400) return null

  // T+1: if price has a date field, compute valid_from as 06:00 WST of that date
  const validFrom = price.date ? waDateToValidFrom(price.date) : recordedAt

  return {
    stationId,
    fuelTypeId,
    priceCents:     rawPrice.toFixed(1),
    recordedAt,
    sourceTs:       recordedAt,
    sourceProvider: 'wa',
    validFrom,
  }
}
```

- [ ] **Step 3: Create `src/lib/providers/fuel/wa/provider.ts`**

```typescript
import { createWaClient } from './client'
import { normaliseWaStation, normaliseWaPrice } from './normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class WaFuelProvider implements FuelPriceProvider {
  readonly id = 'wa'
  readonly displayName = 'WA FuelWatch'

  // WA stations start at 30_000_000
  private _idCounter = 30_000_000

  private nextId(): number {
    return this._idCounter++
  }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_WA) return []

    const client = createWaClient()
    const sites = await client.getSites()
    return sites.map(s => normaliseWaStation(s, () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_WA) return []

    const client = createWaClient()
    const [sites, prices] = await Promise.all([
      client.getSites(),
      client.getPrices(),
    ])

    const stationIdMap = new Map<string, number>()
    let counter = 30_000_000
    for (const s of sites) {
      stationIdMap.set(String(s.site_id), counter++)
    }

    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseWaPrice(p, stationIdMap, recordedAt)
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_WA) {
      return { status: 'ok', lastRunAt: null, message: 'WA provider disabled (FILLIP_ENABLE_WA not set)' }
    }
    try {
      const client = createWaClient()
      await client.getSites()
      return { status: 'ok', lastRunAt: new Date() }
    } catch (err) {
      return {
        status: 'down',
        lastRunAt: null,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
```

- [ ] **Step 4: Create WA fixtures and T+1 tests**

Create `src/lib/providers/fuel/wa/__tests__/fixtures/prices.json` with two entries: one `date=today` (effective) and one `date=tomorrow` (announced).

Create `src/lib/providers/fuel/wa/__tests__/normaliser.test.ts`:
- Tests `waDateToValidFrom`: given date '2026-04-25', expect UTC timestamp 2026-04-24T22:00:00Z
- Tests `normaliseWaPrice` with tomorrow's date → `validFrom > recordedAt`
- Tests `normaliseWaPrice` with today's date → `validFrom <= recordedAt`

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/providers/fuel/wa/
git commit -m "feat(sp1): WA FuelWatch provider with T+1 valid_from semantics"
```

---

## Task 9: NT provider (stub, pending Q4)

**Files created:** `src/lib/providers/fuel/nt/` (3 files + test)

The NT MyFuel API base URL is unconfirmed (Q4 in spec). This task creates a best-guess stub that:
- Returns empty arrays (disabled) when `FILLIP_ENABLE_NT` is not set
- Throws a `NtApiUnverified` error (clearly labelled) when enabled
- Contains the best-guess URL and auth structure for Chris to verify

- [ ] **Step 1: Create `src/lib/providers/fuel/nt/client.ts`**

```typescript
/**
 * NT MyFuel API client stub.
 *
 * ⚠ Q4 UNRESOLVED: The NT API base URL and exact auth flow are unconfirmed.
 * This stub uses a best-guess URL. When FILLIP_ENABLE_NT is set, this
 * throws NtApiUnverified until the URL is confirmed and this comment removed.
 *
 * Confirmation path: verify at https://myfuelnt.nt.gov.au/Api/
 * Expected auth: 'Authorization: Bearer <NT_MYFUEL_API_KEY>'
 * Expected endpoints: /Site/Sites (stations), /Price/Prices (prices)
 */

export class NtApiUnverified extends Error {
  constructor() {
    super(
      'NT MyFuel API base URL is unconfirmed (SP-1 Q4). ' +
      'Set NT_MYFUEL_BASE_URL env var with the confirmed URL to enable. ' +
      'Disable this error by setting FILLIP_NT_VERIFIED=true after verifying.'
    )
    this.name = 'NtApiUnverified'
  }
}

export interface NtClient {
  getSites(): Promise<NtSite[]>
  getPrices(): Promise<NtPrice[]>
}

export interface NtSite {
  siteId:    string | number
  name:      string
  address?:  string
  suburb?:   string
  postcode?: string
  brand?:    string
  latitude?: number
  longitude?: number
}

export interface NtPrice {
  siteId:    string | number
  fuelType:  string
  price:     number
  updatedAt?: string
}

export function createNtClient(): NtClient {
  if (!process.env.FILLIP_NT_VERIFIED) {
    throw new NtApiUnverified()
  }

  const baseUrl = process.env.NT_MYFUEL_BASE_URL ?? 'https://myfuelnt.nt.gov.au/Api'
  const apiKey  = process.env.NT_MYFUEL_API_KEY

  if (!apiKey) {
    throw new Error('NT_MYFUEL_API_KEY is not set.')
  }

  // Stub — replace with real implementation once URL is verified
  throw new NtApiUnverified()
}
```

- [ ] **Step 2: Create `src/lib/providers/fuel/nt/normaliser.ts`**

Best-guess normaliser matching the expected NT response shape (mirrors NSW).

```typescript
import { normaliseBrand } from '../brand-normaliser'
import type { NtSite, NtPrice } from './client'
import type { NormalisedStation, NormalisedPrice } from '../index'

export const NT_FUEL_MAP: Record<string, number> = {
  'U91':            2,
  'Unleaded':       2,
  'U95':            5,
  'U98':            8,
  'Diesel':         3,
  'LPG':            4,
  'Premium Diesel': 14,
}

export function normaliseNtStation(site: NtSite, idCounter: () => number): NormalisedStation {
  return {
    id:             idCounter(),
    externalId:     String(site.siteId),
    sourceProvider: 'nt',
    name:           site.name,
    brand:          normaliseBrand(site.brand ?? null),
    address:        site.address ?? null,
    suburb:         site.suburb ? site.suburb.toLowerCase() : null,
    postcode:       site.postcode ?? null,
    latitude:       site.latitude ?? 0,
    longitude:      site.longitude ?? 0,
    state:          'NT',
    jurisdiction:   'AU-NT',
    timezone:       'Australia/Darwin',
    region:         null,
    sourceMetadata: null,
  }
}

export function normaliseNtPrice(
  price: NtPrice,
  stationIdMap: Map<string, number>,
  recordedAt: Date
): NormalisedPrice | null {
  const stationId = stationIdMap.get(String(price.siteId))
  if (stationId === undefined) return null
  const fuelTypeId = NT_FUEL_MAP[price.fuelType]
  if (!fuelTypeId) return null
  if (price.price < 50 || price.price > 400) return null

  return {
    stationId,
    fuelTypeId,
    priceCents:     price.price.toFixed(1),
    recordedAt,
    sourceTs:       price.updatedAt ? new Date(price.updatedAt) : recordedAt,
    sourceProvider: 'nt',
  }
}
```

- [ ] **Step 3: Create `src/lib/providers/fuel/nt/provider.ts`**

```typescript
import { createNtClient, NtApiUnverified } from './client'
import { normaliseNtStation, normaliseNtPrice } from './normaliser'
import type { FuelPriceProvider, NormalisedStation, NormalisedPrice, ProviderHealth } from '../index'

export class NtFuelProvider implements FuelPriceProvider {
  readonly id = 'nt'
  readonly displayName = 'NT MyFuel'

  private _idCounter = 40_000_000
  private nextId(): number { return this._idCounter++ }

  async fetchStations(): Promise<NormalisedStation[]> {
    if (!process.env.FILLIP_ENABLE_NT) return []
    const client = createNtClient()  // throws NtApiUnverified
    const sites = await client.getSites()
    return sites.map(s => normaliseNtStation(s, () => this.nextId()))
  }

  async fetchPrices(recordedAt: Date): Promise<NormalisedPrice[]> {
    if (!process.env.FILLIP_ENABLE_NT) return []
    const client = createNtClient()
    const [sites, prices] = await Promise.all([client.getSites(), client.getPrices()])
    const stationIdMap = new Map<string, number>()
    let counter = 40_000_000
    for (const s of sites) stationIdMap.set(String(s.siteId), counter++)
    const results: NormalisedPrice[] = []
    for (const p of prices) {
      const norm = normaliseNtPrice(p, stationIdMap, recordedAt)
      if (norm) results.push(norm)
    }
    return results
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!process.env.FILLIP_ENABLE_NT) {
      return { status: 'ok', lastRunAt: null, message: 'NT provider disabled (FILLIP_ENABLE_NT not set)' }
    }
    return {
      status: 'down',
      lastRunAt: null,
      message: 'NT API unverified — set FILLIP_NT_VERIFIED=true after confirming the base URL',
    }
  }
}
```

- [ ] **Step 4: Create NT tests**

`src/lib/providers/fuel/nt/__tests__/provider.test.ts`:
- When `FILLIP_ENABLE_NT` is unset: `fetchStations()` returns `[]`, no throw
- When `FILLIP_ENABLE_NT` is set but `FILLIP_NT_VERIFIED` is not: `fetchStations()` throws `NtApiUnverified`

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/providers/fuel/nt/
git commit -m "feat(sp1): NT MyFuel provider stub (Q4 unresolved — throws NtApiUnverified when enabled)"
```

---

## Task 10: Per-provider scheduler refactor

**Files modified:** `src/lib/scraper/scheduler.ts`, `src/lib/scraper/writer.ts`

Refactor the scheduler from a single 15-min cron to per-provider cron entries. Add per-provider healthchecks.io ping.

- [ ] **Step 1: Update `src/lib/scraper/writer.ts`**

- Change `scrapeHealth` insert to include `provider` column
- Change `pingHealthchecks()` to accept `providerId: string` and read `HEALTHCHECKS_PING_URL_{QLD,NSW,WA,NT,TAS}` accordingly

Key changes:
```typescript
// Old:
await db.insert(scrapeHealth).values({ pricesUpserted, durationMs, error: null })
await pingHealthchecks()

// New:
await db.insert(scrapeHealth).values({ pricesUpserted, durationMs, error: null, provider: provider.id })
await pingHealthchecks(provider.id)
```

```typescript
// New pingHealthchecks:
async function pingHealthchecks(providerId: string): Promise<void> {
  const key = `HEALTHCHECKS_PING_URL_${providerId.toUpperCase()}`
  const pingUrl = process.env[key] ?? process.env.HEALTHCHECKS_PING_URL
  if (!pingUrl) return
  try {
    await axios.get(pingUrl, { timeout: 5000 })
  } catch {
    console.error(`[scraper:${providerId}] healthchecks.io ping failed`)
  }
}
```

- [ ] **Step 2: Refactor `src/lib/scraper/scheduler.ts`**

Replace the single 15-min cron with per-provider schedule entries:

```typescript
import { NswFuelProvider } from '@/lib/providers/fuel/nsw/provider'
import { TasFuelProvider } from '@/lib/providers/fuel/tas/provider'
import { WaFuelProvider }  from '@/lib/providers/fuel/wa/provider'
import { NtFuelProvider }  from '@/lib/providers/fuel/nt/provider'

interface ProviderScheduleEntry {
  provider: FuelPriceProvider
  cron:     string
  tz:       string
}

const PROVIDER_SCHEDULES: ProviderScheduleEntry[] = [
  { provider: new QldFuelProvider(), cron: '*/15 * * * *', tz: 'Australia/Brisbane' },
  { provider: new NswFuelProvider(), cron: '*/15 * * * *', tz: 'Australia/Sydney'   },
  { provider: new TasFuelProvider(), cron: '*/15 * * * *', tz: 'Australia/Hobart'   },
  { provider: new NtFuelProvider(),  cron: '*/30 * * * *', tz: 'Australia/Darwin'   },
  { provider: new WaFuelProvider(),  cron: '30 6,14 * * *', tz: 'Australia/Perth'   },
]

export function startScheduler(): void {
  // Register all providers
  for (const { provider } of PROVIDER_SCHEDULES) {
    registerProvider(provider)
  }

  // D-11: staggered startup (30s apart per provider to avoid connection spike)
  PROVIDER_SCHEDULES.forEach(({ provider }, idx) => {
    const delayMs = idx * 30_000
    setTimeout(() => {
      runProviderScrape(provider).catch(err =>
        console.error(`[scheduler] Startup scrape failed for ${provider.id}:`, err)
      )
    }, delayMs)
  })

  // Per-provider cron jobs
  for (const { provider, cron, tz } of PROVIDER_SCHEDULES) {
    cron.schedule(cron, () => {
      runProviderScrape(provider).catch(err =>
        console.error(`[scheduler:${provider.id}] Scheduled scrape failed:`, err)
      )
    }, { timezone: tz, noOverlap: true })
  }

  // ... maintenance jobs remain unchanged
}
```

Note: fix variable shadowing (`cron` imported module vs. local `cron` variable in loop).

- [ ] **Step 3: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/lib/scraper/scheduler.ts fuelsniffer/src/lib/scraper/writer.ts
git commit -m "feat(sp1): per-provider scheduler cron + per-provider healthchecks.io ping"
```

---

## Task 11: Extended /api/health endpoint

**Files modified:** `src/app/api/health/route.ts`, `src/__tests__/health.test.ts`

Extend health API to return per-provider status.

- [ ] **Step 1: Update `src/app/api/health/route.ts`**

New response shape:
```json
{
  "providers": {
    "qld": { "status": "ok", "lastSuccessAt": "...", "lastError": null, "rowsLastRun": 1820 },
    "nsw": { "status": "ok", "lastSuccessAt": "...", "lastError": null, "rowsLastRun": 2614 }
  },
  "overall": "ok"
}
```

Query `scrape_health` grouped by provider, returning the latest row per provider:

```sql
SELECT DISTINCT ON (provider)
  provider, scraped_at, prices_upserted, error
FROM scrape_health
ORDER BY provider, scraped_at DESC
```

The `buildHealthResponse` function is updated to accept an array of per-provider rows. Keep the old `HealthResponse` type exported for backward compat (existing tests).

- [ ] **Step 2: Update `src/__tests__/health.test.ts`**

Extend existing tests to cover:
- Per-provider shape is returned
- `overall: 'degraded'` when any provider has a non-null error
- `overall: 'ok'` when all providers are ok

- [ ] **Step 3: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/app/api/health/route.ts fuelsniffer/src/__tests__/health.test.ts
git commit -m "feat(sp1): extend /api/health to per-provider status"
```

---

## Task 12: Cross-provider contract tests

**Files created:** `src/__tests__/providers/contract.test.ts`, `wa-valid-from.test.ts`, `scheduler.test.ts`

- [ ] **Step 1: Create `src/__tests__/providers/contract.test.ts`**

For each provider (QLD, NSW, TAS, WA, NT — all feature-flag disabled in test env):
- Construct provider instance
- Call `fetchStations()` → assert returns `NormalisedStation[]`, suburb is lowercase or null
- Call `fetchPrices(now)` → assert returns `NormalisedPrice[]`, priceCents in range 50–400 (or empty when disabled)

- [ ] **Step 2: Create `src/__tests__/providers/wa-valid-from.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { waDateToValidFrom } from '@/lib/providers/fuel/wa/normaliser'

describe('WA T+1 valid_from semantics', () => {
  it('waDateToValidFrom("2026-04-25") → 2026-04-24T22:00:00.000Z (06:00 WST)', () => {
    const result = waDateToValidFrom('2026-04-25')
    expect(result.toISOString()).toBe('2026-04-24T22:00:00.000Z')
  })

  it('a price with future valid_from is "announced" (valid_from > now)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-24T10:00:00Z'))

    const validFrom = waDateToValidFrom('2026-04-25')
    expect(validFrom.getTime()).toBeGreaterThan(Date.now())

    vi.useRealTimers()
  })

  it('a price with past valid_from is "current" (valid_from <= now)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T23:00:00Z'))

    const validFrom = waDateToValidFrom('2026-04-25')
    expect(validFrom.getTime()).toBeLessThanOrEqual(Date.now())

    vi.useRealTimers()
  })
})
```

- [ ] **Step 3: Create `src/__tests__/providers/scheduler.test.ts`**

Mock `cron.schedule`; call `startScheduler()`; assert each provider id gets a `cron.schedule()` call with the correct cron string and timezone.

- [ ] **Step 4: Run all new tests**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run test:run 2>&1 | tail -10
```

Expected: new tests pass, total count increases from 207.

- [ ] **Step 5: Commit**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add fuelsniffer/src/__tests__/providers/
git commit -m "test(sp1): contract, WA T+1, and scheduler unit tests"
```

---

## Task 13: Build verification + final cleanup

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run test:run 2>&1 | tail -10
# Target: all new SP-1 tests pass; pre-existing 4 DB files still fail (expected)
```

- [ ] **Step 2: Run lint**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run lint 2>&1 | tail -5
# Target: no new errors above SP-0 baseline of 38 errors
```

- [ ] **Step 3: Run build**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1/fuelsniffer && npm run build 2>&1 | tail -10
# Target: clean build (Next.js static analysis passes)
```

- [ ] **Step 4: Fix any issues found**

Address lint/build issues inline. Do not suppress errors — fix the root cause.

- [ ] **Step 5: Commit plan document**

```bash
cd /Users/cdenn/Projects/FuelSniffer/.worktrees/sp1
git add docs/superpowers/plans/2026-04-24-fillip-sp1-national-data.md
git commit -m "docs(plan): SP-1 implementation plan (national data adapters)"
```

---

## Commit sequence summary

| # | Message |
|---|---|
| 1 | `feat(sp1): extend provider types — NormalisedStation/Price SP-1 fields, ProviderSchedule` |
| 2 | `feat(sp1): extend brand normaliser with WA/NT/NSW brand aliases` |
| 3 | `feat(sp1): schema — fuelTypes table, stations jurisdiction cols, validFrom, scrapeHealth.provider` |
| 4 | `feat(sp1): migrations 0013-0017 — fuel_types, jurisdiction cols, surrogate PK, valid_from, scrape_health.provider` |
| 5 | `feat(sp1): shared FuelCheck client + normaliser helpers (_fuelcheck/)` |
| 6 | `feat(sp1): NSW FuelCheck provider (covers ACT via postcode classification)` |
| 7 | `feat(sp1): TAS FuelCheck provider (shares _fuelcheck/ helpers)` |
| 8 | `feat(sp1): WA FuelWatch provider with T+1 valid_from semantics` |
| 9 | `feat(sp1): NT MyFuel provider stub (Q4 unresolved — throws NtApiUnverified when enabled)` |
| 10 | `feat(sp1): per-provider scheduler cron + per-provider healthchecks.io ping` |
| 11 | `feat(sp1): extend /api/health to per-provider status` |
| 12 | `test(sp1): contract, WA T+1, and scheduler unit tests` |
| 13 | `docs(plan): SP-1 implementation plan (national data adapters)` |

---

## Open questions requiring Chris signoff before merge

| # | Question | Default taken | Signoff needed |
|---|---|---|---|
| Q1 | Surrogate PK (migration 0015) maintenance window | Planned for 02:00 Brisbane | Yes — confirm window before deploying |
| Q2 | Display WA T+1 "tomorrow" price in v1 UI? | No — store, don't display | Yes — confirm store-only for SP-1 |
| Q4 | NT API base URL + auth | Stub with `NtApiUnverified` error | Yes — verify URL at myfuelnt.nt.gov.au/Api, set `FILLIP_NT_VERIFIED=true` |
| Q9 | Healthchecks.io check IDs provisioned? | Env vars ready; check IDs TBD | Yes — provision checks before enabling providers |
| Q10 | `state_coverage` config table for UI | Deferred to SP-3 (no table in SP-1) | Soft — SP-3 can add if needed |

---

## Risk notes

1. **Migration 0015 (surrogate PK)** is the highest-risk migration. It modifies the PK of the `stations` table and rewrites the `price_readings.station_id` FK. Run ONLY during a confirmed maintenance window with a fresh `pg_dump` backup. Verify row counts before and after.

2. **NT provider** is blocked on Q4. The stub is safe to deploy (feature-flagged off). Do not set `FILLIP_ENABLE_NT=true` until the API URL is confirmed.

3. **ID counter approach** (10M, 20M, 30M, 40M offsets per provider) is a temporary measure. Migration 0015 converts to surrogate BIGSERIAL, at which point these integer IDs are superseded by the (source_provider, external_id) UNIQUE constraint. The offset ranges are large enough to avoid collision before 0015 is deployed.

4. **Suburb lowercase invariant** (§0 amendment): all new providers emit `suburb.toLowerCase()`. The existing QLD normaliser does NOT lowercase suburb — this is a known pre-existing inconsistency. SP-1 does not fix QLD to avoid breaking existing tests; SP-3 or a follow-up can add a backfill.
