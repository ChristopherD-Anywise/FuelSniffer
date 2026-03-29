# Database Migrations

## Migration files

Migrations are plain SQL files applied in order by `src/lib/db/migrate.ts`.

| File | Purpose | Run order |
|------|---------|-----------|
| `0000_schema.sql` | CREATE TABLE for stations, price_readings, scrape_health | 1st |
| `0002_cagg.sql` | Composite index + hourly_prices + daily_prices materialized views | 2nd |
| `0003_invite_codes_sessions.sql` | invite_codes and sessions tables | 3rd |
| `0004_performance_indexes.sql` | Performance indexes (station_fuel_recorded, lat_lng, postcode) | 4th |
| `0005_daily_aggregate.sql` | No-op placeholder (kept for file-list continuity) | 5th |

Note: `0001_hypertable.sql` was removed — it contained TimescaleDB-specific DDL that is no longer applicable.

## Applying migrations

```bash
# Ensure postgres is running first
docker compose up -d postgres

# Apply all migrations in order
DATABASE_URL=postgresql://fuelsniffer:PASSWORD@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
```

## Verifying migrations

```bash
# Check all tables exist
docker compose exec postgres psql -U fuelsniffer -c "\dt"

# Check materialized views exist
docker compose exec postgres psql -U fuelsniffer -c "\dv"

# Check indexes exist (should include hourly_prices_pk, daily_prices_pk)
docker compose exec postgres psql -U fuelsniffer -c "\di"
```

## Data retention

- `price_readings`: raw 15-minute rows, kept for 7 days. Deleted nightly at 2am by the scheduler.
- `hourly_prices`: materialized view, refreshed hourly. Reflects the last 7 days (derived from price_readings).
- `daily_prices`: materialized view, refreshed nightly BEFORE the delete. Keeps historical daily min/max forever.

## IMPORTANT: Do not run migrations on a populated database without backup

Migrations create tables and materialized views. On a database that already has these objects, the `IF NOT EXISTS` guards will skip them safely. However, always take a backup before running migrations in production.
