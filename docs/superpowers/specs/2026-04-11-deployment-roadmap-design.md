# FuelSniffer Deployment Roadmap — V1 Launch Design

**Date:** 2026-04-11
**Status:** Draft (awaiting sub-agent review and user sign-off)
**Owner:** Christopher Dennis
**Executive summary:** Ship a public-browse, no-login V1 of FuelSniffer that covers QLD and NSW, adds a differentiated "find cheap fuel on your drive" trip planner, captures interest for a future logged-in experience via a waitlist, and lands with a defensible security baseline and genuine WCAG 2.2 AA accessibility. Four sequential phases totalling roughly 14 weeks of engineering work (post adversarial review — earlier draft estimated 12 weeks before added items for error monitoring, data collection notice, SEO/OG metadata, and a more honest Leaflet keyboard accessibility scope). No soft-launch — one cohesive launch.

---

## 1. Launch goal and success criteria

### 1.1 What V1 launch means

FuelSniffer goes public at a real URL. Anyone can visit, browse stations, use the filter bar, see the map, view a 7-day price chart, plan a trip along a driving route, and join a waitlist for a future logged-in experience. Covers QLD and NSW at launch. No user accounts in V1.

### 1.2 Explicitly deferred (waitlist hooks, not V1 features)

- User accounts and login
- Loyalty-adjusted pricing
- Saved favourites, home/work locations
- 30+ day historical charts and seasonal trends
- Price alerts
- PWA install, offline, on-the-road refuel windows
- Additional states beyond NSW and QLD
- Multi-stop trip planning
- Traffic-aware routing
- Double opt-in waitlist confirmation
- Self-service waitlist deletion
- External pentest

### 1.3 Launch success criteria

1. **Functional** — every feature from the V1 scope works end-to-end in production on desktop Chrome, desktop Safari, and iOS Safari.
2. **Security** — `npm audit` clean (no highs/criticals), `securityheaders.com` grade A or better, rate limits verified via integration test, waitlist resists simple spam flood.
3. **Accessibility** — `axe-core` zero violations across every page, keyboard-only navigation works end-to-end, tested with VoiceOver (iOS + macOS) and NVDA (Windows Firefox), accessibility statement published.
4. **Operational** — hourly DB backups running cleanly for 7 days, weekly restore verification working, monitoring and alerting wired up, runbooks exist for every alert type.
5. **Trust** — privacy policy, terms of use, and accessibility statement live at discoverable URLs before launch.

### 1.4 Cross-cutting requirement — testing discipline

Every ticket in every phase must land with:

1. **Backend tests** where backend code changed — Vitest unit tests for pure logic, integration tests against a real test Postgres (not mocks) following the existing `src/__tests__/` pattern.
2. **Frontend tests** where frontend code changed — React Testing Library component tests exercising behaviour and ARIA state.
3. **User acceptance tests** — an explicit, runnable checklist of falsifiable statements (e.g., "I can type a postcode, hit enter, and the map pans to that suburb within 2 seconds" — not "the search feels fast").
4. **Definition of Done for every ticket**:
    - All three test types exist and pass
    - `npm test` green
    - `npx tsc --noEmit` green
    - `axe-core` zero violations for any touched page
    - User acceptance checklist explicitly signed off (with screenshots or video evidence where appropriate)
    - No new `npm audit` highs/criticals

Ticket templates scale — a tiny ticket gets a tiny set of tests, a big ticket gets a big set — but the three types must be **present**, not cut.

---

## 2. Architecture — the abstractions that shape V1

### 2.1 Fuel price provider abstraction

**Problem:** QLD today, NSW next, WA/NT/TAS later. Without an abstraction, each state's quirks bleed into the scraper and writer.

**Design:** A `FuelPriceProvider` interface that every state integration implements. The scheduler iterates over registered providers and invokes each one — it doesn't know or care how many there are.

```typescript
interface FuelPriceProvider {
  readonly id: string              // 'qld' | 'nsw' | 'wa' ...
  readonly displayName: string
  readonly regionBounds: BBox

  fetchStations(): Promise<RawStation[]>
  fetchPrices(): Promise<RawPrice[]>
  normaliseStation(raw: RawStation): NormalisedStation
  normalisePrice(raw: RawPrice): NormalisedPrice
  healthCheck(): Promise<ProviderHealth>
}
```

**Key points:**

- Raw types live in the provider package; normalised types are a shared domain model.
- `NormalisedStation` has a `source_provider` field; we never mix provider data after join.
- Each provider has its own rate-limit budget, retry policy, and circuit breaker.
- Brand strings get normalised at the provider layer via a shared `brand_aliases` table (`7-ELEVEN` → `7-Eleven`).
- Existing QLD scraper code becomes `QldFuelProvider` — a refactor, not a rewrite.
- NSW FuelCheck becomes `NswFuelProvider` — new code, same interface.
- Provider failures are isolated: NSW going down does not stop the QLD scrape.
- New DB migration adds `source_provider` column to `stations` and `price_readings`.

**Schema delta (critical — this is a real migration, not a prose hand-wave):**

The current `stations.id` is `INTEGER PRIMARY KEY` and the value is literally the QLD API's `SiteId`. NSW FuelCheck has its own integer IDs that *will* collide. We need to demote the QLD SiteId to a namespaced external identifier and introduce a surrogate primary key. `price_readings.station_id` references `stations.id` today and must follow.

Migration sequence (Phase 1 ticket 1 executes this exactly):

```sql
-- Step 1: add the new columns as nullable
ALTER TABLE stations
  ADD COLUMN external_id VARCHAR(64),
  ADD COLUMN source_provider VARCHAR(16);

ALTER TABLE price_readings
  ADD COLUMN source_provider VARCHAR(16);

-- Step 2: backfill existing rows — every current row is QLD
UPDATE stations
  SET external_id = id::text,
      source_provider = 'qld';

UPDATE price_readings
  SET source_provider = 'qld';

-- Step 3: enforce NOT NULL now that rows are populated
ALTER TABLE stations
  ALTER COLUMN external_id SET NOT NULL,
  ALTER COLUMN source_provider SET NOT NULL;

ALTER TABLE price_readings
  ALTER COLUMN source_provider SET NOT NULL;

-- Step 4: composite uniqueness on the natural key, so NSW ids can coexist
CREATE UNIQUE INDEX stations_provider_external_id_uniq
  ON stations (source_provider, external_id);
```

**PK strategy:** `stations.id` stays as-is for V1. It's still an integer, still the primary key, still referenced by `price_readings.station_id`. QLD rows keep their existing numeric id values; NSW rows get *newly-assigned* surrogate ids from a `BIGSERIAL` or `nextval()` that is guaranteed not to collide with existing QLD values.

Concretely, we add a sequence that starts above the current max QLD id, and NSW inserts draw from it:

```sql
CREATE SEQUENCE stations_nsw_id_seq START 10000000;  -- well above real QLD SiteIds
```

NSW provider code calls `nextval('stations_nsw_id_seq')` when inserting new stations. Any future provider gets its own sequence with its own `START` value. The `(source_provider, external_id)` unique index is what actually guarantees no collisions at the data level; the sequence approach is the mechanism we use to pick collision-safe surrogate ids.

*Rejected alternatives*: (a) switching `stations.id` to `BIGSERIAL` and rewriting every query and FK — too invasive for Phase 1; (b) making the PK a composite `(source_provider, external_id)` — breaks `price_readings.station_id` which is `INTEGER`.

This is the single riskiest migration in the whole roadmap. The Phase 1 ticket must include a rollback plan, a backup taken before execution, and an integration test that proves QLD queries still return the same rows before and after.

### 2.2 Routing provider abstraction

**Problem:** Mapbox today, potentially OSRM or another provider tomorrow, for the same single question — "give me the polyline(s) from A to B".

**Design:** A `RoutingProvider` interface identical in shape to the fuel one. Mapbox is the V1 implementation; OSRM is the documented escape hatch.

```typescript
interface RoutingProvider {
  readonly id: string
  readonly displayName: string

  route(
    start: Coord,
    end: Coord,
    options: { alternatives: boolean, profile: 'driving' }
  ): Promise<RouteResult>
}

interface RouteResult {
  primary: Route
  alternatives: Route[]
}

interface Route {
  polyline: Coord[]
  distanceMeters: number
  durationSeconds: number
  label?: string
}
```

**Key points:**

- Routing never happens in the browser. The browser calls our API, our API calls the provider. This hides the Mapbox API key from the client and gives us a choke-point to cache and rate-limit routing requests.
- Routing responses are cached by `(start_rounded, end_rounded, alternatives, profile)` for 24 hours in Postgres. Roads don't move.
- Start/end coordinates are rounded to ~100m precision (4 decimal places) before cache lookup. Near-identical trips share a cache entry.
- If Mapbox is down or over-budget, the API returns 503. Trip planner degrades; the rest of the app stays up.

### 2.3 Trip corridor search

**Problem:** Given a polyline and a radius, return the stations close enough to the route to be worth stopping at.

**Design:** A single Postgres query using PostGIS distance functions.

```sql
-- Pseudocode
SELECT s.*, p.price_cents,
       ST_Distance(s.geom, route_linestring) AS detour_meters
FROM stations s
JOIN latest_prices p ON p.station_id = s.id AND p.fuel_type_id = $fuel
WHERE ST_DWithin(s.geom, route_linestring, $corridor_m)
  AND s.source_provider = ANY($providers)
ORDER BY p.price_cents ASC
LIMIT 50;
```

**Key points:**

- Stations need a PostGIS `geometry(Point, 4326)` column with a GIST index (new migration).
- The route polyline is converted to a `LINESTRING` on the fly in the API route.
- `$corridor_m` is driven by the UI slider (range 0.5km to 20km, default 2km).
- Results returned cheapest-first within the corridor; the UI can re-sort by detour time client-side.
- Brand exclude-list filter is injected as `AND s.brand NOT IN (...)` when applicable.
- Switching to an alternative route re-runs the query per-route. We do not pre-compute all alternatives' corridors in one shot.

### 2.4 Waitlist capture

**Problem:** Public users have zero write capability *except* waitlist signup. That endpoint is the single most exposed PII surface in V1.

**Design:** A dedicated table, a dedicated API route, hardened end-to-end.

```sql
CREATE TABLE waitlist_signups (
  id           BIGSERIAL PRIMARY KEY,
  email_hash   BYTEA NOT NULL,        -- sha256(lower(trim(email)) || pepper)
  email_enc    BYTEA NOT NULL,        -- AES-GCM encrypted email
  source       VARCHAR(32) NOT NULL,  -- 'historical-chart-cta' | 'brand-filter-cta' | ...
  consent_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash      BYTEA,                 -- sha256(ip || pepper) — non-PII-adjacent
  ua_hash      BYTEA,                 -- sha256(user_agent) — enough for abuse correlation, not fingerprinting
  UNIQUE (email_hash)
);
```

**Key points:**

- Email stored encrypted at rest (AES-256-GCM) and hashed for duplicate detection. Even if the DB is exfiltrated, the attacker needs the pepper and AES key to read emails.
- **Encryption format for `email_enc`**: a single binary blob structured as `nonce(12 bytes) || ciphertext || auth_tag(16 bytes)`. The nonce is generated fresh on every encryption call via `crypto.randomBytes(12)`. Decryption splits the blob, extracts the nonce, and passes it to the GCM decipher. Nonce reuse is impossible because we never reuse a generated value, and at waitlist scale (thousands of rows) the birthday-collision probability of random 96-bit nonces is astronomically negligible.
- Pepper and AES key live in env vars (separate from each other and from `SESSION_SECRET`), rotated via runbook.
- IP is hashed, not stored raw. Hashed IPs stay useful for "same attacker, different emails" detection while being non-PII-adjacent.
- `source` field lets us measure which CTA converted the signup.
- Rate limit: 3 signups per `ip_hash` per 24h at middleware.
- Honeypot field: invisible `website` input — non-empty submissions are silently accepted (return 200, store nothing) so bots learn nothing.
- Double opt-in deferred to post-launch. V1 uses single opt-in with clear consent copy.
- Deletion: V1 uses a manual deletion script triggered by email request; self-service deferred until login exists.

### 2.5 Component boundaries

```
src/lib/
├── providers/
│   ├── fuel/
│   │   ├── index.ts          — registry, interface, shared types
│   │   ├── qld/              — existing scraper, refactored
│   │   ├── nsw/              — new FuelCheck adapter
│   │   └── brand-normaliser.ts
│   └── routing/
│       ├── index.ts          — interface + types
│       └── mapbox/           — Mapbox Directions adapter
├── scraper/
│   └── scheduler.ts          — loops over registered fuel providers
├── trip/
│   ├── corridor-query.ts     — the PostGIS station-match query
│   └── maps-deeplink.ts      — Apple/Google Maps URL builders
├── waitlist/
│   ├── encryption.ts         — encrypt/decrypt email at rest
│   └── honeypot.ts           — honeypot field validation
├── security/
│   ├── rate-limit.ts         — middleware + Postgres-backed token bucket
│   ├── audit-log.ts          — structured audit log helpers
│   └── csp.ts                — CSP header builder with nonce support
└── a11y/
    └── map-keyboard-nav.ts   — shared Leaflet keyboard handlers
```

Every directory has its own `__tests__/` folder. No file exceeds ~300 lines — if it does, that's a signal to split.

---

## 3. Phase 1 — NSW + foundation

**Goal:** Prove the provider abstraction by shipping a second state on top of it, while putting baseline security and accessibility in place so all subsequent work is built on solid ground.

**Duration:** ~3.5 weeks (17 engineering days plus review/rework buffer)

### 3.1 Tickets

**Feature work:**

1. **Provider abstraction design + refactor** (~2 days)
    - Define `FuelPriceProvider` interface and shared normalised types.
    - Refactor existing QLD scraper into `QldFuelProvider`. Zero behaviour change.
    - Scheduler loops over a provider registry.
    - New migration: `source_provider` column on `stations` and `price_readings`, backfill existing rows to `qld`, composite unique index.
    - Existing tests still pass, plus new tests for the registry and scheduler loop isolation.

2. **Brand normaliser** (~1 day)
    - New `brand_aliases` table `(raw_brand, canonical_brand)`.
    - Seed with known QLD aliases from current data.
    - `normaliseBrand(raw: string): string` function called in provider `normaliseStation`.
    - Tests cover case variation, whitespace, typos, unknown brand passthrough.

3. **NSW FuelCheck integration** (~4 days)
    - Register for NSW FuelCheck API credentials.
    - `NswFuelProvider` implementation — OAuth2 auth, station and price fetch endpoints, normaliser.
    - Add NSW brand aliases to the normaliser seeds.
    - Unit tests using recorded fixture responses.
    - Integration test: fresh DB, run scheduler once with both providers, assert both states are present.
    - UI change: subtle "QLD + NSW" badge in the header, no filter UI.

4. **Cross-border radius search** (~1 day)
    - Existing prices query already uses `ST_DWithin`. Nothing changes architecturally.
    - Verify Tweed Heads returns stations on both sides of the border.
    - UI test for the border scenario.

**Infrastructure prerequisite:**

5. **PostGIS container image switch** (~1.5 days — this is a downtime event, not a flag flip)
    - **Problem:** the existing deployment runs `postgres:17-alpine` with a persistent volume at `./data/postgres`. You cannot simply change the image to `postgis/postgis:17-alpine` and restart — `CREATE EXTENSION postgis` will fail because the `postgis` shared-object files are not in the lib path of the image that initialised the cluster. The data directory is binary-compatible across images with the same Postgres major version, but extensions must be present in the running image's `pkglibdir`.
    - **Procedure (document in the ticket and follow exactly):**
      1. Announce maintenance window (~30 min).
      2. Stop the `app` and `db-backup` containers. Leave `postgres` running.
      3. Take a full `pg_dumpall` into `./backups/pre-postgis-<timestamp>.sql.gz` and verify the file is non-empty.
      4. Stop `postgres`.
      5. Move `./data/postgres` to `./data/postgres.bak-<timestamp>` (rename, do not delete — this is the rollback).
      6. Edit `docker-compose.yml` to change the image to `postgis/postgis:17-3.4-alpine` (pin the PostGIS minor version; `17-alpine` alone is too loose for a production image).
      7. Bring up `postgres` with the new image. It will initialise a fresh empty cluster in `./data/postgres`.
      8. Wait for healthcheck, then `docker exec` into the container and run `CREATE EXTENSION postgis;` as the superuser. Verify with `SELECT postgis_version();`.
      9. Restore the dump: `gunzip -c ./backups/pre-postgis-<timestamp>.sql.gz | docker exec -i fuelsniffer-postgres-1 psql -U fuelsniffer -d fuelsniffer`.
      10. Bring up `app` and `db-backup`.
      11. Run the existing integration test suite against the restored DB.
      12. Only after green tests: delete `./data/postgres.bak-<timestamp>`.
    - **Rollback:** if step 9 or 11 fails, stop `postgres`, move `./data/postgres.bak-<timestamp>` back to `./data/postgres`, revert `docker-compose.yml`, restart. Total rollback time ~5 min.
    - **Migration code:** a new migration `0006_enable_postgis.sql` containing `CREATE EXTENSION IF NOT EXISTS postgis;` so fresh deployments and CI get the extension enabled automatically. Existing deployment already runs `CREATE EXTENSION` manually in step 8; the `IF NOT EXISTS` means re-running the migration is a no-op.
    - **Test:** integration suite must run clean against `postgis/postgis:17-3.4-alpine` in CI. CI's DB setup changes to use the new image.
    - **Note:** `postgis/postgis:17-3.4-alpine` is ~150 MB larger than `postgres:17-alpine` — acceptable, no action needed.

**Security baseline:**

6. **Security headers middleware** (~1 day)
    - Next.js `middleware.ts` sets: CSP (report-only initially), HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy restrictive.
    - CSP report-only endpoint that logs violations to a new `csp_violations` table.
    - Test asserts headers present on every response.

7. **Rate limiting** (~2 days)
    - **In-process in-memory token bucket**, implemented in `src/lib/security/rate-limit.ts`. Keyed by `(ip_hash, endpoint_bucket)` in a `Map<string, Bucket>`.
    - **Why not Postgres-backed**: read-modify-write against a shared row creates lock contention and correctness hazards at concurrency. Postgres is not Redis. In-memory is simpler, correct, and sufficient for V1's single-process Next.js server.
    - **Single-process assumption is explicit**: the V1 deployment runs one `app` container. If we ever scale horizontally, this must be swapped for Redis or Cloudflare rate-limiting rules. The rate-limit module exports an interface so the swap is local.
    - Middleware wrapper applies per-endpoint limits from a config file.
    - Defaults: 120 req/min for `/api/prices`, 60 req/min for `/api/search`, 30 req/min for `/api/prices/history`. Waitlist limits set in Phase 3.
    - 429 response with `Retry-After` header.
    - Bucket entries expire via a cleanup loop running every 60s to prevent unbounded memory growth. Cap: 100,000 active buckets in memory; on overflow, the oldest are evicted first.
    - **No `rate_limits` table** — scratch that from Section 9's migration list.
    - Load test: fire 150 requests at `/api/prices` in a second from a single synthetic IP, assert later ones return 429 with a `Retry-After` header; then fire 150 requests from *different* IPs, assert none are limited.

8. **Input validation sweep** (~1 day)
    - Every API route has an explicit Zod schema for query + body.
    - Invalid input returns 400 with a field-level error message, never a stack trace.
    - Test every route with a "sends garbage, expects 400" case.

**Accessibility baseline:**

9. **Contrast audit + palette fix** (~1 day)
    - Run axe-core and a contrast checker across every dashboard page.
    - Bump greys that fail 4.5:1 (body) or 3:1 (large text / UI components). The current `#8b949e` body text on `#0d1117` is ~4.1:1 and fails.
    - Update the global Tailwind palette in one place so it cascades.
    - Record before/after ratios in an addendum to this design doc.

10. **Keyboard navigation — non-map surfaces** (~1.5 days)
    - Tab through every page: filter bar, station list, station cards, detail panel, location search, distance slider, fuel select.
    - Fix missing or too-subtle focus rings. Tailwind defaults are too subtle on this theme.
    - Add a skip-link (`<a href="#main-content">Skip to main content</a>`) as the first focusable element on every page.
    - Station list becomes keyboard-navigable with arrow keys, not tab-tab-tab.
    - Map keyboard nav is Phase 2.

**Waitlist foundation:**

11. **Waitlist table + encryption plumbing** (~1 day)
    - Migration: `waitlist_signups` table per Section 2.4.
    - `src/lib/waitlist/encryption.ts` — AES-GCM encrypt/decrypt helpers, key from env.
    - No API route, no UI yet.
    - Tests for encrypt/decrypt round-trip and duplicate detection via hash.

### 3.2 Out of scope

- Any trip planner code
- Any map (Leaflet) accessibility work
- CSP enforcement mode (stays report-only until Phase 3)
- Audit logging (Phase 3)
- Abuse detection rules (Phase 3)
- Waitlist API route or UI (Phase 3)
- Screen reader testing pass (Phase 4)
- Third-state providers

### 3.3 Definition of Done for Phase 1

- [ ] Provider registry exists; QLD and NSW both run through it
- [ ] `source_provider` populated on every row in `stations` and `price_readings`
- [ ] Brand normalisation tested against at least 20 real brand strings from QLD + NSW
- [ ] Cross-border search verified with a real Tweed Heads query
- [ ] `securityheaders.com` scan grade A or better
- [ ] CSP reports flow into `csp_violations` without legitimate traffic triggering violations
- [ ] All rate limits verified by integration test
- [ ] All API routes have Zod validation
- [ ] axe-core returns zero violations on `/`, `/dashboard`, and subroutes
- [ ] Every new colour passes 4.5:1 (body) or 3:1 (large / UI)
- [ ] Keyboard-only user can reach every control on the dashboard
- [ ] Waitlist encryption helpers exist with passing round-trip tests
- [ ] `npm test` green, `npx tsc --noEmit` green, `npm audit` zero highs/criticals
- [ ] Every Phase 1 ticket has backend tests, frontend tests where applicable, and a signed-off user acceptance checklist

### 3.4 Risks and mitigations

- **NSW FuelCheck API surprise** — different coverage, rate limits, or price format. Mitigation: spike the API in a half-day before committing to the adapter schedule.
- **Brand normalisation scope creep** — many spelling variants in real data. Mitigation: V1 seed list covers top 20 brands by station count; unknowns pass through unchanged.
- **CSP breaks things** — Leaflet and Recharts load external resources. Mitigation: ship report-only, let real traffic surface violations for a week, tighten in Phase 3.
- **PostGIS missing from existing deployments** — requires image switch. Mitigation: infrastructure ticket (#5 above) is explicitly scheduled early in Phase 1.

---

## 4. Phase 2 — Trip planner

**Goal:** Ship the single most differentiated feature of V1 — "find cheap fuel along my route" — built on top of the Phase 1 foundation, with accessibility and security woven in alongside the feature code.

**Duration:** ~3.75 weeks (18.25 engineering days plus review/rework buffer)

### 4.1 Tickets

**Feature work:**

1. **Routing provider abstraction** (~1 day)
    - `RoutingProvider` interface per Section 2.2 — `route(start, end, { alternatives })` returning primary + up to 2 alternatives.
    - Registry pattern mirroring the fuel provider approach.
    - No provider implementations yet — interface and types only, tested against an in-memory fake.

2. **Mapbox Directions adapter** (~2 days)
    - `MapboxRoutingProvider` implementing the interface.
    - Polyline decoding at the adapter boundary; rest of app never sees Mapbox-specific format.
    - Error handling: network failures, 4xx, 5xx, 429 — each mapped to a discriminated error type.
    - **HTTP mocking convention**: tests use `msw` (Mock Service Worker) at the network layer, with fixture JSON files committed under `src/lib/providers/routing/mapbox/__tests__/fixtures/`. Each fixture is a real response captured once from a live Mapbox call (Brisbane→Gold Coast, Brisbane→Toowoomba, an invalid-coords case, a 429 case). The fixture-recording process is documented in a header comment at the top of `setup.ts`. Choosing `msw` because it intercepts at the `fetch` layer with no source-code changes, matches the modern Next.js + Vitest convention, and avoids polluting production code with test-only branches. **No live Mapbox calls during test runs, ever.** A CI guard fails the build if any test attempts a real outbound request.
    - `MAPBOX_TOKEN` env var — required at runtime, throws at module load if missing.

3. **Routing API route with caching** (~2 days)
    - `POST /api/trip/route` — accepts `{ start, end, alternatives }`, returns `RouteResult`.
    - New migration: `route_cache` table keyed by `(start_rounded, end_rounded, alternatives, profile)`, TTL 24h.
    - Start/end coordinates rounded to ~100m precision before cache lookup.
    - Cache hit returns stored result; miss calls provider then stores.
    - Zod validation on input.
    - Rate limit: 30 req/min per IP.
    - Tests cover cache hit, cache miss, rate limit, rounding boundaries, invalid coords.

4. **Corridor station query** (~2 days)
    - New migration: `geom geometry(Point, 4326)` column on `stations`, backfilled from existing `longitude`/`latitude` (note: column names are `latitude` and `longitude`, not `lat`/`lng`), GIST index. Backfill SQL: `UPDATE stations SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);` (lng-then-lat order is the PostGIS convention).
    - `src/lib/trip/corridor-query.ts` — the PostGIS query per Section 2.3.
    - **Function signature must accept** `excludeBrands: string[]` even though Phase 2's UI will not pass it. Phase 3 wires the brand filter into this same query without changing the signature. The Phase 2 ticket includes a unit test that calls the function with a non-empty `excludeBrands` and asserts the named brands are absent from results — even though no UI exercises this in Phase 2. This is an explicit contract obligation, not a "future enhancement".
    - Function signature also accepts `providers: string[]` for future multi-provider filtering, defaulting to all registered providers.
    - Returns cheapest-first with `detour_meters` for client-side re-sort.
    - Per-route corridor queries — not pre-computed for all alternatives.
    - Integration test against seeded DB with known coordinates and a known polyline.
    - Performance test: 100km route corridor query returns in <200ms on dev DB.

5. **Trip planner UI** (~5 days)
    - New route `/dashboard/trip` (dedicated page, not modal).
    - Start input: existing `LocationSearch` component with "use current location" button.
    - End input: existing `LocationSearch`, no current-location affordance.
    - Fuel type selector: existing `FuelSelect`.
    - Corridor width slider: 0.5km → 20km, default 2km.
    - Map canvas: Leaflet, primary route solid line, alternatives dashed in lighter colour, stations as colour-coded pins.
    - Route selector chip strip: primary + alternatives as selectable chips labelled "Primary · 45 min · 62 km", "Alt · 52 min · 58 km". Tapping switches active route and re-queries corridor.
    - Station list sorted cheapest-first with a "detour ≈+3 min" badge on each card. The badge is computed from `detour_meters` (PostGIS straight-line distance from the route polyline) divided by an assumed 60 km/h detour speed. **This is intentionally an approximation, not a road-routed detour** — calculating real road distance would require a routing call per station, which is too expensive for V1. The badge label uses "≈" to make the approximation visible to users; the trip-planner help text explicitly explains that detour times are estimates and the user's maps app will give the precise figure.
    - Per-station "Navigate" button opens maps deep-link.
    - Component tests for route selection, slider, station card interaction, keyboard navigation.
    - Loading and error states reuse existing `LoadingSkeleton` and `ErrorState` patterns.

6. **Maps deep-link builder** (~0.5 days)
    - `src/lib/trip/maps-deeplink.ts` — two pure functions:
      - `buildAppleMapsUrl(start, station, end)`
      - `buildGoogleMapsUrl(start, station, end)`
    - iOS/macOS default to Apple Maps with secondary "Use Google Maps" link.
    - Other platforms default to Google Maps with secondary "Use Apple Maps" link.
    - Unit tests for URL correctness against reference examples.

7. **On-the-road entry point** (~1 day)
    - Trip planner's "use current location" button *is* the on-the-road UX for V1.
    - Add a clearly-labelled CTA on the main dashboard ("Find fuel on my route →") linking to `/dashboard/trip`.
    - Geolocation consent copy: plain language, explains why we need location and that it never leaves the browser.
    - Fallback for denied geolocation: user types current address manually.
    - Integration test for denied-geolocation flow.

**Security woven in:**

8. **Routing API key protection** (~0.5 days)
    - `MAPBOX_TOKEN` server-only, never exposed to client.
    - Client always goes through `/api/trip/route`, never Mapbox directly.
    - Build-time grep asserts no `MAPBOX_TOKEN` reference in any file under `src/app/` that isn't server-only.
    - Mapbox URL-restriction feature configured on the token as defence in depth.

9. **Deep-link injection hardening** (~0.5 days)
    - User-typed addresses URL-encoded before embedding in Apple/Google Maps URLs.
    - Station names URL-encoded before embedding.
    - Coord values validated against Australian bounds (lat -44 to -10, lng 112 to 154); refuses to build URLs for out-of-bounds coords.
    - Unit tests for special characters, unicode, whitespace, SQL-injection-looking strings, out-of-bounds coords.

10. **Routing cache poisoning resistance** (~0.5 days)
    - Cache key includes provider ID; two providers cannot stomp each other.
    - Cache stores the provider response hash for integrity verification on read.
    - Tests for same-coords-different-providers separation and hash verification.

**Accessibility woven in:**

11. **Leaflet keyboard navigation — spike** (~2 days, see also Phase 4 ticket 3)
    - **Be honest about this**: Leaflet's built-in keyboard handler covers map pan/zoom via arrow keys only. It does *not* provide keyboard-navigable markers. Leaflet markers are SVG children of a layer, not focusable DOM nodes, and Leaflet has no public API for sequential pin navigation. This is the single hardest accessibility item in the roadmap. Published WCAG research and the Leaflet issue tracker both agree real pin keyboard nav requires either a custom `L.DivIcon`-based marker layer with real `<button>` elements and a manually-managed roving `tabindex`, or an unmaintained third-party plugin.
    - **This ticket is a time-boxed spike, not the full implementation.** Deliverables:
      - Confirm which approach (`DivIcon` custom layer vs. plugin vs. parallel DOM overlay) is viable for our pin count and map library version.
      - Build a working proof-of-concept on a throwaway branch: 10 real pins, tabbable, Enter opens popup, Escape closes, arrow keys move between them.
      - Measure the rendering impact — Leaflet with hundreds of real DOM markers is slower than SVG markers, sometimes dramatically so.
      - Write a decision doc (`docs/a11y/leaflet-keyboard-decision.md`) with three options: (a) full implementation in Phase 4, (b) partial implementation (list-view fallback for keyboard users, map stays mouse-only with documented limitation), (c) abandon map keyboard nav and document the limitation in the accessibility statement.
    - **Minimum viable deliverable for Phase 2**: all pins have `aria-label` set at the SVG level via `aria-labelledby` on the marker container, and the full station list view remains a complete keyboard-accessible alternative for sighted+keyboard users who cannot use the map. This is the "list view is the accessible map" fallback — the map is visual reinforcement, the list is the accessible interface. Leaflet pan/zoom keyboard handler is enabled so sighted keyboard users can still move the viewport.
    - The route selector chip strip, popup focus management, and station list keyboard navigation (items 12, 13, and Phase 1 item 10) are unaffected — they work regardless of pin focusability.
    - Component tests for the list fallback are already required. The decision doc determines what ships in Phase 4.

*(The full pin-keyboard-nav implementation, if the spike determines it's viable, lives in Phase 4 ticket 3. If not viable, the Phase 2 minimum deliverable above is the V1 state and the limitation is documented in the accessibility statement.)*

12. **Route selector chip strip accessibility** (~0.5 days)
    - `role="radiogroup"`, each chip `role="radio"` with `aria-checked` state.
    - Arrow keys move between chips; Enter/Space selects.
    - Selected chip announced via `aria-live="polite"` region.

13. **Focus management for station popup** (~0.5 days)
    - Opening moves focus into popup and traps it until dismissed.
    - Closing returns focus to originating pin.
    - Popup is `role="dialog"` with proper label.

14. **Non-colour route differentiation** (~0.5 days)
    - Primary route solid, alternatives dashed — in addition to colour, not instead of.
    - Chip strip labels include route type in text.
    - axe-core passes with zero violations on trip page.

15. **Reduced-motion respect** (~0.25 days)
    - Map pan/zoom animations honour `prefers-reduced-motion: reduce`.
    - Tests with `jest-matchmedia-mock`.

### 4.2 Out of scope

- Multi-stop routing
- Tank-range refuel windows
- Saving trips to an account
- Historical trip suggestions
- Traffic-aware routing
- Turn-by-turn navigation in FuelSniffer
- PWA install prompt

### 4.3 Definition of Done for Phase 2

- [ ] `RoutingProvider` interface, Mapbox adapter, and registry exist with tests
- [ ] `/api/trip/route` returns primary + alternatives with caching
- [ ] Corridor query returns correct stations for a known polyline
- [ ] Trip planner page exists at `/dashboard/trip` and navigable from the main dashboard
- [ ] User can enter start + end, see route + alternatives, switch between them, see corridor stations, adjust corridor width, click "Navigate" to hand off to Apple or Google Maps
- [ ] "Use current location" works end-to-end on at least one browser with real Geolocation
- [ ] Every deep-link URL is tested against a reference example and confirmed to open in the target maps app on a real device
- [ ] **Map keyboard accessibility minimum**: pan/zoom works with arrow keys, every pin has an `aria-label`, and the station list view is a complete keyboard-accessible alternative containing every pin's information. Full pin-by-pin tab navigation may or may not ship in Phase 2 depending on the spike outcome (Phase 2 ticket 11) — if it doesn't, the decision is documented and the list fallback is verified to be a complete equivalent.
- [ ] Route selector chip strip works with arrow keys and announces changes via `aria-live`
- [ ] axe-core zero violations on the trip planner page
- [ ] New UI contrast passes 4.5:1 or 3:1 as appropriate
- [ ] `prefers-reduced-motion` disables map animations
- [ ] Rate limit on `/api/trip/route` verified with integration test
- [ ] `MAPBOX_TOKEN` absent from all client bundles (build-time grep)
- [ ] Deep-link URL construction safely escapes all user-supplied strings and rejects out-of-bounds coords
- [ ] Every Phase 2 ticket has backend, frontend, and user acceptance tests
- [ ] `npm test`, `npx tsc --noEmit`, `npm audit` all clean

### 4.4 Risks and mitigations

- **Mapbox free tier exhaustion during testing** — 100k req/month is ample for real traffic but easy to burn iteratively. Mitigation: caching layer built before UI, test suite uses recorded fixtures not live API calls.
- **Leaflet pin focusability is fiddly** — pins are SVG children of a layer. Mitigation: spike this in the first two days of Phase 2 before committing to the full schedule. If a custom marker layer is needed, scope accordingly.
- **Maps deep-link URL schemes drift** — Apple/Google occasionally change formats. Mitigation: pure tested builder functions; manual "opens correctly on a real device" in acceptance checklist. Fix quickly if they break post-launch; don't architect against it.

---

## 5. Phase 3 — Brand filter, waitlist, audit logging

**Goal:** Ship the smaller user-facing features (brand exclude filter, waitlist CTA) and the larger security hardening (audit logging, abuse detection, full PII posture) together. The waitlist is the highest-risk PII surface in V1 and deserves security work alongside it, not after.

**Duration:** ~3 weeks (15 engineering days plus review/rework buffer)

### 5.1 Tickets

**Feature work:**

1. **Brand exclude filter** (~1.5 days)
    - New `BrandFilterDrawer` component accessible from `FilterBar` as a "Brands" button.
    - Shows brands currently visible, sorted by station count descending.
    - Checkbox per brand; unchecking hides that brand from map and list.
    - State persisted in `localStorage` under `fuelsniffer:excluded_brands`.
    - Merges into `/api/prices` query as `excludeBrands` param.
    - Trip planner (Phase 2) corridor query already supported `excludeBrands`; this phase wires the UI through.
    - Clear-all and reset-to-defaults controls.

2. **Waitlist signup endpoint** (~2 days)
    - `POST /api/waitlist` accepts `{ email, source, consent }`.
    - Writes to `waitlist_signups` using Phase 1 encryption.
    - Zod validation: email format, source from known allow-list, consent must be `true`.
    - Honeypot: hidden `website` field must be empty; non-empty returns 200 silently.
    - Rate limit: 3 signups per `ip_hash` per 24h.
    - Response codes: 200 success (or honeypot hit), 400 invalid, 429 rate-limited, 409 duplicate (hash lookup).
    - Tests: encryption unit tests, integration tests for each response code, spam-simulation test firing 10 signups from one IP.

3. **Waitlist CTAs and shared form** (~1.5 days)
    - Shared `<WaitlistForm>` component rendered by each CTA with a `source` prop.
    - **CTA #1 — Historical-data upsell**: on the station detail chart, below the 7-day view, an inline panel "Want to see 90-day trends, seasonal patterns, and price alerts? Join the waitlist →" with `source=historical-chart-cta`.
    - **CTA #2 — Brand filter upsell**: banner in the brand filter drawer "Have a loyalty program? Join the waitlist to get discounts factored into prices" with `source=brand-filter-cta`.
    - **CTA #3 — Footer**: persistent footer CTA with `source=footer-cta`, focused on "Get notified when personalisation launches".
    - Positioning: "Notify me when login/personalisation ships." Not beta, not limited-invite. Simplest, most honest.
    - Tests: each CTA renders, form submission routes to correct `source`, a11y tests for labels and error announcement.

4. **Waitlist success state** (~0.5 days)
    - `<WaitlistSuccess>` inline component replacing the form on successful submission.
    - Copy: "You're in. We'll email you when there's news."
    - No referral links, no preview, no redirect. Minimal and honest.
    - Announced to screen readers via `aria-live="polite"` region.

5. **Consent copy and privacy touchpoints** (~0.5 days)
    - Waitlist form has a clearly-labelled consent checkbox:
      > "I agree to FuelSniffer storing my email address to notify me about new features. You can request deletion at any time."
    - Link to privacy policy (drafted in Phase 4) beside the checkbox.
    - Submit button disabled until consent is checked.
    - `source` is echoed back in the success message ("You signed up from the historical trends page") — transparency as a feature.

**Security defence in depth:**

6. **Structured audit logging** (~2 days)
    - New `audit_log` table: `(id, ts, ip_hash, path, method, status, duration_ms, ua_hash, request_id)`.
    - Middleware writes one row per API request.
    - 30-day retention, enforced by the nightly cleanup job in ticket 8 below.
    - `request_id` is a UUID generated at the edge and returned in `X-Request-ID` response header.
    - PII redaction: no query strings, no bodies, no headers other than user-agent — just the shape of the request. The `user_agent` value is hashed (`ua_hash`) before write, never stored raw.
    - **Async write mechanism (specific, not hand-waved)**: an in-process bounded queue implemented as a plain `Array<AuditLogEntry>` with a soft cap of 1000 entries. The middleware appends to the array via `queue.push(entry)` and returns immediately — no `await`, no `Promise` chain on the request path. A drain loop runs on `setInterval(drain, 1000)` flushing up to 200 entries per tick into a single `INSERT INTO audit_log VALUES ($1, ...), ($2, ...), ...` batch. On overflow (queue length >1000), the *oldest* entries are dropped and a counter is incremented for monitoring (we'd rather lose old audit data than block the request path or grow unbounded). The drain loop logs and exits cleanly on `SIGTERM`.
    - **No external queue infrastructure** (Redis, BullMQ, etc.) — single-process Next.js, in-memory queue is sufficient and matches the rate-limiter design choice. If we ever go multi-process, both swap together.
    - Load test catches regressions.

7. **Abuse detection rules** (~1.5 days)
    - `src/lib/security/abuse-detect.ts` runs every 5 minutes as a scheduled job via the existing node-cron scheduler.
    - Rule 1: `ip_hash` with >300 req/min sustained over 5 min → added to `blocked_ips` table (7-day TTL).
    - Rule 2: `ip_hash` with >10 waitlist signup attempts in an hour → flagged for review.
    - Rule 3: `ip_hash` with >60 `4xx` responses in a minute (probing) → flagged for review.
    - Thresholds are configurable via env vars with the values above as defaults; tuning happens post-launch based on real traffic.
    - Blocked IPs return 403 at middleware.
    - Flags written to `abuse_flags` table; no automatic action beyond block — humans review via a runbook query.

8. **Audit log retention job** (~0.5 days)
    - Nightly scheduled job (same node-cron scheduler) that `DELETE`s rows from `audit_log` older than 30 days.
    - Reports to healthchecks.io on successful run.
    - Tests: seed audit_log with 31-day-old rows, run job, assert they're gone; fresh rows untouched.

9. **Scoped DB roles** (~1 day)
    - New migration: `app_readwrite` role with SELECT/INSERT/UPDATE/DELETE on application tables, no system access.
    - App connects as `app_readwrite`.
    - Migrations run as superuser via separate `DATABASE_URL_MIGRATE` connection string.
    - Test: `app_readwrite` can't `DROP TABLE`.

10. **Full CSP enforcement** (~1 day)
    - Review Phase 1 CSP report-only violations — should be almost none.
    - Switch CSP from report-only to enforce.
    - Per-request nonces on inline scripts via Next.js middleware hook.
    - Leaflet and Recharts explicitly whitelisted.
    - Test asserts enforce mode; deliberately-blocked resource (`<script src="https://evil.example"></script>`) fails.
    - 48-hour soak test in report-only before switching.

11. **PII posture documentation** (~0.5 days)
    - `docs/security/pii-posture.md` — what we collect, where it's stored, how it's encrypted, retention periods, access control, deletion process.
    - Linked from the Phase 4 privacy policy.
    - No code, but a reviewable deliverable.

**Accessibility woven in:**

12. **Form labels and error announcement** (~1 day)
    - Every form input on waitlist CTAs and brand filter drawer has a visible label (not placeholder-only).
    - Error messages in an `aria-live="assertive"` region.
    - Errors associated to inputs via `aria-describedby`.
    - Tests assert error appears in live region on invalid submit.
    - Manual VoiceOver test documented in acceptance checklist.

13. **Brand drawer accessibility** (~0.5 days)
    - `role="dialog"` with label.
    - Focus trap while open, returned on close.
    - Escape closes.
    - Tab reaches every checkbox.

14. **Screen reader spot check** (~0.5 days)
    - VoiceOver on iOS Safari and macOS Safari: brand drawer, waitlist form, station card.
    - Findings logged in `docs/a11y/phase3-findings.md`.
    - Blockers fixed in Phase 3; non-blockers carry to Phase 4 full pass.

### 5.2 Out of scope

- Loyalty-adjusted pricing
- Double opt-in confirmation
- Self-service waitlist deletion
- Full screen reader pass on every page
- Accessibility statement
- Backup restore verification automation

### 5.3 Definition of Done for Phase 3

- [ ] Brand exclude filter works end-to-end on map, list, and trip planner
- [ ] Waitlist signup writes encrypted row and resists honeypot, duplicate, spam-flood, invalid-input cases
- [ ] All three waitlist CTAs render and submit to the correct `source`
- [ ] Waitlist success state replaces the form and is announced to screen readers
- [ ] Consent checkbox is required and labelled correctly; privacy policy link present
- [ ] Audit log captures every API request with agreed fields, nothing more
- [ ] Abuse detection job runs on seeded data and produces correct flags and blocks
- [ ] App runs on `app_readwrite` in production; destructive operations fail as that role
- [ ] CSP in enforce mode with zero violations from legitimate traffic over a 48-hour soak test
- [ ] PII posture doc written and cross-linked from draft privacy policy
- [ ] Form labels, error announcements, and focus traps verified by automated and manual testing
- [ ] VoiceOver spot check done; blockers fixed, non-blockers logged
- [ ] Rate limits still work after audit logging middleware (no ordering regression)
- [ ] Every Phase 3 ticket has backend, frontend, and user acceptance tests
- [ ] `npm test`, `npx tsc --noEmit`, `npm audit` all clean

### 5.4 Risks and mitigations

- **Email encryption key rotation is non-trivial** — rotating AES keys means re-encrypting every row. Mitigation: V1 uses a single key with a documented rotation runbook but no automation. Brief downtime for a re-encryption batch job is acceptable at waitlist scale.
- **CSP enforcement breaks something unexpected** — Leaflet tiles, Mapbox telemetry, font loading all have edge cases. Mitigation: 48-hour report-only soak before enforce catches 95%; the rest fix quickly.
- **Audit log write on every request adds latency** — mitigation: async fire-and-forget, index-only insert, load test catches regressions, bounded in-memory buffer as escape hatch.
- **Abuse detection false positives** — heuristic rules will block legitimate users sometimes. Mitigation: every block is logged with the triggering rule and `ip_hash`; manual unblock runbook exists; thresholds are intentionally conservative for V1.

---

## 6. Phase 4 — Launch polish

**Goal:** Close the gap between "features work" and "the public can trust this site". Everything that needs to exist before launch day but doesn't fit cleanly in a feature phase lives here.

**Duration:** ~3.75 weeks (18.75 engineering days plus review/rework buffer; assumes Leaflet pin spike chose option (a) "full implementation" — option (b) or (c) trims ~3 days)

### 6.1 Tickets

**Accessibility — the final pass:**

1. **Full VoiceOver + NVDA pass across every page** (~2 days)
    - Test every route on: macOS Safari + VoiceOver, iOS Safari + VoiceOver, Windows Firefox + NVDA.
    - Follow a written script per page so the test is reproducible.
    - Log findings in `docs/a11y/test-results-<date>.md`.
    - Fix task-blocking findings; log non-blocking as known issues in the accessibility statement.
    - Scripts become part of the user acceptance checklist for all future features.

2. **Recharts data table alternative** (~1 day)
    - 7-day price chart gets a visually-hidden `<table>` alternative with the same data.
    - Use `<caption>` for the table description and associate the table with the chart via `aria-labelledby`. Do *not* use the deprecated `<table summary="">` attribute.
    - Table is keyboard-focusable so sighted keyboard users can also use it.
    - Tests: table present, data matches chart, announced by screen readers.

3. **Leaflet pin keyboard navigation — full implementation** (~3 days, conditional)
    - Implements the approach selected by the Phase 2 spike (`docs/a11y/leaflet-keyboard-decision.md`).
    - **If the spike chose option (a) "full implementation"**: build the custom marker layer with real DOM elements, roving `tabindex`, Enter/Space to open popup, Escape to close, arrow keys to move between adjacent pins, full ARIA labels per pin including station name, suburb, brand, fuel type, and price. Performance test: map remains usable with 200 visible pins.
    - **If the spike chose option (b) "partial / list fallback"**: this ticket is closed as "deferred to post-launch", and the accessibility statement explicitly documents that map pin keyboard navigation is unavailable but a complete keyboard-accessible station list view is provided as an equivalent.
    - **If the spike chose option (c) "abandon"**: same as (b).
    - Whichever path is taken, the decision is documented in the accessibility statement with a clear remediation timeline (or a clear "this is the permanent state for V1") so visitors understand the limitation.

4. **Accessibility statement page** (~0.5 days)
    - New `/accessibility` route with:
      - WCAG 2.2 AA conformance claim
      - Known limitations (non-blocking findings from the VoiceOver pass)
      - Contact email for accessibility feedback
      - Date of last audit
      - Testing methodology declaration
    - Linked from footer on every page.

5. **Accessibility test plan** (~0.5 days)
    - `docs/a11y/test-plan.md` — reproducible test scripts from item 1, formalised.
    - Lists tools, manual steps per page, sign-off criteria.
    - Future re-verification document.

**Security final hardening:**

6. **Backup restore automation** (~1 day)
    - Weekly cron spins up a throwaway Postgres container, restores the latest backup, runs a smoke query, reports to healthchecks.io.
    - Failure triggers a real alert.
    - Runbook for what to do when restore test fails.

7. **Secrets rotation runbook** (~0.5 days)
    - `docs/ops/runbooks/secrets-rotation.md`.
    - Step-by-step for rotating: DB password, `QLD_API_TOKEN`, `NSW_FUELCHECK_TOKEN`, `MAPBOX_TOKEN`, `SESSION_SECRET`, waitlist pepper, waitlist AES key.
    - Each secret: where it lives, how to generate, how to roll with zero (or expected) downtime.

8. **Security.txt** (~0.25 days)
    - `/.well-known/security.txt` per RFC 9116.
    - Contact email, disclosure policy, acknowledgements URL, expiry date.

9. **Final dependency audit + pinning** (~0.5 days)
    - `npm audit fix` for auto-fixable.
    - Review and accept/reject each remaining warning with a comment in `SECURITY.md`.
    - Pin all direct dependencies to exact versions.
    - Set up Dependabot or Renovate (config only, no auto-merge).

**Waitlist closing items:**

10. **Waitlist deletion runbook** (~0.5 days)
    - `docs/ops/runbooks/waitlist-deletion.md`.
    - Canonical email address `privacy@fuelsniffer.<tld>` (registered and monitored).
    - Step-by-step manual deletion process: receive request, verify ownership, run a documented SQL deletion, confirm to requester.
    - SLA documented (e.g., within 7 business days).
    - Linked from privacy policy.

11. **Conversion-by-source runbook** (~0.25 days)
    - `docs/ops/runbooks/waitlist-conversion-report.md`.
    - Canonical SQL snippet: `SELECT source, COUNT(*) FROM waitlist_signups GROUP BY source ORDER BY 2 DESC;`.
    - Instructions for running it safely in production with read-only credentials.
    - No admin UI — just a runnable snippet.

**Ops and monitoring:**

12. **Error monitoring (Sentry or self-hosted Glitchtip)** (~1 day)
    - Integrate `@sentry/nextjs` (or Glitchtip's Sentry-compatible SDK if self-hosting) for unhandled exception capture in API routes and React components.
    - Source maps uploaded at build time so stack traces are useful in production.
    - PII scrubbing rules: strip request bodies, query strings, and any field named `email` from captured events at the SDK level. Errors should never contain user data — they're for diagnosing crashes, not surveilling users.
    - Sample rate: 1.0 for errors, 0.0 for performance traces (we don't need APM in V1).
    - DSN lives in env var `SENTRY_DSN`; absent in dev means no capture (no warning, no error).
    - Healthcheck verifies the SDK is initialised in production builds.
    - Tests: a deliberately-thrown error in a test API route is captured (verified against a local Sentry mock).
    - **Why this matters**: without error monitoring, unhandled exceptions in production vanish into Docker stdout. The healthchecks.io and uptime monitor only catch *complete* outages, not silent regressions where 5% of requests crash but the health endpoint stays green.

13. **Application health monitoring** (~1.5 days)
    - Expand `/api/health` to report: scraper last-run time, NSW provider last-run time, DB connection, routing cache hit rate, 5-minute error rate.
    - Healthchecks.io pings from: scraper scheduler (exists), backup restore test (new), nightly abuse-detection job (new), nightly audit-log cleanup job (new).
    - External uptime monitor (Uptime Kuma or free-tier service) pinging `/api/health` every 5 min.
    - Test: kill scraper, verify healthchecks.io alerts within expected window.

14. **Alerting runbooks** (~1 day)
    - `docs/ops/runbooks/` — one file per alert type:
      - `scraper-down.md`
      - `site-down.md`
      - `db-backup-failed.md`
      - `suspicious-traffic.md`
      - `waitlist-spam-incident.md`
      - `csp-violations-spike.md`
      - `mapbox-quota-exceeded.md`
    - Each: symptoms, likely causes, immediate mitigations, investigation steps, resolution.
    - Short and scannable.

15. **Performance baseline** (~0.5 days)
    - Run Lighthouse on landing, dashboard, trip planner.
    - Record scores in `docs/perf/baseline-<date>.md`.
    - Fix cheap red findings (render-blocking resources, unoptimised images).
    - Accept the rest as known state.

**Marketing and trust:**

16. **Data collection notice on landing** (~0.5 days)
    - Persistent, dismissible notice on the landing page (and on first visit to any other page) that briefly states what FuelSniffer collects: hashed IP and hashed user-agent for security/abuse detection, no cookies for tracking, no third-party analytics, waitlist email only with explicit consent.
    - Links to the full privacy policy.
    - Dismissal stored in `localStorage` (not a cookie) so we don't add to the cookie surface.
    - **Why this exists**: even though our PII collection is minimal and hashed, the Australian Privacy Act 1988 and Privacy Principle 1.4 emphasise transparency *at the point of collection*, not only after the fact in a buried policy. A visible notice fulfils that intent. We're not subject to GDPR, so a full consent gate is overkill — but a clearly-visible notice is the right baseline.
    - Tests: notice renders on first visit, dismissal persists across reloads, screen reader announces it on first visit, keyboard-accessible dismiss button, contrast verified.
    - **This ticket is a precondition** for the audit log being live to public traffic.

17. **Landing page** (~1.5 days)
    - New route `/` (or `/welcome` — decide based on where the dashboard lives).
    - Hero: value proposition in one sentence, screenshot, primary CTA to dashboard, secondary CTA to waitlist.
    - Three feature blocks: map, trip planner, NSW+QLD coverage.
    - Waitlist signup in a footer band with `source=landing-page-cta`.
    - Honest "what we don't do yet" section with links to the waitlist.
    - a11y: full keyboard nav, no colour-only cues, contrast verified, screen reader tested.

18. **Privacy policy** (~1 day)
    - `/privacy` page drafted honestly:
      - What we collect (waitlist email, IP hash, UA hash, minimal telemetry)
      - Why we collect it
      - How it's stored (encrypted at rest, 30-day log retention)
      - How to request deletion (email + SLA)
      - Third parties: Mapbox, QLD + NSW fuel APIs, Cloudflare, Sentry/Glitchtip
      - Jurisdiction and applicable law (Australian Privacy Principles)
    - Linked from footer and from every waitlist CTA.
    - **Written as one of the last Phase 4 tickets** so it reflects actual implementation, not an aspirational early draft.

19. **Terms of use** (~0.5 days)
    - `/terms` page: use of the service, prices-are-indicative disclaimer, government data attribution, liability limits.
    - Short, plain language.
    - Linked from footer.

20. **Footer refresh** (~0.25 days)
    - Links: privacy, terms, accessibility, security.txt, source code on GitHub, healthchecks status page.
    - Present on every page, a11y verified.

21. **SEO and link-preview metadata** (~0.5 days)
    - **`robots.txt`** at site root, allowing all crawlers but disallowing `/api/*` and `/dashboard/*` (no point indexing API or session-specific routes).
    - **`sitemap.xml`** at site root, listing the discoverable public pages: `/`, `/dashboard`, `/dashboard/trip`, `/privacy`, `/terms`, `/accessibility`. Generated at build time, not hand-maintained.
    - **Open Graph + Twitter Card meta tags** in the root `layout.tsx`: `og:title`, `og:description`, `og:image` (a 1200x630 PNG of the dashboard with the FuelSniffer wordmark — committed under `public/og-image.png`), `og:url`, `og:type=website`, `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
    - **Per-page metadata overrides** for the trip planner and the (eventual) station detail pages so deep-links surface meaningfully.
    - Tests: integration test fetches `/sitemap.xml` and asserts the expected URL list; unit test verifies `generateMetadata` returns the expected OG tags for each route; manual check via `https://opengraph.dev/` or equivalent against the deployed staging URL.
    - **Why this matters in V1 specifically**: the waitlist CTA's entire success metric is shareability. A shared link without OG tags renders as a broken card in iMessage, WhatsApp, and Twitter — visually it looks like the link is broken, which kills click-through.

**Final verification:**

22. **Launch readiness checklist review** (~0.5 days)
    - Walk through every DoD item from every previous phase and tick it off (or reopen).
    - Fix regressions.
    - Document anything intentionally carried as known state.

23. **End-to-end smoke test on production** (~0.5 days)
    - Deploy to production.
    - Run the full user acceptance checklist on the real deployed site.
    - Record results with screenshots/video.
    - **Ship only when every item passes.**

### 6.2 Out of scope

- External pentest
- Third-state providers
- Analytics beyond uptime + healthchecks (no Google Analytics, no Plausible, no Mixpanel)
- Email sending pipeline for waitlist confirmation
- A/B testing infrastructure
- Any feature work beyond Phases 1-3

### 6.3 Definition of Done for Phase 4

- [ ] VoiceOver + NVDA tests done on every page, results documented
- [ ] Recharts data table alternative present and correct (uses `<caption>`, not deprecated `summary`)
- [ ] Leaflet pin keyboard navigation: either fully implemented per Phase 2 spike's chosen option, or list-view fallback verified as a complete keyboard equivalent and the limitation documented in the accessibility statement
- [ ] Accessibility statement live with known-issues list
- [ ] Accessibility test plan committed
- [ ] Backup restore automation runs weekly and verified to detect failure
- [ ] Secrets rotation runbook covers every secret (including `SENTRY_DSN`)
- [ ] `/.well-known/security.txt` live and valid per RFC 9116
- [ ] `npm audit` clean, dependencies pinned, Dependabot enabled
- [ ] Waitlist deletion runbook + canonical email live and linked from privacy policy
- [ ] Waitlist conversion-by-source runbook live
- [ ] Error monitoring (Sentry/Glitchtip) installed, source maps uploaded, PII scrubbing rules verified, deliberate test error captured
- [ ] `/api/health` expanded, external uptime monitor pinging, healthchecks.io alerts verified
- [ ] Every alert type has a runbook
- [ ] Lighthouse shows no red findings on any page
- [ ] Data collection notice renders on first visit, dismissible, accessible
- [ ] Landing page live, accessible, with waitlist CTA
- [ ] Privacy policy live and matches actual implementation
- [ ] Terms of use live
- [ ] Footer correct on every page
- [ ] `robots.txt`, `sitemap.xml`, OG/Twitter Card meta tags live and verified via opengraph.dev
- [ ] Every DoD item from Phases 1-3 re-verified on production
- [ ] End-to-end smoke test passes with evidence
- [ ] **Launch day checklist** exists and ready to execute

### 6.4 Risks and mitigations

- **"Just one more thing"** — launch polish expands to fill time. Mitigation: every Phase 4 item must be in the DoD or it doesn't get built. Nice ideas go to post-launch backlog.
- **Privacy policy drift** — policy written early then implementation changes. Mitigation: policy is one of the *last* Phase 4 tickets, written against actual schema and audit log contents.
- **VoiceOver reveals a serious gap late** — Mitigation: Phase 2 and 3 already did VoiceOver spot checks, so Phase 4 is confirming not discovering. Genuine blockers here get a decision: fix before launch, or document in accessibility statement and ship. The point is the decision is conscious.
- **Production smoke test fails** — Mitigation: deployment is a day or two before launch day, not launch day itself.

---

## 7. Post-launch backlog

Explicitly deferred so nothing accidentally sneaks into V1:

- **Logged-in experience** — accounts, login, password reset, session management, self-service waitlist deletion
- **Loyalty-adjusted pricing** — loyalty program storage, real-time price adjustment
- **Saved locations, favourites, home/work** — requires accounts
- **Price alerts** — requires email pipeline and accounts
- **Historical charts beyond 7 days** — the feature the waitlist CTA promises
- **PWA install, offline mode, on-the-road refuel windows, tank-range planning**
- **Additional states** (WA, NT, TAS, SA, VIC, ACT) — each a self-contained workstream thanks to the provider abstraction
- **Multi-stop trip planning**
- **Traffic-aware routing** (requires Mapbox upgrade)
- **Double opt-in waitlist confirmation** (requires email sending pipeline)
- **External pentest** (budget-dependent)
- **Mobile app** (possibly never if PWA is good enough)
- **Impression analytics on CTAs** — add later if conversion rates are disappointing

---

## 8. Environment variable additions

New env vars introduced across V1 (all required unless noted):

| Variable | Phase | Purpose |
|---|---|---|
| `NSW_FUELCHECK_CLIENT_ID` | 1 | NSW FuelCheck OAuth2 client ID |
| `NSW_FUELCHECK_CLIENT_SECRET` | 1 | NSW FuelCheck OAuth2 client secret |
| `WAITLIST_EMAIL_PEPPER` | 1 | Hash pepper for waitlist email duplicate detection |
| `WAITLIST_EMAIL_AES_KEY` | 1 | AES-256-GCM key for waitlist email encryption at rest |
| `WAITLIST_IP_PEPPER` | 1 | Hash pepper for `ip_hash` (separate from email pepper) |
| `MAPBOX_TOKEN` | 2 | Mapbox Directions API token (server-only) |
| `DATABASE_URL_MIGRATE` | 3 | Superuser connection for running migrations |
| `ABUSE_RULE_REQ_PER_MIN` | 3 | Threshold for rule 1 abuse detection (default 300) |
| `ABUSE_RULE_WAITLIST_PER_HOUR` | 3 | Threshold for rule 2 abuse detection (default 10) |
| `ABUSE_RULE_4XX_PER_MIN` | 3 | Threshold for rule 3 abuse detection (default 60) |
| `SENTRY_DSN` | 4 | Error monitoring DSN; absent means capture is disabled |

All must be in `.env.example`, `docker-compose.yml`, and documented in the README before the phase that introduces them is marked done.

---

## 9. Migration sequence

Running list of migrations introduced by V1, in order:

1. Phase 1: Enable PostGIS extension
2. Phase 1: Add `source_provider` to `stations` and `price_readings`, backfill, composite unique index
3. Phase 1: Create `brand_aliases` table
4. Phase 1: Create `csp_violations` table
5. Phase 1: Create `waitlist_signups` table
6. Phase 2: Add `geom` column to `stations`, backfill from `longitude`/`latitude` (PostGIS uses lng-then-lat), GIST index
7. Phase 2: Create `route_cache` table
8. Phase 3: Create `audit_log` table
9. Phase 3: Create `blocked_ips` table
10. Phase 3: Create `abuse_flags` table
11. Phase 3: Create `app_readwrite` role and grants

All follow the existing plain-SQL migration pattern in `src/lib/db/migrations/`.

---

## 10. Open questions

- **NSW FuelCheck rate limits** — to be confirmed during the Phase 1 API spike. If they're tighter than expected, the scrape cadence for NSW may differ from QLD.
- **Canonical domain and email address for privacy contact** — `privacy@fuelsniffer.<tld>` assumes a known domain. The actual domain is chosen before Phase 4.
- **Healthchecks.io plan sufficiency** — free tier limits ping count. May need paid tier for the full set of monitored jobs.
- **PostgreSQL Docker image switch blast radius** — `postgis/postgis:17-alpine` has a slightly different default config than `postgres:17-alpine`. The Phase 1 infrastructure ticket verifies there's no user-visible regression.

---

## 11. Approval and next steps

Once this spec is reviewed and approved:

1. Spec self-review (lint for placeholders, contradictions, ambiguity, scope).
2. Sub-agent independent review with an adversarial eye.
3. User review gate — explicit approval before moving to implementation planning.
4. Invoke `writing-plans` skill to decompose each phase into an executable plan.
5. Create ClickUp tickets from the plans with enough detail for Haiku to execute.

---

*End of design.*
