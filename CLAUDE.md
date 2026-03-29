<!-- GSD:project-start source:PROJECT.md -->
## Project

**FuelSniffer**

A fuel price tracking dashboard for North Brisbane. Scrapes fuel prices every 15 minutes, stores historical data, and presents it through a web dashboard with filtering, alerts, and trend analysis. Shared with a small group of friends, self-hosted.

**Core Value:** Always-current fuel prices near me, so I never overpay for fuel.

### Constraints

- **Data source**: Must use publicly available Queensland fuel price data — need to research exact API/source
- **Scraping frequency**: Every 15 minutes — scraper must be lightweight and respectful of rate limits
- **Hosting**: Self-hosted — must be easy to deploy and maintain on personal infrastructure
- **Storage**: Historical data at hourly intervals to keep database size manageable
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

### Core Technologies
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.x | Full-stack framework: API routes + React dashboard (App Router) |
| React | 19.2 | Dashboard UI (bundled with Next.js 16) |
| TypeScript | 5.x | Type safety across full stack |
| PostgreSQL | 17-alpine | Time-series storage with materialized views for aggregates |
| Drizzle ORM | ^0.40 | Database access layer — plain SQL migrations in `src/lib/db/migrations/` |
| node-cron | ^3.0 | 15-minute scrape scheduler (runs inside Next.js via `src/instrumentation.ts`) |

### Supporting Libraries
| Library | Purpose |
|---------|---------|
| axios | HTTP client for Queensland fuel API |
| Recharts | Line/trend charts in the dashboard |
| Tailwind CSS | ^4.x — dashboard styling |
| date-fns | Timezone-aware date helpers (UTC → AEST/AEDT) |
| Zod | Runtime validation of fuel API responses |
| jose | JWT-based session management |
| leaflet + leaflet.markercluster | Interactive station map |

### Development Tools
| Tool | Purpose |
|------|---------|
| Docker Compose | Runs postgres, app, backup sidecar, and cloudflared tunnel |
| Drizzle Kit | Schema migrations — `npx drizzle-kit generate` / `migrate` |
| tsx | Runs TypeScript migration script at container startup |
| Vitest | Unit tests in `src/__tests__/` |
## Data Source
| Detail | Value |
|--------|-------|
| Base URL | `https://fppdirectapi-prod.fuelpricesqld.com.au/` |
| Auth | `Authorization: 'FPDAPI SubscriberToken=<your token>'` |
| Key endpoints | `Price/GetSitesPrices`, `Subscriber/GetFullSiteDetails`, `GetCountryFuelTypes` |
| Format | JSON |
| Access | Free — register at fuelpricesqld.com.au as a "data consumer" |
| Update frequency | Near-real-time (stations report on price change; not guaranteed 15-min cadence from their side) |
| Coverage | All Queensland stations |
## Data Source
| Detail | Value |
|--------|-------|
| Base URL | `https://fppdirectapi-prod.fuelpricesqld.com.au/` |
| Auth | `Authorization: 'FPDAPI SubscriberToken=<your token>'` |
| Key endpoints | `Price/GetSitesPrices`, `Subscriber/GetFullSiteDetails`, `GetCountryFuelTypes` |
| Format | JSON |
| Access | Free — register at fuelpricesqld.com.au as a "data consumer" |
| Coverage | All Queensland stations |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- **DB client**: Use `db` from `src/lib/db/client.ts`. Use the `postgres` npm package (not `pg`) — required by Drizzle's adapter.
- **Migrations**: Plain SQL files in `src/lib/db/migrations/`. Run via `npx tsx src/lib/db/migrate.ts` or automatically on container startup. Do not use `drizzle-kit push` in production.
- **Scraper**: `src/instrumentation.ts` bootstraps the scheduler on Next.js server startup. Don't start a separate process.
- **API routes**: All under `src/app/api/`. Auth is checked via middleware (`src/middleware.ts`) using JWT sessions from `src/lib/session.ts`.
- **Price field**: Use `price_change` (not `price_change_24h`) on `PriceResult` objects.
- **Type casts for raw SQL**: When casting `db.execute()` results, cast via `unknown` first: `result as unknown as MyType[]`.
- **Docker build**: The `package-lock.json` is macOS-generated and lacks `@tailwindcss/oxide-linux-arm64-musl`. The Dockerfile explicitly installs it after `npm ci`. Do not remove this step.
- **Env vars**: `DATABASE_URL` and `SESSION_SECRET` are required at runtime and throw at module load if missing. Both must be in docker-compose.yml and `.env`. Build-time placeholders exist in the Dockerfile only for the Next.js static analysis pass.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

```
fuelsniffer/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/         — scraper heartbeat status
│   │   │   ├── prices/         — current prices (filterable by fuel, location, radius)
│   │   │   │   └── history/    — 7-day price history for a station+fuel
│   │   │   ├── search/         — station search by name/suburb
│   │   │   ├── auth/           — login / logout (JWT sessions)
│   │   │   └── admin/          — invite code management
│   │   ├── dashboard/          — main UI (server + client components)
│   │   └── login/              — login page
│   ├── components/             — dashboard UI components (StationList, MapView, etc.)
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts       — drizzle db singleton
│   │   │   ├── schema.ts       — drizzle schema
│   │   │   ├── migrate.ts      — migration runner (plain SQL)
│   │   │   ├── migrations/     — SQL migration files (0000..0005)
│   │   │   └── queries/        — reusable query functions
│   │   ├── scraper/
│   │   │   ├── client.ts       — QLD fuel API HTTP client
│   │   │   ├── normaliser.ts   — price validation and normalisation
│   │   │   ├── writer.ts       — deduplication and DB insert logic
│   │   │   └── scheduler.ts    — node-cron 15-min schedule
│   │   ├── session.ts          — JWT session helpers (jose)
│   │   └── dashboard-utils.ts  — shared dashboard data helpers
│   └── instrumentation.ts      — Next.js hook that starts the scraper scheduler
├── Dockerfile                  — multi-stage build (builder + runner)
└── docker-compose.yml          — 4 services: postgres, app, db-backup, cloudflared
```

### Docker services
| Service | Image | Purpose |
|---------|-------|---------|
| postgres | postgres:17-alpine | Primary database, data persisted to `./data/postgres` |
| app | fuelsniffer-app (built) | Next.js app + scraper scheduler, port 3000 |
| db-backup | postgres:17-alpine | Hourly `pg_dump` sidecar, writes to `./backups/`, keeps 48 |
| cloudflared | cloudflare/cloudflared | Tunnel to internet (no open ports needed) |

### Database schema
- `stations` — station metadata (id, name, brand, address, lat/lng)
- `price_readings` — raw scrape data (station_id, fuel_type_id, price_cents, recorded_at, source_ts)
- `price_readings_daily` — materialized view: daily min/max/avg per station+fuel
- `invite_codes` — one-time invite codes for user registration
- `sessions` — active user sessions

### Scraper flow
1. `src/instrumentation.ts` → starts `scheduler.ts` on Next.js boot
2. Every 15 minutes: `client.ts` fetches all QLD prices → `normaliser.ts` validates/converts → `writer.ts` deduplicates by `source_ts` and bulk-inserts new readings
3. healthchecks.io ping sent after each successful run (if `HEALTHCHECKS_PING_URL` set)
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
