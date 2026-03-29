# TimescaleDB → Plain PostgreSQL Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TimescaleDB with plain PostgreSQL 17, implementing tiered data retention (7-day raw → forever daily min/max) using standard SQL materialized views and scheduled jobs baked into the existing node-cron scheduler.

**Architecture:** Drop TimescaleDB-specific DDL (hypertables, continuous aggregates, retention policies) and replace with: (1) plain `price_readings` table, (2) two standard materialized views (`hourly_prices`, `daily_prices`), (3) a nightly job that captures daily min/max into `daily_prices` then deletes raw rows older than 7 days, (4) an hourly refresh of `hourly_prices`. The history API route is updated so the `daily_prices` fallback triggers at 7 days (not 30) — since `hourly_prices` only contains the last 7 days of raw data.

**Retention trade-off (accepted):** TimescaleDB preserved hourly averages for 30 days separately from raw data. Plain PostgreSQL makes this harder without an archive table. The accepted simplification: hourly granularity is available for 7 days (from the live view), daily min/max is available forever. The history API boundary is adjusted accordingly.

**Tech Stack:** PostgreSQL 17 Alpine, Drizzle ORM (unchanged), node-cron (extended with cleanup/refresh jobs), Next.js App Router API routes (minor query + boundary changes), Docker Compose.

---

## File Map

| File | Action | What Changes |
|------|--------|--------------|
| `fuelsniffer/docker-compose.yml` | Replace | DB image → `postgres:17-alpine`; strip TimescaleDB entrypoint; simplify backup sidecar (plain `pg_dump --clean --if-exists --no-owner`); rename service `timescaledb` → `postgres`; rename data volume path |
| `fuelsniffer/src/lib/db/migrations/0001_hypertable.sql` | Delete | No longer needed |
| `fuelsniffer/src/lib/db/migrations/0002_cagg.sql` | Replace | Standard `CREATE MATERIALIZED VIEW` with unique indexes for CONCURRENT refresh |
| `fuelsniffer/src/lib/db/migrations/0005_daily_aggregate.sql` | Replace | No-op placeholder (daily view now in 0002) |
| `fuelsniffer/src/lib/db/migrate.ts` | Modify | Remove `0001_hypertable.sql` from file list; fix header comment |
| `fuelsniffer/src/lib/scraper/scheduler.ts` | Replace | Add hourly view refresh + nightly capture-then-delete job |
| `fuelsniffer/src/app/api/prices/history/route.ts` | Modify | Change daily fallback threshold from 720h to 168h; replace `time_bucket()` with `DATE_TRUNC()` |
| `fuelsniffer/scripts/db-backup.sh` | Replace | Change `pg_dump --clean --if-exists --no-owner` — remove TimescaleDB image reference; update image comment |
| `fuelsniffer/scripts/db-entrypoint.sh` | Delete | TimescaleDB-specific recovery script, no longer needed |
| `fuelsniffer/src/lib/db/README.md` | Replace | Remove all TimescaleDB references; document plain PostgreSQL approach |
| `fuelsniffer/.env.example` | Modify | Change `# TimescaleDB` comment to `# Database` |

---

## Task 1: Replace Docker Compose DB Service

**Files:**
- Replace: `fuelsniffer/docker-compose.yml`

Replaces the TimescaleDB container (with its complex custom entrypoint) with a plain `postgres:17-alpine` container. The backup sidecar uses a full `pg_dump --clean --if-exists --no-owner` (same as the standalone script) — no need to enumerate individual tables.

- [ ] **Step 1: Replace docker-compose.yml entirely**

Write the following as the full content of `fuelsniffer/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    stop_grace_period: 30s
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fuelsniffer -d fuelsniffer"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: fuelsniffer
      POSTGRES_USER: fuelsniffer
    ports:
      - "5432:5432"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./backups:/backups
    restart: unless-stopped

  db-backup:
    image: postgres:17-alpine
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PGHOST: postgres
      PGUSER: fuelsniffer
      PGPASSWORD: ${DB_PASSWORD}
      PGDATABASE: fuelsniffer
    volumes:
      - ./backups:/backups
    entrypoint:
      - sh
      - -c
      - |
        set -o pipefail
        BACKUP_DIR="/backups"
        RETENTION_COUNT=48
        echo "[backup] Backup sidecar started. Writing to ${BACKUP_DIR}, keeping last ${RETENTION_COUNT} backups."
        while true; do
          TIMESTAMP=$(date +%Y%m%d_%H%M%S)
          BACKUP_FILE="${BACKUP_DIR}/fuelsniffer_${TIMESTAMP}.sql.gz"
          TEMP_FILE="${BACKUP_DIR}/.fuelsniffer_${TIMESTAMP}.sql.gz.tmp"
          echo "[backup] Starting backup at $(date)"
          if pg_dump --clean --if-exists --no-owner | gzip > "${TEMP_FILE}"; then
            mv "${TEMP_FILE}" "${BACKUP_FILE}"
            echo "[backup] OK — $(du -h "${BACKUP_FILE}" | cut -f1) written to ${BACKUP_FILE}"
            ln -sf "$(basename "${BACKUP_FILE}")" "${BACKUP_DIR}/latest.sql.gz"
          else
            echo "[backup] FAILED — pg_dump returned non-zero"
            rm -f "${TEMP_FILE}"
          fi
          ls -t "${BACKUP_DIR}"/fuelsniffer_*.sql.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | xargs -r rm -f
          echo "[backup] Next backup in 1 hour"
          sleep 3600
        done
    restart: unless-stopped

  app:
    build: .
    environment:
      DATABASE_URL: postgresql://fuelsniffer:${DB_PASSWORD}@postgres:5432/fuelsniffer
      QLD_API_TOKEN: ${QLD_API_TOKEN}
      HEALTHCHECKS_PING_URL: ${HEALTHCHECKS_PING_URL}
      TZ: Australia/Brisbane
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3000:3000"
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate --url http://app:3000
    depends_on:
      - app
```

- [ ] **Step 2: Verify the compose file is valid**

```bash
cd fuelsniffer && docker compose config --quiet
```

Expected: no output (silent success). If you see errors, fix the YAML syntax.

- [ ] **Step 3: Commit**

```bash
cd fuelsniffer && git add docker-compose.yml
git commit -m "feat: replace timescaledb with postgres:17-alpine in docker-compose"
```

---

## Task 2: Replace TimescaleDB Migration Files with Standard SQL

**Files:**
- Delete: `fuelsniffer/src/lib/db/migrations/0001_hypertable.sql`
- Replace: `fuelsniffer/src/lib/db/migrations/0002_cagg.sql`
- Replace: `fuelsniffer/src/lib/db/migrations/0005_daily_aggregate.sql`
- Modify: `fuelsniffer/src/lib/db/migrate.ts`

The composite index from `0001_hypertable.sql` is preserved by moving it into `0002_cagg.sql`. Both materialized views are created in `0002_cagg.sql` with unique indexes (required for `REFRESH MATERIALIZED VIEW CONCURRENTLY`). Migration `0005` becomes a no-op placeholder so the file list stays intact.

- [ ] **Step 1: Write the new 0002_cagg.sql**

Replace the full contents of `fuelsniffer/src/lib/db/migrations/0002_cagg.sql` with:

```sql
-- Migration 0002: Composite index + hourly materialized view + daily materialized view
-- Replaces TimescaleDB hypertable, continuous aggregates, and retention policies.
-- D-04 (locked): raw rows retained for 7 days — enforced by nightly cleanup in scheduler.
-- D-05 (locked): hourly rollup via standard materialized view, refreshed hourly.

-- Composite index: station + fuel type + time (DESC) — optimises dashboard queries.
-- Previously created in 0001_hypertable.sql; moved here after removing hypertable.
CREATE INDEX IF NOT EXISTS price_readings_station_fuel_time
  ON price_readings (station_id, fuel_type_id, recorded_at DESC);

-- Hourly rollup: pre-aggregated averages per station+fuel+hour.
-- Refreshed hourly by the scheduler (src/lib/scraper/scheduler.ts).
-- CONCURRENT refresh requires a unique index and allows queries during refresh.
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_prices AS
SELECT
  station_id,
  fuel_type_id,
  DATE_TRUNC('hour', recorded_at) AS bucket,
  AVG(price_cents)::NUMERIC(6,1)  AS avg_price_cents,
  MIN(price_cents)                AS min_price_cents,
  MAX(price_cents)                AS max_price_cents
FROM price_readings
GROUP BY station_id, fuel_type_id, DATE_TRUNC('hour', recorded_at);

CREATE UNIQUE INDEX IF NOT EXISTS hourly_prices_pk
  ON hourly_prices (station_id, fuel_type_id, bucket);

-- Daily rollup: pre-aggregated min/max per station+fuel+day, kept forever.
-- Refreshed nightly by the scheduler BEFORE raw rows are deleted (src/lib/scraper/scheduler.ts).
-- Built from price_readings directly so it captures each day before raw data expires.
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_prices AS
SELECT
  station_id,
  fuel_type_id,
  DATE_TRUNC('day', recorded_at)  AS day_bucket,
  AVG(price_cents)::NUMERIC(6,1)  AS avg_price_cents,
  MIN(price_cents)                AS min_price_cents,
  MAX(price_cents)                AS max_price_cents
FROM price_readings
GROUP BY station_id, fuel_type_id, DATE_TRUNC('day', recorded_at);

CREATE UNIQUE INDEX IF NOT EXISTS daily_prices_pk
  ON daily_prices (station_id, fuel_type_id, day_bucket);
```

- [ ] **Step 2: Write the new 0005_daily_aggregate.sql**

Replace the full contents of `fuelsniffer/src/lib/db/migrations/0005_daily_aggregate.sql` with:

```sql
-- Migration 0005: no-op placeholder
-- Previously created the TimescaleDB daily continuous aggregate.
-- That is now handled in 0002_cagg.sql as a standard materialized view.
-- This file is kept so the migration runner file list does not skip a number.
SELECT 1;
```

- [ ] **Step 3: Delete 0001_hypertable.sql**

```bash
cd fuelsniffer && git rm src/lib/db/migrations/0001_hypertable.sql
```

- [ ] **Step 4: Update migrate.ts — remove 0001 from file list and fix header**

In `fuelsniffer/src/lib/db/migrate.ts`, make two changes:

Change the header comment line that says `Applies SQL files in 0000 → 0001 → 0002 order.`:

```typescript
 * Applies SQL files in order: 0000, 0002, 0003, 0004, 0005.
 * (0001_hypertable.sql was removed — it contained TimescaleDB-specific DDL.)
```

Change the `files` array on line 35:

Old:
```typescript
const files = ['0000_schema.sql', '0001_hypertable.sql', '0002_cagg.sql', '0003_invite_codes_sessions.sql', '0004_performance_indexes.sql', '0005_daily_aggregate.sql']
```

New:
```typescript
const files = ['0000_schema.sql', '0002_cagg.sql', '0003_invite_codes_sessions.sql', '0004_performance_indexes.sql', '0005_daily_aggregate.sql']
```

- [ ] **Step 5: Commit**

```bash
cd fuelsniffer && git add src/lib/db/migrations/0002_cagg.sql src/lib/db/migrations/0005_daily_aggregate.sql src/lib/db/migrate.ts
git commit -m "feat: replace timescaledb migrations with plain postgresql materialized views"
```

---

## Task 3: Add Cleanup + Refresh Jobs to the Scheduler

**Files:**
- Replace: `fuelsniffer/src/lib/scraper/scheduler.ts`

The scheduler runs three jobs:
1. **Every 15 min** — existing scrape job (unchanged)
2. **Every hour at :05** — `REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`
3. **Every night at 2:00am Brisbane** — refresh `daily_prices` first (captures the day's data), then delete raw rows older than 7 days, then refresh `hourly_prices` to reflect the post-delete state

**Critical ordering in Job 3:** `daily_prices` must be refreshed BEFORE the delete, so today's data is captured in the view before raw rows disappear.

- [ ] **Step 1: Replace scheduler.ts entirely**

Write the following as the full content of `fuelsniffer/src/lib/scraper/scheduler.ts`:

```typescript
import cron from 'node-cron'
import { runScrapeJob } from './writer'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

/**
 * Start the scrape + maintenance schedulers.
 * Called once from src/instrumentation.ts when the Next.js server starts.
 *
 * node-cron v4 BREAKING CHANGES (v4.2.1 — do not use v3 patterns):
 * - 'scheduled' option is REMOVED — tasks start immediately when created
 * - 'runOnInit' option is REMOVED
 * - Use 'noOverlap: true' to prevent concurrent runs
 *
 * D-11 (locked): Run immediately on startup, then every 15 minutes.
 */
export function startScheduler(): void {
  // D-11: Immediate first execution (before the cron schedule fires)
  console.log('[scheduler] Starting — running immediate scrape on startup (D-11)')
  runScrapeJob().catch((err) => {
    console.error('[scheduler] Immediate startup scrape failed:', err)
  })

  // Job 1: Scrape every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runScrapeJob().catch((err) => {
      console.error('[scheduler] Scheduled scrape failed:', err)
    })
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  // Job 2: Refresh hourly_prices materialized view every hour at :05
  // CONCURRENT refresh allows read queries to continue during refresh.
  cron.schedule('5 * * * *', () => {
    db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      .catch((err) => console.error('[scheduler] hourly_prices refresh failed:', err))
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  // Job 3: Nightly maintenance at 2:00am Brisbane time.
  // ORDER IS CRITICAL:
  //   1. Refresh daily_prices FIRST — captures today's data before raw rows are deleted
  //   2. Delete raw rows older than 7 days (D-04 locked)
  //   3. Refresh hourly_prices — reflects post-delete state (now contains only last 7 days)
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[scheduler] Starting nightly maintenance...')

      // Step 1: Capture current data into daily_prices BEFORE deleting raw rows.
      // This preserves historical daily min/max even after raw data expires.
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY daily_prices`)
      console.log('[scheduler] daily_prices refreshed (pre-delete)')

      // Step 2: Delete raw readings older than 7 days (D-04 locked)
      await db.execute(sql`
        DELETE FROM price_readings
        WHERE recorded_at < NOW() - INTERVAL '7 days'
      `)
      console.log('[scheduler] Deleted raw rows older than 7 days')

      // Step 3: Refresh hourly_prices to reflect post-delete state
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices`)
      console.log('[scheduler] hourly_prices refreshed (post-delete)')

      console.log('[scheduler] Nightly maintenance complete')
    } catch (err) {
      console.error('[scheduler] Nightly maintenance failed:', err)
    }
  }, {
    timezone: 'Australia/Brisbane',
    noOverlap: true,
  })

  console.log('[scheduler] Running — scraping every 15 min, hourly view refresh, nightly cleanup (Australia/Brisbane)')
}
```

- [ ] **Step 2: Commit**

```bash
cd fuelsniffer && git add src/lib/scraper/scheduler.ts
git commit -m "feat: add hourly view refresh and nightly data retention cleanup to scheduler"
```

---

## Task 4: Fix the History API Route

**Files:**
- Modify: `fuelsniffer/src/app/api/prices/history/route.ts`

Two changes needed:
1. The `hours > 720` threshold for switching to `daily_prices` must change to `hours > 168` (7 days). After migration, `hourly_prices` only contains the last 7 days of data — querying it for 8–30 days would return empty results. `daily_prices` handles anything older than 7 days.
2. The raw fallback query uses `time_bucket()` (TimescaleDB only) — replace with `DATE_TRUNC()`.

- [ ] **Step 1: Update the daily threshold and replace time_bucket()**

In `fuelsniffer/src/app/api/prices/history/route.ts`, make the following changes:

Change line 37 from:
```typescript
  if (hours > 720) {
```
to:
```typescript
  if (hours > 168) {
```

Change the raw fallback query (lines 66–79) from:
```typescript
    const rawRows = await db.execute(sql`
      SELECT
        time_bucket('1 hour', recorded_at) AS bucket,
        AVG(price_cents)::NUMERIC(6,1) AS avg_price,
        MIN(price_cents) AS min_price,
        MAX(price_cents) AS max_price
      FROM price_readings
      WHERE station_id = ${station}
        AND fuel_type_id = ${fuel}
        AND recorded_at >= NOW() - ${hours + ' hours'}::interval
      GROUP BY bucket
      ORDER BY bucket ASC
    `)
```
to:
```typescript
    const rawRows = await db.execute(sql`
      SELECT
        DATE_TRUNC('hour', recorded_at) AS bucket,
        AVG(price_cents)::NUMERIC(6,1) AS avg_price,
        MIN(price_cents) AS min_price,
        MAX(price_cents) AS max_price
      FROM price_readings
      WHERE station_id = ${station}
        AND fuel_type_id = ${fuel}
        AND recorded_at >= NOW() - ${hours + ' hours'}::interval
      GROUP BY DATE_TRUNC('hour', recorded_at)
      ORDER BY bucket ASC
    `)
```

- [ ] **Step 2: Commit**

```bash
cd fuelsniffer && git add src/app/api/prices/history/route.ts
git commit -m "fix: adjust history API boundary to 7d and replace time_bucket() with date_trunc()"
```

---

## Task 5: Update Backup Script and Remove Entrypoint Script

**Files:**
- Replace: `fuelsniffer/scripts/db-backup.sh`
- Delete: `fuelsniffer/scripts/db-entrypoint.sh`

The standalone backup script (`db-backup.sh`) does a full `pg_dump --clean --if-exists --no-owner` — no changes to the dump logic, just update the header comment to remove the TimescaleDB image reference.

- [ ] **Step 1: Update db-backup.sh header comment only**

In `fuelsniffer/scripts/db-backup.sh`, replace the header block (lines 1–9):

Old:
```bash
#!/bin/bash
# Hourly pg_dump with rotation. Keeps last 48 backups (2 days).
# Runs as the entrypoint of the db-backup sidecar container.
#
# Expects these env vars (set by docker-compose):
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#
# Writes to /backups (mounted from host ./backups/)
```

New:
```bash
#!/bin/bash
# Hourly pg_dump with rotation. Keeps last 48 backups (2 days).
# Runs as the entrypoint of the db-backup sidecar (postgres:17-alpine image).
#
# Expects these env vars (set by docker-compose):
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#
# Writes to /backups (mounted from host ./backups/)
```

- [ ] **Step 2: Delete db-entrypoint.sh**

```bash
cd fuelsniffer && git rm scripts/db-entrypoint.sh
```

- [ ] **Step 3: Commit**

```bash
cd fuelsniffer && git add scripts/db-backup.sh
git commit -m "chore: update backup script comment; remove timescaledb entrypoint script"
```

---

## Task 6: Update Stale Documentation and Config

**Files:**
- Replace: `fuelsniffer/src/lib/db/README.md`
- Modify: `fuelsniffer/.env.example`

- [ ] **Step 1: Replace src/lib/db/README.md**

Write the following as the full content of `fuelsniffer/src/lib/db/README.md`:

```markdown
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
```

- [ ] **Step 2: Update .env.example comment**

In `fuelsniffer/.env.example`, change line 3 from:

```
# TimescaleDB
```

to:

```
# Database
```

- [ ] **Step 3: Commit**

```bash
cd fuelsniffer && git add src/lib/db/README.md .env.example
git commit -m "docs: update db README and env.example to remove timescaledb references"
```

---

## Task 7: End-to-End Smoke Test

Validates the migration works on a fresh database.

- [ ] **Step 1: Stop and remove the old containers and data volume**

```bash
cd fuelsniffer
docker compose down -v
```

Expected: containers stopped, volumes removed.

> **Warning:** This deletes all existing database data. If you have production data, export it first:
> ```bash
> # Run this BEFORE docker compose down
> docker compose exec postgres pg_dump --clean --if-exists --no-owner -U fuelsniffer fuelsniffer > pre-migration-backup.sql
> ```

- [ ] **Step 2: Start the new postgres container**

```bash
docker compose up postgres -d
docker compose logs postgres --follow
```

Expected: logs show `database system is ready to accept connections`. Ctrl+C to stop following.

- [ ] **Step 3: Run migrations against the fresh database**

```bash
cd fuelsniffer
DATABASE_URL=postgresql://fuelsniffer:$(grep ^DB_PASSWORD .env | cut -d= -f2)@localhost:5432/fuelsniffer \
  npx tsx src/lib/db/migrate.ts
```

Expected output:
```
Applying migration: 0000_schema.sql
  ✓ 0000_schema.sql applied
Applying migration: 0002_cagg.sql
  ✓ 0002_cagg.sql applied
Applying migration: 0003_invite_codes_sessions.sql
  ✓ 0003_invite_codes_sessions.sql applied
Applying migration: 0004_performance_indexes.sql
  ✓ 0004_performance_indexes.sql applied
Applying migration: 0005_daily_aggregate.sql
  ✓ 0005_daily_aggregate.sql applied
All migrations applied successfully.
```

- [ ] **Step 4: Verify views and indexes exist**

```bash
docker compose exec postgres psql -U fuelsniffer -c "\dv" -c "\di"
```

Expected: `hourly_prices` and `daily_prices` in the views list. `hourly_prices_pk` and `daily_prices_pk` in the indexes list.

- [ ] **Step 5: Start the full stack**

```bash
docker compose up -d
docker compose ps
```

Expected: `postgres`, `db-backup`, `app`, `cloudflared` all show `Up` / `healthy`.

- [ ] **Step 6: Verify the app is healthy**

```bash
curl -s http://localhost:3000/api/health | jq .
```

Expected: JSON response. No 500 errors.

- [ ] **Step 7: Verify history API works without TimescaleDB functions**

```bash
curl -s "http://localhost:3000/api/prices/history?station=1&fuel=2&hours=24" | jq 'length'
```

Expected: a number (0 on a fresh DB is fine — just confirms no 500 error from `time_bucket()`).

- [ ] **Step 8: Final commit**

```bash
cd fuelsniffer && git commit --allow-empty -m "chore: timescaledb→postgres migration complete and smoke tested"
```

---

## Notes for the Engineer

### Retention behaviour after migration

| Data | Retention | How |
|------|-----------|-----|
| Raw `price_readings` | 7 days | Nightly DELETE at 2am |
| `hourly_prices` view | 7 days (derived from raw) | Auto-shrinks after nightly delete |
| `daily_prices` view | Forever | Refreshed BEFORE delete each night — keeps historical daily min/max |

### Nightly job order is critical

The nightly scheduler job (Job 3) must run in this order:
1. `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_prices` — captures today's data
2. `DELETE FROM price_readings WHERE recorded_at < NOW() - INTERVAL '7 days'` — removes old raw rows
3. `REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_prices` — trims the hourly view to match

If steps 1 and 2 are reversed, any day not yet in `daily_prices` will be permanently lost.

### History API boundary change

The old code switched to `daily_prices` at `hours > 720` (30 days). The new code switches at `hours > 168` (7 days). This is necessary because `hourly_prices` only contains the last 7 days after migration. Any chart component that allows users to select a range between 7 and 30 days will now show daily granularity instead of hourly — which is the correct behaviour given the retention model.

### Materialized view CONCURRENT refresh

`REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index on the view. Both `hourly_prices_pk` and `daily_prices_pk` are created in migration `0002_cagg.sql` for this purpose. Without them, the `CONCURRENT` keyword would error. The non-CONCURRENT form locks the view for reads during refresh — avoid it on a live database.

### If migrating an existing production database with data

1. **Export from TimescaleDB before stopping it:**
   ```bash
   docker compose exec timescaledb pg_dump --clean --if-exists --no-owner -U fuelsniffer fuelsniffer > pre-migration-backup.sql
   ```
2. Run `docker compose down -v` to remove old containers and data volume
3. Start new postgres container: `docker compose up postgres -d`
4. Run migrations: `DATABASE_URL=... npx tsx src/lib/db/migrate.ts`
5. Import the backup (TimescaleDB DDL in the backup will fail on plain postgres — use `ON_ERROR_STOP=0`):
   ```bash
   psql $DATABASE_URL -v ON_ERROR_STOP=0 < pre-migration-backup.sql
   ```
6. Manually refresh both views:
   ```bash
   psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW hourly_prices;"
   psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW daily_prices;"
   ```
7. Verify: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM stations; SELECT COUNT(*) FROM price_readings;"`
