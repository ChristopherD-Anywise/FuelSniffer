# Architecture Research

**Domain:** Fuel price scraping and dashboard system
**Researched:** 2026-03-22
**Confidence:** HIGH (core patterns), MEDIUM (QLD API specifics — requires registration to confirm full details)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Data Ingestion Layer                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐     ┌────────────────────────────┐    │
│  │  Scheduler (cron)    │────▶│  Scraper / API Client      │    │
│  │  Every 15 minutes    │     │  fuelpricesqld.com.au API  │    │
│  └──────────────────────┘     └────────────┬───────────────┘    │
│                                            │ raw JSON           │
│                               ┌────────────▼───────────────┐    │
│                               │  Normaliser / Transformer  │    │
│                               │  price int → float, dedupe │    │
│                               └────────────┬───────────────┘    │
├────────────────────────────────────────────│────────────────────┤
│                       Storage Layer        │                    │
├────────────────────────────────────────────│────────────────────┤
│                               ┌────────────▼───────────────┐    │
│                               │  TimescaleDB (PostgreSQL)  │    │
│  ┌─────────────────────┐      │  - price_readings (hyper)  │    │
│  │  Rollup Job         │◀─────│  - stations (dim table)    │    │
│  │  Nightly / hourly   │      │  - push_subscriptions      │    │
│  │  15min → hourly     │─────▶│  - hourly_prices (cagg)    │    │
│  └─────────────────────┘      └────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                        API Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              REST API (Fastify / Express)                │    │
│  │  GET /prices?fuel=91&lat=...&lng=...&radius=20          │    │
│  │  GET /stations                                           │    │
│  │  GET /prices/:stationId/history                         │    │
│  │  GET /prices/cheapest                                    │    │
│  │  POST /alerts  (CRUD alert rules)                        │    │
│  │  POST /push/subscribe                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                   Notification Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐     ┌────────────────────────────┐    │
│  │  Alert Evaluator     │────▶│  Web Push Dispatcher       │    │
│  │  Runs after ingest   │     │  web-push (VAPID keys)     │    │
│  └──────────────────────┘     └────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                    Presentation Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │         SvelteKit / React Frontend (SSR optional)        │    │
│  │  - Price dashboard (table + map)                         │    │
│  │  - Trend charts (Chart.js or Recharts)                   │    │
│  │  - Alert management                                      │    │
│  │  - Service Worker (push notification receiver)           │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                  Deployment Layer (Docker Compose)               │
│  [scraper] [api] [frontend] [db: timescaledb] [reverse proxy]   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Scheduler | Fires scraper job every 15 min via cron | Scraper service |
| Scraper / API Client | Calls fuelpricesqld.com.au API, receives raw JSON, hands to normaliser | QLD Fuel API (external), Normaliser |
| Normaliser / Transformer | Converts raw response to domain model (price int to float, station deduplication, geolocation enrichment) | Database |
| TimescaleDB | Stores raw 15-min readings in hypertable; hourly aggregate in continuous aggregate | API layer, rollup job |
| Rollup Job | Aggregates yesterday's 15-min rows into hourly cagg, then applies retention to drop raw rows older than today | Database |
| REST API | Serves price queries with geospatial filtering, history endpoints, alert CRUD, push subscription management | Database, frontend, push dispatcher |
| Alert Evaluator | After each ingest, checks whether any station/fuel combo breached a user-defined price threshold | REST API / direct DB, Push Dispatcher |
| Web Push Dispatcher | Sends Web Push notifications via VAPID to stored browser subscriptions | Browser service workers |
| Frontend | Dashboard UI — prices, charts, alerts, filter controls | REST API, Service Worker |
| Service Worker | Receives push events from browser Push API, displays notifications | Browser |
| Reverse Proxy (Caddy/Nginx) | TLS termination, routes `/api/*` to API container and `/*` to frontend | API, Frontend |

## Recommended Project Structure

```
fuelsniffer/
├── scraper/                  # Data ingestion service
│   ├── src/
│   │   ├── client.ts         # QLD Fuel API HTTP client (auth, retry)
│   │   ├── normaliser.ts     # Raw JSON → domain model
│   │   ├── writer.ts         # DB insert with upsert logic
│   │   └── index.ts          # Entry point called by scheduler
│   ├── Dockerfile
│   └── package.json
│
├── api/                      # REST API service
│   ├── src/
│   │   ├── routes/
│   │   │   ├── prices.ts
│   │   │   ├── stations.ts
│   │   │   ├── alerts.ts
│   │   │   └── push.ts
│   │   ├── services/
│   │   │   ├── geo.ts        # Haversine distance filtering
│   │   │   ├── alerts.ts     # Threshold evaluation
│   │   │   └── push.ts       # VAPID / web-push dispatch
│   │   ├── db/
│   │   │   ├── client.ts     # pg pool setup
│   │   │   └── queries/      # SQL query functions
│   │   └── index.ts          # Fastify app
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                 # Web dashboard
│   ├── src/
│   │   ├── routes/           # SvelteKit pages
│   │   ├── lib/
│   │   │   ├── api.ts        # Typed API client
│   │   │   ├── charts/       # Chart components
│   │   │   └── stores/       # Svelte reactive state
│   │   └── service-worker.ts # Push notification receiver
│   ├── Dockerfile
│   └── package.json
│
├── db/
│   ├── migrations/           # SQL migrations (numbered)
│   │   ├── 001_schema.sql
│   │   ├── 002_hypertable.sql
│   │   └── 003_cagg.sql
│   └── seed/                 # Station seed data (optional)
│
├── docker-compose.yml        # All services wired together
├── Caddyfile                 # (or nginx.conf) reverse proxy
└── .env.example
```

### Structure Rationale

- **scraper/:** Isolated from API — can be restarted, redeployed, or replaced without touching the API. Single responsibility: fetch and store.
- **api/:** Stateless service. All state lives in the DB. Easy to restart or scale.
- **db/migrations/:** Numbered SQL files (not ORM migrations) keep schema explicit and auditable. TimescaleDB-specific DDL (hypertable, cagg) is clearer in raw SQL.
- **frontend/:** Deployed as a static build or SSR behind the same reverse proxy. Service worker lives here, not in the API.

## Architectural Patterns

### Pattern 1: Scheduled Pull with Idempotent Upsert

**What:** A cron job (or Docker-based scheduler) runs the scraper at a fixed interval. The scraper fetches the full current price set from the QLD API and upserts rows into the database — inserting new records, ignoring unchanged prices already recorded within the current 15-min bucket.

**When to use:** When the upstream source is a polling API (not a webhook or stream). The QLD Fuel API provides point-in-time price data; pulling every 15 min aligns with the source's update cadence (reported as updating roughly every 5 minutes per station).

**Trade-offs:** Simple and reliable. No persistent connection to maintain. Slightly redundant data sent on each pull, but deduplication at the DB layer is cheap. Risk: if the cron job fails silently, you get a gap in data — add alerting on job success/failure.

**Example:**
```sql
-- Upsert: insert only if price changed or bucket is new
INSERT INTO price_readings (station_id, fuel_type_id, price_cents, recorded_at)
VALUES ($1, $2, $3, date_trunc('minute', NOW()))
ON CONFLICT (station_id, fuel_type_id, date_trunc('minute', recorded_at))
DO NOTHING;
```

### Pattern 2: Tiered Retention with TimescaleDB Continuous Aggregates

**What:** Raw 15-minute price readings land in a hypertable. A continuous aggregate materialises hourly averages (or last-known price per hour). A retention policy drops raw hypertable chunks older than 24 hours. The cagg persists indefinitely (or with its own longer retention).

**When to use:** When you need sub-hour granularity for "today" but don't need it for history. Massively reduces storage growth over months of data.

**Trade-offs:** Adds complexity vs. a single table with periodic DELETE jobs. TimescaleDB handles the scheduling automatically once policies are created. Queries against the cagg are fast (pre-aggregated). Trade-off: historical charts show hourly resolution, not 15-min — acceptable per project spec.

**Example:**
```sql
-- Hypertable for raw reads
SELECT create_hypertable('price_readings', 'recorded_at');

-- Hourly continuous aggregate
CREATE MATERIALIZED VIEW hourly_prices
WITH (timescaledb.continuous) AS
SELECT
  station_id,
  fuel_type_id,
  time_bucket('1 hour', recorded_at) AS bucket,
  AVG(price_cents)::int AS avg_price_cents,
  MIN(price_cents) AS min_price_cents
FROM price_readings
GROUP BY station_id, fuel_type_id, bucket;

-- Retention: keep raw data for 2 days (buffer), drop older
SELECT add_retention_policy('price_readings', INTERVAL '2 days');
```

### Pattern 3: Alert Evaluation as Post-Ingest Hook

**What:** After each scrape-and-store cycle completes, the alert evaluator runs a query comparing current prices against stored alert rules. If a threshold is crossed, it fires a push notification via the web-push library (VAPID protocol).

**When to use:** Small user base, infrequent alerts. This avoids needing a message queue (RabbitMQ, Redis) for what is essentially a lightweight post-processing step.

**Trade-offs:** Simple and synchronous. For a small group of friends, the added latency of checking alerts in the same process as the scraper is negligible. If the notification dispatch fails, the scrape still succeeded. Would need decoupling (queue) at scale.

## Data Flow

### Ingest Flow (every 15 minutes)

```
QLD Fuel API (fppdirectapi-prod.fuelpricesqld.com.au)
    │  JSON: { SitePrices: [...], TransactionDateUtc: "..." }
    ▼
Scraper: HTTP GET with SubscriberToken header
    │  Parsed: station_id, fuel_type_id, price_cents, timestamp
    ▼
Normaliser: dedup, validate, map fuel type codes
    │  Domain rows ready for insert
    ▼
TimescaleDB: hypertable price_readings (upsert)
    │  Background: cagg refresh (hourly_prices)
    ▼
Alert Evaluator: SELECT current prices vs alert_rules
    │  Threshold crossed?
    ▼
Web Push Dispatcher: POST to browser push endpoint (VAPID)
    ▼
Browser Service Worker: receives push, shows notification
```

### Dashboard Request Flow

```
User opens dashboard (browser)
    │  HTTP GET /api/prices?fuel=91&lat=-27.2&lng=152.9&radius=20
    ▼
REST API: parse params, validate
    │  SQL: SELECT with Haversine distance filter
    ▼
TimescaleDB: query price_readings (today) or hourly_prices (history)
    │  Rows: station, price, distance, last_updated
    ▼
API: JSON response
    ▼
Frontend: render table sorted by price, map pins, charts
```

### Push Notification Subscription Flow

```
User clicks "Enable Notifications" in frontend
    │
Service Worker: PushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })
    │  Returns: PushSubscription { endpoint, keys }
    ▼
Frontend: POST /api/push/subscribe { subscription, userId }
    ▼
API: store subscription in push_subscriptions table
    ▼
(Later, during alert evaluation)
    ▼
Web Push Dispatcher: webpush.sendNotification(subscription, payload)
    ▼
Browser Push Service (FCM/Mozilla) → Browser Service Worker → Notification
```

## Key Data Flows Summary

1. **Ingest:** QLD API → scraper → normaliser → TimescaleDB hypertable (every 15 min)
2. **Aggregation:** TimescaleDB cagg materialises hourly_prices automatically in background
3. **Retention:** Retention policy drops raw rows older than 2 days; cagg data kept indefinitely
4. **Query (today):** Frontend → API → hypertable (15-min granularity available)
5. **Query (history):** Frontend → API → hourly_prices cagg (hourly granularity)
6. **Alerts:** Post-ingest evaluator → web-push → browser service worker

## Suggested Build Order

The components have hard dependencies that dictate build order:

1. **Database schema** — everything else depends on it. Create tables, hypertable, cagg, migrations.
2. **Scraper / API client** — validate QLD API access and data ingestion before building anything that consumes the data.
3. **Normaliser + writer** — data pipeline from raw API response to DB rows. Validates the schema design against real data.
4. **Scheduler** — wire up cron once scraper is verified working. Test the 15-min cycle.
5. **REST API** — build endpoints once data is flowing. Can test with SQL queries first.
6. **Frontend (core dashboard)** — price table and basic filtering. Confirms the API contract.
7. **Charts and trend analysis** — depends on historical data accumulating; build second.
8. **Alert evaluation + push notifications** — most complex; build last when core pipeline is stable.

**Rationale:** Each layer depends on the one below it. Building the scraper first ensures you have real data to test the API layer against. Building alert notifications last avoids wasted effort if the data model changes during core pipeline development.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| fuelpricesqld.com.au API | REST polling, `Authorization: FPDAPI SubscriberToken=<token>` | Requires registration as "data consumer" at fuelpricesqld.com.au. Token-based auth. Prices are integers (1234 = 123.4¢/L). Endpoints: `/Price/GetSitesPrices`, `/Subscriber/GetFullSiteDetails`. |
| Browser Push API (VAPID) | `web-push` npm library, VAPID keys generated once and stored in env | Push endpoint is browser-controlled (Google FCM or Mozilla). No third-party push service needed — fully self-contained. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Scraper → Database | Direct pg connection (INSERT) | Scraper does not go through the API — writes directly to DB. Avoids unnecessary HTTP hop inside Docker network. |
| API → Database | pg pool (connection pooling) | Use pgBouncer if connection count becomes a concern (unlikely at this scale). |
| API → Push Dispatcher | In-process function call (same Node process) | No queue needed at this scale. Would move to a job queue if user count grows. |
| Frontend → API | HTTP REST (fetch) | No WebSocket needed — 15-min data staleness is acceptable. Manual refresh or polling every 5 min in the frontend is sufficient. |
| Reverse Proxy → Services | HTTP (Docker internal network) | Caddy routes `/api/*` to api:3000, `/*` to frontend:3001. TLS at the proxy layer only. |

## Anti-Patterns

### Anti-Pattern 1: Going Through the API for Scraper Writes

**What people do:** Route the scraper's data through the REST API (POST /ingest) rather than writing directly to the database.

**Why it's wrong:** Adds a network hop with no benefit on a self-hosted single-server setup. If the API is down or slow, the scraper is blocked. The API authentication layer now needs to trust an internal service specially.

**Do this instead:** The scraper writes directly to the database via a pg connection. The API is the interface for external consumers (the frontend). Internal services talk to the database directly.

### Anti-Pattern 2: Storing All Raw Data Forever

**What people do:** Keep every 15-minute row indefinitely, planning to "deal with storage later."

**Why it's wrong:** 15-minute fuel prices across ~1,000 Queensland stations grows fast. 1,000 stations × 6 fuel types × 96 readings/day × 365 days = ~210M rows per year. Without rollup + retention, queries slow and disk fills.

**Do this instead:** Use TimescaleDB's retention policy to drop raw rows after 2 days. The hourly continuous aggregate provides all the historical resolution the project requires.

### Anti-Pattern 3: Reinventing the Push Infrastructure

**What people do:** Implement email, SMS, or a custom WebSocket-based notification channel.

**Why it's wrong:** Project scope is browser push notifications only. WebSocket requires a persistent server connection per user. Email/SMS add external service dependencies and cost.

**Do this instead:** Use the browser's native Push API with VAPID keys and the `web-push` npm package. This is fully self-hosted, works when the browser is closed (via service worker), and handles the delivery infrastructure through the browser vendor's push service.

### Anti-Pattern 4: Polling the QLD API More Than Necessary

**What people do:** Scrape every 1-2 minutes to get "fresher" data.

**Why it's wrong:** Stations report prices when they change — the API reflects that. Polling more frequently than the reported update cadence (approximately every 5 minutes per station, 15 min is conservative) wastes API calls, risks rate limiting or token suspension, and produces identical rows in the database.

**Do this instead:** Scrape every 15 minutes. This matches the project's stated data granularity requirement and is respectful of the shared government API infrastructure.

## Scaling Considerations

This project targets a self-hosted single-server deployment for a small friend group. Scaling considerations are presented for awareness, not as recommendations for v1.

| Scale | Architecture Notes |
|-------|--------------------|
| 1-10 users (target) | Single Docker Compose stack on one host. All services on one machine. No load balancing, no replication. TimescaleDB handles the data volume easily. |
| 10-100 users | No architecture change needed. Add pgBouncer for connection pooling if needed. |
| 100-1,000 users | Read replica for the DB, separate API instances behind a load balancer. Push subscription table grows but remains manageable. |
| 1,000+ users | Decouple alert evaluation into a dedicated job queue (BullMQ + Redis). Consider read-optimised cache layer (Redis) for popular price queries. |

**First bottleneck at this scale:** None architectural. The most likely operational issue is the cron job silently failing. Add a simple health check endpoint the scraper calls after each run, and monitor it.

## Sources

- [Queensland Fuel Price Reporting — Open Data Portal (2025 dataset)](https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025)
- [FuelPricesQLD API — Home Assistant Community (endpoint details, auth pattern)](https://community.home-assistant.io/t/queensland-fuel-prices-integration/406642)
- [QLD Treasury — Fuel Price Apps and Websites (registration path)](https://www.treasury.qld.gov.au/policies-and-programs/fuel-in-queensland/fuel-price-apps-websites/)
- [TimescaleDB Continuous Aggregates documentation](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/create-a-continuous-aggregate/)
- [TimescaleDB Hierarchical Continuous Aggregates (rollup on rollup)](https://docs.timescale.com/use-timescale/latest/continuous-aggregates/hierarchical-continuous-aggregates/)
- [web-push npm package (VAPID, self-hosted push notifications)](https://www.npmjs.com/package/web-push)
- [MDN Push API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [TimescaleDB Docker installation](https://docs.timescale.com/self-hosted/latest/install/installation-docker/)

---
*Architecture research for: fuel price scraping and dashboard system (Queensland, Australia)*
*Researched: 2026-03-22*
