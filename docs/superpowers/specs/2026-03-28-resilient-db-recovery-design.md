# Resilient Database Recovery — Design Spec

## Problem

Unclean Docker shutdowns (Mac sleep, Docker Desktop restart, power loss) corrupt PostgreSQL's WAL (write-ahead log). When this happens, TimescaleDB refuses to start with `PANIC: could not write to log file`. The only fix today is deleting the entire data directory (`rm -rf data/timescaledb`), which destroys all historical price data. This has happened twice in development and will happen in production.

## Goals

1. **Prevent** WAL corruption via graceful Docker shutdown
2. **Preserve** data via automated hourly backups stored outside the Docker volume
3. **Recover automatically** from corruption without manual intervention
4. **Maintain scraping continuity** — current prices are re-scraped immediately after recovery

## Non-Goals

- Cloud/offsite backup (deferred to production deployment)
- Point-in-time recovery with WAL archiving (overkill for current scale)
- Zero-downtime recovery (a few minutes of downtime during restore is acceptable)

## Design

### Layer 1: Graceful Shutdown

**What:** Configure Docker to give PostgreSQL enough time to flush WAL and checkpoint before killing the container.

**How:** Add to the `timescaledb` service in `docker-compose.yml`:

```yaml
timescaledb:
  image: timescale/timescaledb:2.24.0-pg17
  stop_grace_period: 30s
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U fuelsniffer -d fuelsniffer"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 30s
```

**Why 30s:** PostgreSQL needs time to complete any in-flight transactions, flush dirty buffers to disk, and write a shutdown checkpoint. 30 seconds is generous — most shutdowns complete in under 5 seconds. The default Docker stop timeout is 10 seconds, which can be too short under heavy write load.

**Healthcheck:** Allows dependent services to wait until PostgreSQL is actually accepting connections, not just until the container is running.

**Update `app` service `depends_on`:**
```yaml
app:
  depends_on:
    timescaledb:
      condition: service_healthy
```

This ensures the app (and scraper) don't start until PostgreSQL is fully ready — including after a recovery.

### Layer 2: Automated Hourly Backups

**What:** A sidecar container that runs `pg_dump` every hour, saving compressed SQL dumps to a host directory outside the Docker data volume.

**Backup directory:** `./backups/` (relative to docker-compose.yml). This is a separate host mount — it survives `rm -rf data/timescaledb`.

**Retention:** Keep the last 48 backups (2 days of hourly backups). Older files are automatically deleted.

**Sidecar service in docker-compose.yml:**

```yaml
db-backup:
  image: timescale/timescaledb:2.24.0-pg17
  depends_on:
    timescaledb:
      condition: service_healthy
  environment:
    PGHOST: timescaledb
    PGUSER: fuelsniffer
    PGPASSWORD: ${DB_PASSWORD}
    PGDATABASE: fuelsniffer
  volumes:
    - ./backups:/backups
    - ./scripts/db-backup.sh:/usr/local/bin/db-backup.sh:ro
  entrypoint: ["/bin/bash", "/usr/local/bin/db-backup.sh"]
  restart: unless-stopped
```

**Note:** The sidecar uses `condition: service_healthy`, so it won't attempt a backup until after the DB is fully started (including after any recovery). This prevents backing up a partially-restored database.

**Backup script (`scripts/db-backup.sh`):**

```bash
#!/bin/bash
set -o pipefail  # Ensures pg_dump failures propagate through the gzip pipe

BACKUP_DIR="/backups"
RETENTION_COUNT=48

while true; do
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="${BACKUP_DIR}/fuelsniffer_${TIMESTAMP}.sql.gz"
  TEMP_FILE="${BACKUP_DIR}/.fuelsniffer_${TIMESTAMP}.sql.gz.tmp"

  echo "[backup] Starting backup at $(date)"

  # Dump to temp file first — only promote to real backup if successful
  if pg_dump --clean --if-exists --no-owner | gzip > "${TEMP_FILE}"; then
    mv "${TEMP_FILE}" "${BACKUP_FILE}"
    echo "[backup] OK — $(du -h "${BACKUP_FILE}" | cut -f1) written to ${BACKUP_FILE}"
    ln -sf "$(basename "${BACKUP_FILE}")" "${BACKUP_DIR}/latest.sql.gz"
  else
    echo "[backup] FAILED — pg_dump returned non-zero"
    rm -f "${TEMP_FILE}"
  fi

  # Rotate: keep only the last N backups
  ls -t "${BACKUP_DIR}"/fuelsniffer_*.sql.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | xargs -r rm -f

  echo "[backup] Next backup in 1 hour"
  sleep 3600
done
```

**Key fixes from review:**
- `set -o pipefail` ensures `pg_dump` failures aren't swallowed by the `gzip` pipe
- Writes to a `.tmp` file first — only renamed on success, preventing corrupt backups from being linked as `latest`
- All variable expansions properly quoted

**Backup size estimate:** With ~1,800 stations and ~30,000 price readings, a compressed pg_dump is approximately 2-5 MB. 48 backups = ~100-240 MB total disk usage.

**Behavior during DB downtime:** If the DB is temporarily unavailable (e.g., during a restart), `pg_dump` will fail, the temp file is deleted, and the script sleeps for an hour. The `latest.sql.gz` symlink continues pointing to the last successful backup. This is acceptable — no action needed.

### Layer 3: Auto-Recovery Entrypoint

**What:** A custom entrypoint script that detects WAL corruption and uses the official Docker entrypoint's `/docker-entrypoint-initdb.d/` mechanism to restore from backup. This avoids reimplementing PostgreSQL initialization logic (user switching, `shared_preload_libraries`, etc.).

**Key design decision:** Instead of calling `pg_ctl`, `initdb`, etc. directly (which would fail because the official image runs the entrypoint as root and then switches to `postgres` user internally), we:

1. Detect corruption by checking if PostgreSQL can start
2. If corrupt: wipe `$PGDATA`, copy the backup into `/docker-entrypoint-initdb.d/`
3. Hand off to the **standard** `docker-entrypoint.sh`, which handles `initdb`, user switching, `shared_preload_libraries`, and automatically processes any `.sql.gz` files in `/docker-entrypoint-initdb.d/`

**Script (`scripts/db-entrypoint.sh`):**

```bash
#!/bin/bash
# Custom entrypoint for TimescaleDB with auto-recovery from backup
#
# Strategy: detect corruption, prepare for restore, then delegate to
# the official docker-entrypoint.sh which handles initdb, user switching,
# shared_preload_libraries, and /docker-entrypoint-initdb.d/ processing.

PGDATA="/var/lib/postgresql/data"
BACKUP_DIR="/backups"
LATEST_BACKUP="${BACKUP_DIR}/latest.sql.gz"
INITDB_DIR="/docker-entrypoint-initdb.d"

# Only attempt recovery if a data directory already exists (not first run)
if [ -f "$PGDATA/PG_VERSION" ]; then
  echo "[recovery] Existing data directory found — testing PostgreSQL startup..."

  # Try starting PostgreSQL as the postgres user to test if it works
  if gosu postgres pg_ctl -D "$PGDATA" -l /tmp/pg_startup_test.log start -w -t 10 2>/dev/null; then
    echo "[recovery] PostgreSQL started normally — no recovery needed"
    gosu postgres pg_ctl -D "$PGDATA" stop -m fast 2>/dev/null || true
  else
    echo "[recovery] *** PostgreSQL FAILED to start — likely WAL corruption ***"
    gosu postgres pg_ctl -D "$PGDATA" stop -m fast 2>/dev/null || true

    # Log the startup failure for diagnostics
    if [ -f /tmp/pg_startup_test.log ]; then
      echo "[recovery] Startup log:"
      tail -20 /tmp/pg_startup_test.log
    fi

    if [ -f "$LATEST_BACKUP" ]; then
      BACKUP_REAL=$(readlink -f "$LATEST_BACKUP")
      BACKUP_SIZE=$(du -h "$BACKUP_REAL" | cut -f1)
      echo "[recovery] Found backup: $BACKUP_REAL ($BACKUP_SIZE)"
      echo "[recovery] Wiping corrupt data directory..."
      rm -rf "${PGDATA:?}"/*

      echo "[recovery] Placing backup in /docker-entrypoint-initdb.d/ for restore..."
      mkdir -p "$INITDB_DIR"
      # Copy (not move) the backup so the original stays in /backups
      cp "$BACKUP_REAL" "$INITDB_DIR/restore.sql.gz"

      echo "[recovery] === RECOVERY MODE === Standard entrypoint will init fresh DB and restore from backup"
    else
      echo "[recovery] *** NO BACKUP FOUND — wiping and starting fresh ***"
      rm -rf "${PGDATA:?}"/*
      echo "[recovery] === FRESH START === No backup available, data will be lost"
      echo "[recovery] The scraper will repopulate current prices on next cycle"
    fi
  fi
else
  echo "[recovery] No existing data directory — first run, normal initialization"
fi

# Hand off to the standard TimescaleDB/PostgreSQL entrypoint
# Pass through all arguments from docker-compose command
exec docker-entrypoint.sh "$@"
```

**How the restore works:**
1. Custom entrypoint detects corrupt `$PGDATA`
2. Wipes `$PGDATA/*` so the official entrypoint sees "no existing cluster"
3. Copies `latest.sql.gz` into `/docker-entrypoint-initdb.d/restore.sql.gz`
4. Calls `exec docker-entrypoint.sh "$@"` which:
   - Runs `initdb` as the `postgres` user
   - Configures `shared_preload_libraries = 'timescaledb'`
   - Creates the `fuelsniffer` database
   - Processes `restore.sql.gz` — the `pg_dump --clean --if-exists` output contains all `CREATE EXTENSION`, `CREATE TABLE`, and `INSERT` statements needed

**Docker-compose integration:**

```yaml
timescaledb:
  image: timescale/timescaledb:2.24.0-pg17
  stop_grace_period: 30s
  entrypoint: ["/bin/bash", "/usr/local/bin/db-entrypoint.sh"]
  command: ["postgres"]
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U fuelsniffer -d fuelsniffer"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 60s
  environment:
    POSTGRES_PASSWORD: ${DB_PASSWORD}
    POSTGRES_DB: fuelsniffer
    POSTGRES_USER: fuelsniffer
  ports:
    - "5432:5432"
  volumes:
    - ./data/timescaledb:/var/lib/postgresql/data
    - ./backups:/backups
    - ./scripts/db-entrypoint.sh:/usr/local/bin/db-entrypoint.sh:ro
  restart: unless-stopped
```

**Note:** `start_period` increased to 60s (from 30s) to allow time for a full restore before healthcheck starts failing.

### Recovery Scenarios

| Scenario | What happens | Data loss |
|---|---|---|
| Clean shutdown (`docker compose stop`) | Graceful checkpoint, no corruption | None |
| Unclean shutdown (Mac sleep, kill -9) | `stop_grace_period` gives 30s for checkpoint | None (if checkpoint completes) |
| WAL corruption despite grace period | Entrypoint detects failure, restores from latest hourly backup | Up to 1 hour |
| WAL corruption, no backup exists | Entrypoint wipes and starts fresh, standard entrypoint reinitializes, scraper repopulates current prices | All historical data (same as today, but automatic) |
| Backup file is corrupt | Restore SQL will error, database will be partially restored. Scraper will add current prices on next cycle. | Partial — some historical data may survive |
| First run (no data directory) | Standard entrypoint initializes fresh cluster normally | N/A |

### File Structure

| File | Purpose |
|---|---|
| `docker-compose.yml` | Updated with healthcheck, stop_grace_period, backup sidecar, custom entrypoint, depends_on conditions |
| `scripts/db-entrypoint.sh` | Custom entrypoint — detects corruption, preps restore, delegates to standard entrypoint |
| `scripts/db-backup.sh` | Hourly pg_dump with pipefail, temp file pattern, 48-backup rotation |
| `backups/` | Host-mounted backup directory (gitignored) |
| `.gitignore` | Add `backups/` and `data/` entries |

### Testing the Recovery

To verify the recovery works:

1. Start the stack: `docker compose up -d`
2. Wait for first backup: `ls backups/` (up to 1 hour, or trigger manually)
3. Verify backup content: `gunzip -c backups/latest.sql.gz | head -20` (should show SQL)
4. Simulate corruption: `docker compose stop timescaledb && rm data/timescaledb/pg_wal/*`
5. Restart: `docker compose up -d timescaledb`
6. Check logs: `docker compose logs timescaledb` — should show `[recovery]` messages
7. Verify data restored: `docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT COUNT(*) FROM stations;"`
8. **Verify continuous aggregates:** `docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT COUNT(*) FROM hourly_prices;"` — this must return data, not error

**Note on continuous aggregates:** `pg_dump` from the TimescaleDB image includes TimescaleDB-aware hooks that handle hypertable and continuous aggregate serialization. However, this should be explicitly tested during implementation to confirm that `hourly_prices` and `daily_prices` continuous aggregates are correctly restored. If they aren't, consider using `timescaledb-backup` utilities (`ts-dump`/`ts-restore`) as an alternative.

### Constraints

- Backup uses `pg_dump` (logical backup) not `pg_basebackup` (physical). Restore recreates tables from SQL statements.
- The backup sidecar uses the same TimescaleDB image to ensure `pg_dump` version matches the server and includes TimescaleDB-aware serialization.
- The custom entrypoint delegates all PostgreSQL initialization to the official `docker-entrypoint.sh` — it never calls `initdb`, `pg_ctl`, or `createdb` directly. This avoids user-permission issues (root vs postgres) and ensures `shared_preload_libraries` is correctly configured.
- The `/docker-entrypoint-initdb.d/` mechanism only runs on first initialization (when `$PGDATA` is empty). The custom entrypoint ensures `$PGDATA` is empty before delegation when recovery is needed.
