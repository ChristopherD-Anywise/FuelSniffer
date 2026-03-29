# FuelSniffer

A fuel price tracking dashboard for North Brisbane. Scrapes Queensland fuel prices every 15 minutes and presents them through a web dashboard with map view, filtering by fuel type and distance, and 7-day price history.

## Requirements

- Docker and Docker Compose
- A QLD Fuel Price API token — register free at [fuelpricesqld.com.au](https://www.fuelpricesqld.com.au) as a "data consumer" (token arrives by email)

## Quick Start

```bash
cp .env.example .env
# Edit .env — set DB_PASSWORD, QLD_API_TOKEN, SESSION_SECRET, and DATABASE_URL
```

Generate a strong `SESSION_SECRET` (32+ characters):
```bash
openssl rand -base64 32
```

Build and start:
```bash
docker compose build
docker compose up -d
```

The app will be available at **http://localhost:3000**.

On first boot the app runs database migrations automatically, then the scraper fetches all current Queensland fuel prices (~7000 readings). Subsequent scrapes run every 15 minutes.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_PASSWORD` | Yes | PostgreSQL password for the `fuelsniffer` user |
| `DATABASE_URL` | Yes | Full connection string — `postgresql://fuelsniffer:<DB_PASSWORD>@localhost:5432/fuelsniffer` |
| `QLD_API_TOKEN` | Yes | Token from fuelpricesqld.com.au |
| `SESSION_SECRET` | Yes | High-entropy string for JWT signing (32+ chars) |
| `HEALTHCHECKS_PING_URL` | No | healthchecks.io ping URL for scraper dead-man's-switch |

## Docker Services

| Service | Purpose |
|---------|---------|
| `postgres` | PostgreSQL 17 database, data persisted to `./data/postgres` |
| `app` | Next.js app + scraper scheduler on port 3000 |
| `db-backup` | Hourly `pg_dump` sidecar — writes compressed backups to `./backups/`, retains last 48 |
| `cloudflared` | Cloudflare tunnel for external access (optional — remove from compose if not needed) |

All services restart automatically on failure and on system boot (`restart: always`).

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Scraper status — last run time and price count |
| `GET /api/prices?fuel=2&lat=-27.47&lng=153.02&radius=10` | Current prices near a location |
| `GET /api/prices/history?station=123&fuel=2&hours=168` | 7-day price history |
| `GET /api/search?q=coles` | Search stations by name or suburb |

## Development

```bash
# Install dependencies
npm install

# Start the database
docker compose up -d postgres

# Run migrations
npx tsx src/lib/db/migrate.ts

# Start the dev server
npm run dev
```

The dev server runs on http://localhost:3000 with Turbopack.

```bash
# Run tests
npm test

# Type check
npx tsc --noEmit
```

## Database Migrations

Migrations are plain SQL files in `src/lib/db/migrations/`. They run automatically on container startup via `npx tsx src/lib/db/migrate.ts`. The runner tracks applied migrations in a `_migrations` table.

To add a migration:
1. Create a new numbered file: `src/lib/db/migrations/0006_my_change.sql`
2. Restart the app container — it will apply it on boot

## Architecture

- **Next.js 16** — full-stack: App Router handles both API routes and the dashboard UI
- **PostgreSQL 17** — primary store with materialized views for daily price aggregates
- **Drizzle ORM** — database access layer with plain SQL migrations
- **node-cron** — 15-minute scrape schedule, started via Next.js `instrumentation.ts`
- **Tailwind CSS 4** — dashboard styling
- **Recharts** — price trend charts
- **Leaflet** — interactive station map

## Docker Build Notes

The `package-lock.json` is macOS-generated and only records `@tailwindcss/oxide-darwin-arm64`. On Alpine Linux (musl libc), the Dockerfile explicitly installs `@tailwindcss/oxide-linux-arm64-musl` after `npm ci` to work around an npm optional dependency bug. Do not remove this step.

## Backups

The `db-backup` sidecar runs `pg_dump` every hour and writes gzipped backups to `./backups/`. The 48 most recent are kept (2 days). The latest backup is symlinked at `./backups/latest.sql.gz`.

To restore from backup:
```bash
gunzip -c ./backups/latest.sql.gz | docker exec -i fuelsniffer-postgres-1 psql -U fuelsniffer -d fuelsniffer
```
