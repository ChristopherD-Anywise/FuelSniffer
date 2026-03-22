# Phase 1: Data Pipeline - Research

**Researched:** 2026-03-23
**Domain:** QLD Fuel Price API integration, TimescaleDB schema design, Next.js embedded scraper with health monitoring
**Confidence:** MEDIUM-HIGH (core patterns HIGH; QLD API geographic parameters MEDIUM — require live API access to confirm)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Docker Compose for all services (TimescaleDB, Next.js app with embedded scraper)
- **D-02:** Target platform is a home server/PC running x86 Linux
- **D-03:** Cloudflare Tunnel for HTTPS access (no port forwarding, no manual cert management)
- **D-04:** Keep raw 15-minute data for 7 days before rolling up to hourly via TimescaleDB continuous aggregates
- **D-05:** Soft-delete closed/relocated stations — mark as inactive, keep history, hide from current views
- **D-06:** Only store stations within ~50km of North Lakes (filter on ingest, not query time)
- **D-07:** Store ALL fuel types the API returns (filter in the UI layer, not at storage)
- **D-08:** On API failure: retry 3 times with backoff, then skip that cycle and try again at next 15-min window
- **D-09:** Always insert a row every 15 minutes regardless of whether price changed (consistent time series)
- **D-10:** Minimal logging — errors and summary stats only (e.g. "150 prices updated")
- **D-11:** Immediate fetch on startup, then every 15 minutes on schedule

### Claude's Discretion

- Health monitoring implementation details (healthchecks.io integration, /api/health endpoint design)
- Database schema design (table structure, indexes, hypertable configuration)
- TimescaleDB continuous aggregate configuration
- Price encoding conversion approach (API integer ÷ 10 → cents/L)
- Timezone handling implementation (UTC storage, Australia/Brisbane display)
- Station distance calculation method (haversine or PostGIS)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | System registers with QLD Fuel Price API and authenticates via subscriber token | API endpoint, auth header format, registration path documented in FEATURES.md |
| DATA-02 | Scraper polls QLD API every 15 minutes and stores prices for all fuel types | node-cron v4 scheduler; axios HTTP client; Drizzle ORM upsert patterns |
| DATA-03 | Scraper health monitoring with heartbeat checks and failure alerts | healthchecks.io ping URL integration; `/api/health` Next.js route handler; heartbeat table pattern |
| DATA-04 | Today's data stored at 15-minute intervals | TimescaleDB hypertable on `price_readings`; upsert with `ON CONFLICT DO NOTHING` |
| DATA-05 | Historical data automatically rolled up to hourly intervals | TimescaleDB continuous aggregate (`hourly_prices`); 7-day raw retention policy |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire data foundation for FuelSniffer. Everything in subsequent phases depends on data flowing correctly from this phase. There are three day-one correctness traps — price integer encoding, timezone handling, and retention policy setup — that have exponential migration cost if deferred. All three must be addressed before any data accumulates.

The architectural shape for Phase 1 is: a Next.js 16 monorepo where the scraper runs as an embedded node-cron scheduler inside the `next start` process (managed by PM2), writing directly to TimescaleDB via Drizzle ORM. Docker Compose wires TimescaleDB and the Next.js app together. A critical discovery during research: Drizzle Kit does not support native TimescaleDB DDL (hypertable creation, continuous aggregates, retention policies). These must be handled via custom SQL migration files alongside Drizzle schema definitions. The scraper cannot use Drizzle's generated migrations for any TimescaleDB-specific operations.

The one open question that cannot be resolved without live API access: the `geoRegionId` parameter values for the North Brisbane area. Research confirms the parameter exists and takes a numeric ID, but the correct ID for North Lakes / North Brisbane must be discovered empirically after API registration. The safest Phase 1 approach is to fetch at `geoRegionLevel=3` (state) and filter by haversine distance in the normaliser, switching to more targeted geo parameters once confirmed.

**Primary recommendation:** Wire up Docker Compose and DB schema first, then build the scraper and normaliser with real API data early — this validates the schema against live data before the health monitoring layer is built on top of it.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16 (latest) | Full-stack: App Router + embedded scraper host | Single process; scraper runs alongside API routes in `next start`; self-hosted via PM2 |
| TypeScript | 5.x | End-to-end type safety | Required by Next.js 16; critical when API shape drives DB schema |
| TimescaleDB | 2.24.0-pg17 | Time-series storage | PostgreSQL extension; hypertables, continuous aggregates, retention policies native |
| Drizzle ORM | 0.45.1 | Database access layer (TypeScript schema + queries) | Lightweight, SQL-close; migration files are readable plain SQL |
| Drizzle Kit | 0.31.10 | Schema migration generation | Generates SQL from TypeScript schema; custom migration support for TimescaleDB DDL |
| postgres (npm) | 3.4.8 | PostgreSQL driver | Pure-JS; what Drizzle's PG adapter is optimised for — do not use `pg` |
| node-cron | 4.2.1 | 15-minute scrape scheduler | Zero dependencies; works in long-running PM2 process (not serverless) |
| axios | 1.13.6 | HTTP client for QLD API | Interceptors for auth header injection; retry-friendly |
| zod | 4.3.6 | Runtime API response validation | Fail loudly if QLD API schema changes, not silently corrupt data |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.x | UTC → Australia/Brisbane display conversion | All timestamp display formatting; `TZDate` with explicit timezone |
| PM2 | ^5.x | Process management | `pm2 startup` generates systemd unit; keeps `next start` alive after reboots |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-cron embedded in Next.js | Separate scraper container in Docker Compose | Separate container adds deployment complexity; embedded is fine while scraper is simple |
| Drizzle custom SQL migrations for TimescaleDB DDL | Raw psql migration scripts | Same SQL; Drizzle's custom migration runner keeps migration history in one place |
| Haversine in application layer | PostGIS extension | PostGIS is overkill for a single geo-filter at ingest; plain haversine in TypeScript is correct and simpler |
| healthchecks.io (external) | Self-hosted Uptime Kuma | healthchecks.io free tier is zero-maintenance dead-man's-switch; Uptime Kuma adds another service to self-host |

**Installation:**
```bash
# Project scaffold
npx create-next-app@latest fuelsniffer --typescript --tailwind --app --eslint

# Core runtime dependencies (Phase 1 scope)
npm install axios zod drizzle-orm postgres node-cron date-fns

# Dev tools
npm install -D drizzle-kit @types/node-cron tsx

# Process manager (global on host, not in package.json)
npm install -g pm2
```

**Docker Compose (Phase 1):**
```yaml
services:
  timescaledb:
    image: timescale/timescaledb:2.24.0-pg17
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: fuelsniffer
    ports:
      - "5432:5432"
    volumes:
      - ./data/timescaledb:/var/lib/postgresql/data
    restart: unless-stopped

  app:
    build: .
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@timescaledb:5432/fuelsniffer
      QLD_API_TOKEN: ${QLD_API_TOKEN}
      TZ: Australia/Brisbane
    depends_on:
      - timescaledb
    restart: unless-stopped
```

**Version verification:** Versions above confirmed via `npm view` on 2026-03-23.

---

## Architecture Patterns

### Recommended Project Structure

```
fuelsniffer/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── health/
│   │           └── route.ts          # GET /api/health — last scrape time
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts             # Drizzle client (postgres driver)
│   │   │   ├── schema.ts             # Drizzle TypeScript schema (stations, price_readings, scrape_health)
│   │   │   └── migrations/           # SQL migration files
│   │   │       ├── 0000_schema.sql   # CREATE TABLE stations, price_readings, scrape_health
│   │   │       ├── 0001_hypertable.sql  # SELECT create_hypertable(...)
│   │   │       └── 0002_cagg.sql     # CREATE MATERIALIZED VIEW hourly_prices + policies
│   │   └── scraper/
│   │       ├── client.ts             # QLD API HTTP client (auth, retry)
│   │       ├── normaliser.ts         # Raw JSON → domain model; rawToPrice(); geo filter
│   │       ├── writer.ts             # Drizzle upsert to price_readings; heartbeat write
│   │       └── scheduler.ts          # node-cron setup; D-11 immediate start
│   └── instrumentation.ts            # Next.js instrumentation hook — starts scheduler
├── docker-compose.yml
├── drizzle.config.ts
└── .env.example
```

**Key architectural choice:** The scraper starts via `instrumentation.ts` — Next.js's official hook for running code once when the server process starts. This is the correct way to embed a scheduler in a Next.js App Router app without creating a separate process.

### Pattern 1: Next.js Instrumentation Hook for Scheduler

**What:** Next.js provides `src/instrumentation.ts` which runs once when the server starts. This is where node-cron is initialised, giving the scheduler access to the same process and environment as the API routes.

**When to use:** Always — this is the only reliable way to run startup code in Next.js App Router. Do not use API route files or middleware.

**Example:**
```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run in the Node.js runtime, not Edge runtime
    const { startScheduler } = await import('./lib/scraper/scheduler');
    startScheduler();
  }
}
```

```typescript
// src/lib/scraper/scheduler.ts
import cron from 'node-cron';
import { runScrapeJob } from './writer';

export function startScheduler() {
  // D-11: Run immediately on startup, then every 15 minutes
  runScrapeJob(); // immediate first execution

  // node-cron v4: tasks start by default when created (no 'scheduled' option)
  cron.schedule('*/15 * * * *', () => {
    runScrapeJob();
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true  // skip if previous run still executing
  });
}
```

**IMPORTANT — node-cron v4 breaking change:** In v4 (current latest: 4.2.1), the `scheduled` and `runOnInit` options are removed. Tasks start immediately when created. Use `noOverlap: true` to prevent concurrent scrape runs.

### Pattern 2: TimescaleDB Schema with Custom SQL Migrations

**What:** Drizzle Kit generates standard PostgreSQL DDL, but TimescaleDB-specific operations (hypertable creation, continuous aggregates, retention policies) must be written as custom SQL migration files. Both Drizzle schema files and custom SQL files live in the same migrations directory.

**When to use:** All TimescaleDB DDL — hypertable, cagg, policies.

**Database schema:**
```sql
-- 0000_schema.sql
CREATE TABLE stations (
  id            INTEGER PRIMARY KEY,           -- QLD API SiteId
  name          TEXT NOT NULL,
  brand         TEXT,
  address       TEXT,
  suburb        TEXT,
  postcode      TEXT,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE price_readings (
  recorded_at    TIMESTAMPTZ NOT NULL,
  station_id     INTEGER NOT NULL REFERENCES stations(id),
  fuel_type_id   INTEGER NOT NULL,
  price_cents    NUMERIC(6,1) NOT NULL,   -- stored as 145.9 (already divided by 10)
  source_ts      TIMESTAMPTZ NOT NULL     -- TransactionDateUtc from QLD API
);

CREATE TABLE scrape_health (
  id             SERIAL PRIMARY KEY,
  scraped_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prices_upserted INTEGER NOT NULL,
  duration_ms    INTEGER NOT NULL,
  error          TEXT                     -- NULL = success
);

-- 0001_hypertable.sql
SELECT create_hypertable('price_readings', 'recorded_at');
CREATE INDEX ON price_readings (station_id, fuel_type_id, recorded_at DESC);

-- 0002_cagg.sql
CREATE MATERIALIZED VIEW hourly_prices
WITH (timescaledb.continuous) AS
SELECT
  station_id,
  fuel_type_id,
  time_bucket('1 hour', recorded_at) AS bucket,
  AVG(price_cents)::NUMERIC(6,1)     AS avg_price_cents,
  MIN(price_cents)                   AS min_price_cents,
  MAX(price_cents)                   AS max_price_cents
FROM price_readings
GROUP BY station_id, fuel_type_id, bucket;

-- Refresh hourly_prices every hour, keeping it current
SELECT add_continuous_aggregate_policy('hourly_prices',
  start_offset => INTERVAL '2 hours',
  end_offset   => INTERVAL '0 hours',
  schedule_interval => INTERVAL '1 hour'
);

-- D-04: Retain raw 15-min rows for 7 days (locked decision)
SELECT add_retention_policy('price_readings', INTERVAL '7 days');
```

**Note on cagg refresh policy:** `start_offset => INTERVAL '2 hours'` ensures the retention policy (7 days) does not delete raw rows that have not yet been aggregated. The cagg refresh must fully materialise before raw rows are eligible for deletion.

### Pattern 3: Price Normalisation with rawToPrice()

**What:** Define a single canonical function for converting the QLD API integer to cents/litre. Used in the normaliser, never inline.

**When to use:** Every place that touches a raw API `Price` value.

```typescript
// src/lib/scraper/normaliser.ts

/** Convert raw QLD API price integer to cents per litre.
 *  e.g. rawToPrice(1459) → 145.9
 *  The API returns integers where value/10 = cents per litre. */
export function rawToPrice(raw: number): number {
  const converted = raw / 10;
  // DB assertion: plausible fuel price range for Australia
  if (converted < 50 || converted > 400) {
    throw new Error(`rawToPrice: value ${converted} outside expected range 50–400 c/L (raw: ${raw})`);
  }
  return converted;
}
```

### Pattern 4: Haversine Distance Filter

**What:** Filter stations to ~50km of North Lakes (lat: -27.2353, lng: 153.0189) during normalisation, not at query time (D-06).

```typescript
// src/lib/scraper/normaliser.ts
const NORTH_LAKES_LAT = -27.2353;
const NORTH_LAKES_LNG = 153.0189;
const MAX_RADIUS_KM = 50;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadius(lat: number, lng: number): boolean {
  return haversineDistanceKm(NORTH_LAKES_LAT, NORTH_LAKES_LNG, lat, lng) <= MAX_RADIUS_KM;
}
```

### Pattern 5: healthchecks.io Dead-Man's-Switch

**What:** After each successful scrape cycle, the scraper pings a unique URL provided by healthchecks.io. If the ping stops arriving within the expected period + grace period, healthchecks.io sends an alert email.

**When to use:** Always — this is the primary external alerting mechanism for scraper silence.

```typescript
// src/lib/scraper/writer.ts
async function pingHealthchecks(): Promise<void> {
  const pingUrl = process.env.HEALTHCHECKS_PING_URL;
  if (!pingUrl) return; // gracefully skip if not configured
  try {
    await axios.get(pingUrl, { timeout: 5000 });
  } catch {
    // ping failure is non-fatal; log but don't throw
    console.error('[scraper] healthchecks.io ping failed');
  }
}
```

**Setup:** Register a check at healthchecks.io (free tier). Set period = 15 minutes, grace = 5 minutes. Copy the ping URL to `.env` as `HEALTHCHECKS_PING_URL`.

### Pattern 6: /api/health Route

**What:** A lightweight Next.js Route Handler that returns the last successful scrape record from `scrape_health`.

```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { scrapeHealth } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const [latest] = await db
    .select()
    .from(scrapeHealth)
    .orderBy(desc(scrapeHealth.scrapedAt))
    .limit(1);

  const lastSuccess = latest?.error === null ? latest : null;
  const minutesAgo = lastSuccess
    ? Math.round((Date.now() - new Date(lastSuccess.scrapedAt).getTime()) / 60000)
    : null;

  return NextResponse.json({
    status: lastSuccess ? 'ok' : 'degraded',
    last_scrape_at: lastSuccess?.scrapedAt ?? null,
    minutes_ago: minutesAgo,
    prices_last_run: lastSuccess?.pricesUpserted ?? null,
  });
}
```

### Pattern 7: Retry Logic with Exponential Backoff (D-08)

**What:** D-08 requires 3 retries with backoff before skipping the cycle.

```typescript
// src/lib/scraper/client.ts
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 1000 * 2 ** attempt; // 2s, 4s, 8s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('unreachable');
}
```

### Anti-Patterns to Avoid

- **Starting node-cron in an API route file:** API route modules may be executed multiple times or in edge runtime — always use `src/instrumentation.ts` for startup code.
- **Using Drizzle Kit migrations for TimescaleDB DDL:** Drizzle Kit will not generate `create_hypertable()` calls. Always write hypertable/cagg SQL in numbered custom migration files and apply them manually or via a migration script.
- **Tracking `latest` Docker tag for TimescaleDB:** The `latest` tag can auto-upgrade the PostgreSQL major version, breaking the data volume. Always pin `timescale/timescaledb:2.24.0-pg17`.
- **Using `Australia/Sydney` for timezone:** Sydney observes DST (UTC+11 in summer). Queensland is permanently UTC+10. Always use `Australia/Brisbane`.
- **Inline price division:** Never write `price / 10` outside of `rawToPrice()`. A single canonical function ensures the validation assertion runs consistently.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduled task execution | Custom setInterval loop | node-cron v4 with `noOverlap: true` | Cron syntax is readable, handles drift, prevents overlapping runs |
| QLD API response validation | Manual type checks | Zod schema | Catches upstream schema changes at ingest time before DB corruption |
| Dead-man's-switch monitoring | Self-hosted alerting service | healthchecks.io free tier | Zero maintenance; sends alerts when ping stops regardless of server state |
| Distance calculations | PostGIS extension | Haversine TypeScript function | PostGIS is overkill for a single ingest-time filter with 50 stations |
| Schema migrations | Raw psql scripts | Drizzle Kit + custom SQL files | Drizzle tracks migration state; custom files handle TimescaleDB DDL |
| Process restart on crash | Bash keep-alive scripts | PM2 with `--restart-delay` | PM2 handles restart, logs, and systemd integration |

**Key insight:** For this scale (one server, ~150 stations, 15-min polling), simplicity beats robustness infrastructure. Every additional service (Redis, BullMQ, Uptime Kuma) is another thing to maintain on a home server.

---

## Common Pitfalls

### Pitfall 1: Price Integer Encoding (Day-One Correctness Trap)

**What goes wrong:** QLD API returns `Price: 1459`. If not divided by 10, stored values are `1459` instead of `145.9`. Charts show $14.59/L. Fixing after data accumulates requires a full table migration.

**Why it happens:** API documentation is sparse; developers assume returned values match display values.

**How to avoid:** Use `rawToPrice()` exclusively with a range assertion (50–400 c/L). Add a smoke test that fetches one live price and asserts the stored value is in range before the first full scrape.

**Warning signs:** Stored `price_cents` values in the 1000–2500 range.

### Pitfall 2: Timezone — Australia/Brisbane vs Australia/Sydney

**What goes wrong:** `Australia/Sydney` observes DST and shifts to UTC+11 between October and April. Brisbane stays UTC+10 year-round. Using Sydney causes 1-hour chart drift for half the year.

**Why it happens:** Sydney is the most-cited Australian timezone in online examples.

**How to avoid:**
- `TZ=Australia/Brisbane` in Docker Compose `environment` and PM2 ecosystem config
- All timestamps stored as UTC in the database
- All display conversions use `{ timeZone: 'Australia/Brisbane' }` explicitly
- Write a timezone unit test: a known UTC timestamp converts to the same Brisbane hour regardless of month

**Warning signs:** Chart X-axis labels shift by one hour in October–April.

### Pitfall 3: Scraper Silent Failure

**What goes wrong:** node-cron swallows exceptions from the job function. The process keeps running, but no data is written and no error appears.

**Why it happens:** Async exceptions in cron callbacks are not automatically surfaced.

**How to avoid:**
- Wrap the entire scrape job in try/catch; write to `scrape_health` on both success and failure
- healthchecks.io ping only fires on success — a failure naturally triggers the dead-man's-switch
- Distinguish between "API returned empty" (valid if no price changes) and "API unreachable" (failure)

**Warning signs:** `scrape_health` table has gaps; healthchecks.io sends an alert email.

### Pitfall 4: Drizzle Kit Cannot Generate TimescaleDB DDL

**What goes wrong:** Running `drizzle-kit generate` only produces standard `CREATE TABLE` SQL. It does not emit `create_hypertable()`, `CREATE MATERIALIZED VIEW WITH (timescaledb.continuous)`, or `add_retention_policy()`. If a developer assumes all migration SQL comes from Drizzle Kit, the hypertable and cagg are never created.

**Why it happens:** Drizzle Kit has no knowledge of TimescaleDB extensions. The TimescaleDB support feature request has been open since 2024 and is not yet implemented (as of 2026-03-23).

**How to avoid:** Write TimescaleDB DDL in manually-created numbered SQL files in the migrations directory. Run them in order after the Drizzle-generated table DDL. Document this in a `db/README.md` so it is not forgotten.

**Warning signs:** `price_readings` table exists but is not a hypertable; `hourly_prices` view does not exist; no retention policy is active.

### Pitfall 5: node-cron v4 Breaking Changes

**What goes wrong:** Code written for node-cron v3 uses `{ scheduled: false }` or `{ runOnInit: true }` options. In v4 (current: 4.2.1), these options are removed. Tasks start immediately when created; there is no way to create a stopped task without using the separate `createTask()` API.

**Why it happens:** Many tutorials still reference v3 API. Upgrading without reading the migration guide produces runtime errors.

**How to avoid:** Use the v4 API. To implement D-11 (immediate start), call the scrape function once before `cron.schedule()`. Use `noOverlap: true` to prevent concurrent runs.

### Pitfall 6: geoRegionId is Unknown Before Live API Access

**What goes wrong:** The `geoRegionId` parameter values for North Brisbane are not publicly documented. If a developer hardcodes a guessed ID, the API may return an empty dataset or data for the wrong region, with no error — just zero rows.

**Why it happens:** The API documentation requires a registered account to access.

**How to avoid:**
- After registration, call `GET /Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1` (state-level) first to see all station data
- Apply haversine distance filter in the normaliser to select ~50km of North Lakes
- Once station lat/lng data confirms which geoRegionIds exist, optionally narrow the API call
- Never skip the geo filter in the normaliser regardless of API-level filtering

**Warning signs:** API returns either zero stations or thousands (all of QLD) with no error.

### Pitfall 7: Continuous Aggregate Refresh Precedes Retention Policy Drop

**What goes wrong:** If the cagg refresh `start_offset` is shorter than the retention policy window, raw rows may be dropped before the cagg has materialised them, creating gaps in the hourly aggregate.

**Why it happens:** The two policies are set independently and their interaction is not obvious.

**How to avoid:** Set cagg `start_offset` to match or exceed the retention policy interval. For a 7-day raw retention, set `start_offset => INTERVAL '8 days'` on the cagg policy to ensure it always covers the full retention window before deletion.

**Warning signs:** `hourly_prices` has gaps that do not correspond to gaps in raw data.

---

## Code Examples

### QLD API Client with Auth and Retry

```typescript
// src/lib/scraper/client.ts
import axios from 'axios';
import { z } from 'zod';

const BASE_URL = 'https://fppdirectapi-prod.fuelpricesqld.com.au';

const SitePriceSchema = z.object({
  SiteId: z.number(),
  FuelId: z.number(),
  CollectionMethod: z.string(),
  TransactionDateUtc: z.string(),
  Price: z.number(),
});

const PricesResponseSchema = z.object({
  SitePrices: z.array(SitePriceSchema),
  Brands: z.array(z.unknown()).optional(),
  Stations: z.array(z.unknown()).optional(),
});

export type SitePrice = z.infer<typeof SitePriceSchema>;

export async function fetchSitesPrices(
  geoRegionLevel: number,
  geoRegionId: number
): Promise<SitePrice[]> {
  const response = await axios.get(`${BASE_URL}/Price/GetSitesPrices`, {
    headers: {
      Authorization: `FPDAPI SubscriberToken=${process.env.QLD_API_TOKEN}`,
    },
    params: { countryId: 21, geoRegionLevel, geoRegionId },
    timeout: 15000,
  });

  const parsed = PricesResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(`QLD API response schema mismatch: ${parsed.error.message}`);
  }
  return parsed.data.SitePrices;
}
```

### Upsert with D-09 (Always Insert)

```typescript
// src/lib/scraper/writer.ts
import { db } from '@/lib/db/client';
import { priceReadings } from '@/lib/db/schema';

export async function upsertPriceReadings(rows: PriceRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  // D-09: Always insert; ON CONFLICT DO NOTHING prevents true duplicates
  // (same station + fuel type + same 15-min bucket)
  const result = await db
    .insert(priceReadings)
    .values(rows)
    .onConflictDoNothing();

  return result.rowCount ?? rows.length;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron v3 `{ scheduled: false, runOnInit: true }` | node-cron v4: tasks start immediately; use `createTask()` for deferred start | v4.0 (2024) | Breaking change — v3 code fails silently or throws at startup |
| Drizzle ORM `^0.30` with `pg` driver | Drizzle ORM `^0.45` with `postgres` driver | 2024–2025 | `pg` adapter still works but `postgres` is the recommended driver |
| PM2 + separate scraper process | Next.js `instrumentation.ts` + embedded node-cron | Next.js 13.5+ | Eliminates separate process; simpler Docker Compose |
| Manual `psql` for TimescaleDB setup | Drizzle custom SQL migrations alongside Drizzle schema | Ongoing | TimescaleDB DDL still manual but managed alongside schema history |

**Deprecated/outdated:**
- `node-cron` `runOnInit` option: removed in v4; use explicit immediate call before `cron.schedule()`
- `australia/sydney` for QLD: always wrong for this project — use `australia/brisbane`
- TimescaleDB `latest` Docker tag: do not use; pins to current major PostgreSQL version at pull time, may auto-upgrade on next pull

---

## Open Questions

1. **geoRegionId for North Brisbane**
   - What we know: The API takes `geoRegionLevel` (1=suburb, 2=city, 3=state) and a numeric `geoRegionId`
   - What's unclear: The correct IDs for the North Lakes / North Brisbane area are not publicly documented
   - Recommendation: After registration, call the state-level endpoint first (level=3) and use haversine filtering. Once live data confirms station lat/lng, identify which city/suburb IDs cover the target area for future optimisation. Do not block Phase 1 on this — haversine filter is the safe fallback.

2. **QLD API rate limits and ToS**
   - What we know: The API is free; registration is required; ToS must be accepted
   - What's unclear: Whether 15-min polling at state level triggers any rate limit; whether ToS restricts commercial use (irrelevant here but worth noting)
   - Recommendation: Review ToS during registration. Log the response time of the first few API calls; if responses are slow, switch from state-level to city-level filtering.

3. **QLD API token rotation policy**
   - What we know: A token is issued at registration; the government has deprecated API feeds before
   - What's unclear: Whether tokens have an expiry date or can be rotated unilaterally
   - Recommendation: Build a `RUNBOOK.md` entry for token renewal from day one. The health monitoring (DATA-03) will catch a 401 response if the token is revoked.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via `@vitejs/plugin-react` or standalone) |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=verbose src/lib/scraper/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | `rawToPrice(1459)` returns `145.9` | unit | `npx vitest run src/lib/scraper/normaliser.test.ts` | Wave 0 |
| DATA-01 | `rawToPrice(500)` throws range assertion | unit | `npx vitest run src/lib/scraper/normaliser.test.ts` | Wave 0 |
| DATA-01 | Auth header format is `FPDAPI SubscriberToken=...` | unit | `npx vitest run src/lib/scraper/client.test.ts` | Wave 0 |
| DATA-02 | Zod schema rejects malformed API response | unit | `npx vitest run src/lib/scraper/client.test.ts` | Wave 0 |
| DATA-02 | `isWithinRadius` correctly filters by 50km from North Lakes | unit | `npx vitest run src/lib/scraper/normaliser.test.ts` | Wave 0 |
| DATA-03 | `/api/health` returns `status: ok` when latest scrape has no error | integration | `npx vitest run src/app/api/health/route.test.ts` | Wave 0 |
| DATA-04 | UTC timestamp stored; `Australia/Brisbane` display shows correct hour | unit | `npx vitest run src/lib/timezone.test.ts` | Wave 0 |
| DATA-04 | UTC timestamp does NOT shift in October (no DST) | unit | `npx vitest run src/lib/timezone.test.ts` | Wave 0 |
| DATA-05 | `hourly_prices` cagg returns rows after raw ingest | integration (DB) | manual smoke test against running DB | manual |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/scraper/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — install with `npm install -D vitest @vitejs/plugin-react`
- [ ] `src/lib/scraper/normaliser.test.ts` — covers DATA-01, DATA-02 (price encoding, geo filter)
- [ ] `src/lib/scraper/client.test.ts` — covers DATA-01, DATA-02 (auth header, Zod validation)
- [ ] `src/lib/timezone.test.ts` — covers DATA-04 (UTC storage, Brisbane display, no DST shift)
- [ ] `src/app/api/health/route.test.ts` — covers DATA-03 (health endpoint response shape)

---

## Sources

### Primary (HIGH confidence)

- [TimescaleDB Continuous Aggregates documentation](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/refresh-policies/) — cagg refresh policy parameters
- [TimescaleDB Data Retention with Continuous Aggregates](https://github.com/timescale/docs/blob/latest/use-timescale/data-retention/data-retention-with-continuous-aggregates.md) — cagg + retention interaction
- [TimescaleDB Docker Hub — timescale/timescaledb:2.24.0-pg17](https://hub.docker.com/r/timescale/timescaledb) — confirmed image tag
- [Next.js 16 release blog](https://nextjs.org/blog/next-16) — confirmed version, Node.js 20.9+ requirement
- [node-cron v4 migration guide](https://nodecron.com/migrating-from-v3) — confirmed breaking changes: `scheduled` / `runOnInit` removed
- [node-cron npm](https://www.npmjs.com/package/node-cron) — confirmed v4.2.1 current
- [healthchecks.io cron job monitoring docs](https://healthchecks.io/docs/monitoring_cron_jobs/) — ping URL integration pattern
- npm registry (verified 2026-03-23): drizzle-orm@0.45.1, drizzle-kit@0.31.10, axios@1.13.6, zod@4.3.6, postgres@3.4.8

### Secondary (MEDIUM confidence)

- [Home Assistant Community — Queensland Fuel Prices Integration](https://community.home-assistant.io/t/queensland-fuel-prices-integration/406642) — confirmed API endpoints, auth header format, price integer encoding
- [QLD Open Data Portal — Fuel Price Reporting 2025](https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025) — API availability, field names, monthly CSV fallback
- [Drizzle ORM — TimescaleDB support issue #2962](https://github.com/drizzle-team/drizzle-orm/issues/2962) — confirmed native TimescaleDB DDL is NOT supported by Drizzle Kit as of 2026
- [Drizzle ORM — Custom migrations docs](https://orm.drizzle.team/docs/kit-custom-migrations) — documented pattern for writing custom SQL alongside Drizzle schema

### Tertiary (LOW confidence / validate on implementation)

- [FuelPricesQLD Direct API (OUT) v1.6 PDF](https://www.fuelpricesqld.com.au/documents/FuelPricesQLDDirectAPI(OUT)v1.6.pdf) — official docs; requires registration to access; geoRegionId values unconfirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified via npm registry 2026-03-23
- Architecture patterns: HIGH — Next.js instrumentation hook, TimescaleDB cagg, node-cron v4 all verified against official docs
- Drizzle + TimescaleDB integration: HIGH — confirmed limitation documented via official Drizzle GitHub issue
- QLD API specifics: MEDIUM — endpoint structure confirmed via community sources; geoRegionId values require live API access
- Pitfalls: HIGH — price encoding, timezone, node-cron v4 breaking change, Drizzle limitation all verified

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (30 days — node-cron and Drizzle are actively developed; check for updates before implementation)
