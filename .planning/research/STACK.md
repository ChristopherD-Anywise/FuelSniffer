# Stack Research

**Domain:** Fuel price scraping and dashboard (Queensland, Australia)
**Researched:** 2026-03-22
**Confidence:** MEDIUM-HIGH — core stack HIGH confidence; data source specifics MEDIUM (API access requires sign-up to confirm live behaviour)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16 (latest) | Full-stack framework: API routes + React dashboard | Eliminates separate backend process for a single-developer project; App Router handles both the REST API layer and the dashboard UI in one codebase; Turbopack now default for fast rebuilds; self-hosted via `next start` with no Vercel dependency |
| React | 19.2 (bundled with Next 16) | Dashboard UI | Ships with Next.js 16; View Transitions API for smooth chart navigation |
| TypeScript | 5.x | Type safety across full stack | Next.js 16 requires TS 5+; end-to-end type safety from DB schema to UI components is non-negotiable for scraper + dashboard apps where data shapes are critical |
| TimescaleDB | 2.24.0-pg17 | Time-series storage | PostgreSQL extension — full SQL support, handles 15-min intervals and hourly rollups natively with continuous aggregates; Docker image `timescale/timescaledb:2.24.0-pg17` runs on a home server with zero extra infra overhead |
| Drizzle ORM | latest (^0.40) | Database access layer | Lightweight (~7.4kb), SQL-close API means time-series queries stay readable; no Rust binary (unlike older Prisma), zero-dependency Docker-friendly; migration files are plain SQL you can inspect |
| node-cron | ^3.0 | 15-minute scrape scheduler | Zero external dependencies — no Redis, no MongoDB; sufficient for a single-server app where a missed scrape is not catastrophic; if process crashes it restarts via PM2 not a queue |
| web-push | ^3.6 | VAPID browser push notifications | The de-facto Node.js library for W3C Push API; self-hosted with no Firebase/FCM intermediary for the alert-to-users feature |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | ^1.7 | HTTP client for Queensland fuel API | Simpler than `fetch` for repeated token-authenticated requests; interceptors handle auth header injection once |
| Recharts | ^3.8 | Line charts, trend charts, comparison charts | Best balance of React-native declarative API and zero-config responsiveness; version 3.x removed external animation dependency; `<ResponsiveContainer>` handles mobile layout |
| Tailwind CSS | ^4.x | Dashboard styling | Bundled as default in `create-next-app`; utility-first works well for dashboard grid layouts; no CSS build step complexity |
| date-fns | ^4.x | Date/time manipulation | Timezone-aware helpers for converting UTC timestamps from the API to AEST/AEDT display times; tree-shakeable so bundle stays small |
| Zod | ^3.x | Runtime schema validation | Validate fuel API responses before inserting to DB; fail loudly if upstream schema changes rather than silently corrupting data |
| PM2 | ^5.x | Process management for self-hosted | Keeps `next start` and the scraper process running after reboots; `pm2 startup` generates the systemd unit automatically |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker Compose | Run TimescaleDB locally and in production | Single `docker-compose.yml` defines the DB container; `timescale/timescaledb:2.24.0-pg17` image; mount a host volume for data persistence |
| Drizzle Kit | Schema migrations | `npx drizzle-kit generate` produces readable SQL migration files; `npx drizzle-kit migrate` applies them |
| ESLint + Biome | Linting / formatting | Next.js 16 dropped built-in `next lint` in favour of external tools; Biome replaces Prettier + ESLint rules with a single fast binary |
| tsx | Running TypeScript scripts directly | For one-off migration scripts or data backfill jobs without a full compile step |

## Data Source

**Primary:** fuelpricesqld.com.au API (official Queensland Government reporting scheme)

| Detail | Value |
|--------|-------|
| Base URL | `https://fppdirectapi-prod.fuelpricesqld.com.au/` |
| Auth | `Authorization: 'FPDAPI SubscriberToken=<your token>'` |
| Key endpoints | `Price/GetSitesPrices`, `Subscriber/GetFullSiteDetails`, `GetCountryFuelTypes` |
| Format | JSON |
| Access | Free — register at fuelpricesqld.com.au as a "data consumer" |
| Update frequency | Near-real-time (stations report on price change; not guaranteed 15-min cadence from their side) |
| Coverage | All Queensland stations |

**Confidence:** MEDIUM — endpoint structure confirmed via Home Assistant community integration reverse-engineering and QLD Open Data Portal descriptions. Authentication token flow requires completing the sign-up before first scrape. API terms must be reviewed before deployment.

**Fallback:** `data.qld.gov.au` publishes monthly CSV dumps for all of 2025 under Creative Commons Attribution 4.0. Useful for backfilling historical data before the live API is wired up.

## Installation

```bash
# Create project
npx create-next-app@latest fuelsniffer --typescript --tailwind --app --eslint

# Core runtime dependencies
npm install axios recharts date-fns zod web-push drizzle-orm postgres

# Scheduler
npm install node-cron

# Dev tools
npm install -D drizzle-kit @types/node-cron @types/web-push tsx

# PM2 (installed globally on the server, not in package.json)
npm install -g pm2
```

```yaml
# docker-compose.yml (TimescaleDB)
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
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js (full-stack) | Express + React (separate processes) | If the API layer grows complex enough to warrant independent deployment or team separation; overkill here |
| TimescaleDB | Plain PostgreSQL | If you never need time-series query helpers (continuous aggregates, time_bucket); fine for a hobby project, but TimescaleDB adds zero complexity as a PostgreSQL extension |
| TimescaleDB | InfluxDB 3.0 | InfluxDB is faster for pure write-heavy IoT workloads; but requires learning Flux/SQL dialect and has weaker relational query support; station metadata (lat/lng, brand, suburb) is relational data that benefits from PostgreSQL joins |
| Drizzle ORM | Prisma 7 | Prisma 7 is now pure TypeScript and excellent; choose Prisma if you prefer schema-first migrations and more abstracted query API; Drizzle is better when you want to write time-series SQL directly |
| node-cron | BullMQ + Redis | BullMQ is the right choice if you need job retry, distributed workers, or job persistence across crashes; adds Redis as a dependency — unwarranted complexity for a single-server self-hosted scraper |
| web-push (VAPID) | Firebase FCM | FCM requires a Google account dependency; VAPID is browser-native and self-contained; FCM only makes sense if you later need iOS Safari push (which requires Apple tokens anyway) |
| Recharts | Nivo | Nivo produces more polished default aesthetics; heavier dependency tree; Recharts 3.x is sufficient and easier to customise for dashboard grid layouts |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Playwright/Puppeteer for scraping | The Queensland fuel data is a JSON API, not a rendered webpage; headless browsers add 200MB+ to your Docker image, consume RAM, and are unreliable on a home server | `axios` — a plain HTTP GET with the auth header is all that is needed |
| Cheerio | Same reason — HTML parsing is irrelevant when the source is a JSON REST API | `axios` + `JSON.parse` / `zod` validation |
| Agenda (job scheduler) | Requires MongoDB as a backend; introduces a second database for scheduling a single recurring task | `node-cron` for the schedule; PM2 `--max-restarts` for crash recovery |
| InfluxDB 2.x with Flux | Flux is deprecated in InfluxDB 3.0; community documentation is split between v2 (Flux) and v3 (SQL) making it confusing to onboard; TimescaleDB gives you plain SQL | TimescaleDB |
| Separate Express API server | Adds a second Node.js process to manage, a second port to proxy, and doubles the deployment surface area for a single-developer project | Next.js API routes (App Router Route Handlers) |
| Firebase / Firestore | Cloud lock-in conflicts with the self-hosted constraint; real-time listeners are unnecessary when 15-min polling is the data cadence | TimescaleDB + SSE or periodic polling from the dashboard |
| Vercel deployment | The project is explicitly self-hosted; Vercel's serverless functions have cold-start latency incompatible with a persistent scheduler | PM2 + `next start` on a home server |

## Stack Patterns by Variant

**If the 15-minute scrape interval must survive process crashes without missing a cycle:**
- Upgrade from `node-cron` to BullMQ + Redis
- Add a `bull-board` dashboard to inspect job state
- Because: BullMQ persists scheduled jobs in Redis; node-cron reschedules only after process restart

**If you add more users beyond the initial friend group:**
- Add NextAuth.js with a credentials or magic-link provider
- Because: the current design uses no auth; NextAuth integrates into App Router middleware cleanly and protects API routes

**If historical data grows beyond ~1 year at hourly resolution (~9 stations x 6 fuel types x 8760 hours = ~470K rows):**
- Enable TimescaleDB compression policies on the hourly aggregate hypertable
- Because: TimescaleDB columnar compression achieves 90–95% size reduction on time-series data; transparent to queries

**If you want live price updates in the dashboard without page refresh:**
- Add Server-Sent Events (SSE) via a Next.js Route Handler streaming response
- Because: SSE is simpler than WebSockets for one-way server-to-browser pushes; no additional library required

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 16 | Node.js 20.9+ | Node.js 18 no longer supported by Next.js 16 |
| Next.js 16 | React 19.2 | Ships together; do not mix React 18 with Next.js 16 |
| TimescaleDB 2.24.0 | PostgreSQL 15, 16, 17 | Use pg17 tag; do not track `latest` tag as it can auto-upgrade PostgreSQL major version |
| Drizzle ORM | `postgres` driver (pure JS) | Use the `postgres` npm package, not `pg`; `postgres` is what Drizzle's PostgreSQL adapter is optimised for |
| Recharts 3.x | React 18+ | Version 3.x requires React 18 minimum; compatible with React 19.2 |
| web-push 3.x | Node.js 18+ | Maintained for current LTS; VAPID key generation is built-in |

## Sources

- [QLD Open Data Portal — Fuel price reporting 2025](https://www.data.qld.gov.au/dataset/fuel-price-reporting-2025) — confirmed API availability, field names, monthly CSV fallback (MEDIUM confidence — live API requires sign-up)
- [Home Assistant Community — Queensland Fuel Prices Integration](https://community.home-assistant.io/t/queensland-fuel-prices-integration/406642) — confirmed exact API endpoints, auth header format, query parameters (MEDIUM confidence — community-verified, not official docs)
- [FuelPrice Australia API](https://fuelprice.io/api/) — third-party alternative with real-time JSON; requires bearer token; cross-state coverage (MEDIUM confidence — proprietary commercial API)
- [Next.js 16 release blog](https://nextjs.org/blog/next-16) — confirmed version, Turbopack stable, Node.js 20.9 minimum, React 19.2 (HIGH confidence — official Vercel blog, published October 21 2025)
- [TimescaleDB Docker Hub](https://hub.docker.com/r/timescale/timescaledb) — confirmed 2.24.0-pg17 tag, Docker setup (HIGH confidence — official image)
- [Recharts GitHub releases](https://github.com/recharts/recharts/releases) — confirmed 3.8.0 current stable (HIGH confidence — official repo)
- [web-push npm](https://www.npmjs.com/package/web-push) — confirmed v3.x active, VAPID support (HIGH confidence — official npm registry)
- [BullMQ vs node-cron comparison — Better Stack](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/) — scheduling library tradeoffs (MEDIUM confidence — authoritative community guide)
- [Drizzle vs Prisma 2026 — makerkit.dev](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) — ORM comparison including Prisma 7 pure-TS rewrite (MEDIUM confidence — community blog, cross-referenced with Prisma official docs)
- [TimescaleDB vs InfluxDB — sanj.dev benchmarks 2025](https://sanj.dev/post/clickhouse-timescaledb-influxdb-time-series-comparison) — time-series DB comparison (MEDIUM confidence — single source, aligns with official vendor claims)

---
*Stack research for: fuel price scraping and dashboard (Queensland, Australia)*
*Researched: 2026-03-22*
