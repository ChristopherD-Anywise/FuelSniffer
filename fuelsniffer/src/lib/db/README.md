# Database Migrations

## Why two migration systems?

Drizzle Kit generates standard PostgreSQL DDL from `schema.ts`. However, **Drizzle Kit cannot generate TimescaleDB-specific DDL** such as:
- `SELECT create_hypertable(...)` — converts a table to a time-series hypertable
- `CREATE MATERIALIZED VIEW WITH (timescaledb.continuous)` — continuous aggregates
- `SELECT add_continuous_aggregate_policy(...)` — auto-refresh policies
- `SELECT add_retention_policy(...)` — automatic data expiry

These are maintained manually in the `migrations/` directory.

## Migration files

| File | Purpose | Run order |
|------|---------|-----------|
| `0000_schema.sql` | CREATE TABLE for stations, price_readings, scrape_health | First |
| `0001_hypertable.sql` | Convert price_readings to hypertable; add composite index | Second |
| `0002_cagg.sql` | Hourly continuous aggregate + refresh policy + 7-day retention policy | Third |

## Applying migrations

```bash
# Ensure TimescaleDB is running first
docker compose up -d timescaledb

# Apply all migrations in order
DATABASE_URL=postgresql://fuelsniffer:PASSWORD@localhost:5432/fuelsniffer npx tsx src/lib/db/migrate.ts
```

## Verifying migrations

```bash
# Check price_readings is a hypertable
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -c "SELECT * FROM timescaledb_information.hypertables WHERE hypertable_name = 'price_readings';"

# Check hourly_prices continuous aggregate exists
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -c "SELECT * FROM timescaledb_information.continuous_aggregates;"

# Check retention policy is set to 7 days
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -c "SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';"
```

## CRITICAL: Do not run migrations on a populated database without backup

`0001_hypertable.sql` runs `create_hypertable()` which requires the table to be empty.
If data already exists, this will fail. Always run migrations before inserting any data.
