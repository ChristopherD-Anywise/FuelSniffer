# Resilient Database Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TimescaleDB database survive unclean Docker shutdowns without losing data — graceful shutdown, hourly backups, and automatic recovery from WAL corruption.

**Architecture:** Three layers. Layer 1: docker-compose `stop_grace_period` + healthcheck prevents corruption. Layer 2: backup sidecar container runs `pg_dump` hourly to a host directory outside the Docker volume. Layer 3: custom entrypoint detects corruption on startup, wipes the corrupt data dir, places the latest backup in `/docker-entrypoint-initdb.d/`, and delegates to the standard PostgreSQL entrypoint for restoration.

**Tech Stack:** Docker Compose, TimescaleDB 2.24.0-pg17, Bash, pg_dump

**Spec:** `docs/superpowers/specs/2026-03-28-resilient-db-recovery-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `scripts/db-entrypoint.sh` | Custom entrypoint — detects WAL corruption, preps restore from backup, delegates to standard entrypoint |
| Create | `scripts/db-backup.sh` | Hourly pg_dump loop with pipefail, temp file pattern, 48-backup rotation |
| Modify | `docker-compose.yml` | Add stop_grace_period, healthcheck, custom entrypoint, backup sidecar, depends_on conditions |
| Modify | `.gitignore` | Add `backups/` entry |
| Modify | `src/lib/db/migrate.ts` | Add header warning: do not run after backup restore |

---

### Task 1: Create the backup script

**Files:**
- Create: `scripts/db-backup.sh`

- [ ] **Step 1: Create the scripts directory and backup script**

```bash
mkdir -p scripts
```

Write `scripts/db-backup.sh`:

```bash
#!/bin/bash
# Hourly pg_dump with rotation. Keeps last 48 backups (2 days).
# Runs as the entrypoint of the db-backup sidecar container.
#
# Expects these env vars (set by docker-compose):
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#
# Writes to /backups (mounted from host ./backups/)

set -o pipefail  # Ensures pg_dump failures propagate through the gzip pipe

BACKUP_DIR="/backups"
RETENTION_COUNT=48

echo "[backup] Backup sidecar started. Writing to ${BACKUP_DIR}, keeping last ${RETENTION_COUNT} backups."

while true; do
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="${BACKUP_DIR}/fuelsniffer_${TIMESTAMP}.sql.gz"
  TEMP_FILE="${BACKUP_DIR}/.fuelsniffer_${TIMESTAMP}.sql.gz.tmp"

  echo "[backup] Starting backup at $(date)"

  # Dump to temp file first — only promote to real backup if successful
  if pg_dump --clean --if-exists --no-owner | gzip > "${TEMP_FILE}"; then
    mv "${TEMP_FILE}" "${BACKUP_FILE}"
    echo "[backup] OK — $(du -h "${BACKUP_FILE}" | cut -f1) written to ${BACKUP_FILE}"
    # Symlink latest for easy restore
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

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/db-backup.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/db-backup.sh
git commit -m "feat: add hourly database backup script with rotation"
```

---

### Task 2: Create the auto-recovery entrypoint

**Files:**
- Create: `scripts/db-entrypoint.sh`

- [ ] **Step 1: Write the entrypoint script**

Write `scripts/db-entrypoint.sh`:

```bash
#!/bin/bash
# Custom entrypoint for TimescaleDB with auto-recovery from backup.
#
# Strategy: detect corruption, prepare for restore, then delegate to
# the official docker-entrypoint.sh which handles initdb, user switching,
# shared_preload_libraries, and /docker-entrypoint-initdb.d/ processing.
#
# This script runs as root (Docker default). It uses gosu to run
# pg_ctl as the postgres user for the startup test. All actual
# initialization is delegated to the standard entrypoint.

PGDATA="/var/lib/postgresql/data"
BACKUP_DIR="/backups"
LATEST_BACKUP="${BACKUP_DIR}/latest.sql.gz"
INITDB_DIR="/docker-entrypoint-initdb.d"

# Only attempt recovery if a data directory already exists (not first run)
if [ -f "$PGDATA/PG_VERSION" ]; then
  echo "[recovery] Existing data directory found — testing PostgreSQL startup..."

  # Try starting PostgreSQL as the postgres user to test if it works.
  # MUST pass shared_preload_libraries=timescaledb — without it, PostgreSQL
  # will fail when it encounters TimescaleDB catalogs, producing a false
  # "corruption" detection.
  if gosu postgres pg_ctl -D "$PGDATA" -o "-c shared_preload_libraries=timescaledb" -l /tmp/pg_startup_test.log start -w -t 10 2>/dev/null; then
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

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/db-entrypoint.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/db-entrypoint.sh
git commit -m "feat: add auto-recovery entrypoint for WAL corruption"
```

---

### Task 3: Update docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Rewrite docker-compose.yml with all three layers**

The complete updated file:

```yaml
services:
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

  app:
    build: .
    environment:
      DATABASE_URL: postgresql://fuelsniffer:${DB_PASSWORD}@timescaledb:5432/fuelsniffer
      QLD_API_TOKEN: ${QLD_API_TOKEN}
      HEALTHCHECKS_PING_URL: ${HEALTHCHECKS_PING_URL}
      TZ: Australia/Brisbane
      NODE_ENV: production
    depends_on:
      timescaledb:
        condition: service_healthy
    ports:
      - "3000:3000"
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate --url http://app:3000
    # For a persistent named tunnel (recommended for production):
    # 1. Create tunnel: cloudflared tunnel create fuelsniffer
    # 2. Set CLOUDFLARE_TUNNEL_TOKEN in .env
    # 3. Replace command with: tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - app
```

Changes from current:
- `timescaledb`: added `stop_grace_period`, `entrypoint`, `command`, `healthcheck`, `backups` volume, entrypoint script mount
- `db-backup`: new sidecar service
- `app`: changed `depends_on` from simple to `condition: service_healthy`

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add graceful shutdown, healthcheck, backup sidecar to docker-compose"
```

---

### Task 4: Update .gitignore and migration runner

**Files:**
- Modify: `.gitignore`
- Modify: `src/lib/db/migrate.ts`

- [ ] **Step 1: Add backups/ to .gitignore**

Add after the existing `data/` entry:

```
# backup volumes
backups/
```

- [ ] **Step 2: Add warning header to migration runner**

Add a comment block at the top of `src/lib/db/migrate.ts` (after the existing JSDoc):

```typescript
/**
 * WARNING: Do NOT run this after restoring from a backup.
 * After a backup restore, the database is fully populated — all tables,
 * hypertables, continuous aggregates, and data exist. Running migrations
 * will fail because hypertables and continuous aggregates cannot be
 * recreated with IF NOT EXISTS.
 *
 * Migrations are ONLY needed for:
 * - Fresh databases with no backup to restore from
 * - Adding new migrations after schema changes
 */
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore src/lib/db/migrate.ts
git commit -m "chore: gitignore backups dir, add migration runner restore warning"
```

---

### Task 5: Test the full recovery flow

**Files:** None (manual testing)

- [ ] **Step 1: Create the backups directory**

```bash
mkdir -p backups
```

- [ ] **Step 2: Restart the stack with the new config**

```bash
docker compose down
docker compose up -d timescaledb
```

Wait for healthcheck to pass:
```bash
docker compose ps
```
Expected: `timescaledb` shows `(healthy)`

- [ ] **Step 3: Verify the backup sidecar starts and creates a backup**

```bash
docker compose up -d db-backup
```

The first backup runs immediately. Wait 30 seconds then check:
```bash
ls -la backups/
```
Expected: A `.sql.gz` file and a `latest.sql.gz` symlink.

- [ ] **Step 4: Verify backup content**

```bash
gunzip -c backups/latest.sql.gz | grep -i "create extension"
```
Expected: Shows `CREATE EXTENSION IF NOT EXISTS timescaledb`

```bash
gunzip -c backups/latest.sql.gz | wc -l
```
Expected: Thousands of lines (not 0 or a small number)

- [ ] **Step 5: Simulate WAL corruption**

```bash
docker compose stop timescaledb
rm data/timescaledb/pg_wal/*
docker compose up -d timescaledb
```

- [ ] **Step 6: Verify recovery from logs**

```bash
docker compose logs timescaledb 2>&1 | grep "\[recovery\]"
```

Expected output should include:
```
[recovery] Existing data directory found — testing PostgreSQL startup...
[recovery] *** PostgreSQL FAILED to start — likely WAL corruption ***
[recovery] Found backup: ...
[recovery] Wiping corrupt data directory...
[recovery] Placing backup in /docker-entrypoint-initdb.d/ for restore...
[recovery] === RECOVERY MODE ===
```

- [ ] **Step 7: Verify TimescaleDB extension is loaded**

```bash
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "\dx"
```
Expected: Shows `timescaledb` in the extension list.

- [ ] **Step 8: Verify data was restored**

```bash
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT COUNT(*) FROM stations;"
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT COUNT(*) FROM price_readings;"
```
Expected: Non-zero counts matching what was in the database before corruption.

- [ ] **Step 9: Verify TimescaleDB objects**

```bash
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT view_name FROM timescaledb_information.continuous_aggregates;"
docker exec fuelsniffer-timescaledb-1 psql -U fuelsniffer -d fuelsniffer -c "SELECT COUNT(*) FROM hourly_prices;"
```

Expected:
- Hypertables: `price_readings`
- Continuous aggregates: `hourly_prices`, `daily_prices`
- hourly_prices count: > 0

**If continuous aggregates are NOT restored correctly:** Fall back to `ts-dump`/`ts-restore` instead of `pg_dump`. Update `db-backup.sh` accordingly.

- [ ] **Step 10: Commit any test-driven fixes**

If any issues were found during testing, fix and commit.

```bash
git add -A
git commit -m "fix: adjustments from recovery flow testing"
```

---

## Estimated Scope

| Task | Steps | What |
|------|-------|------|
| 1: Backup script | 3 | Create `scripts/db-backup.sh` |
| 2: Recovery entrypoint | 3 | Create `scripts/db-entrypoint.sh` |
| 3: Docker compose | 2 | Update `docker-compose.yml` with all layers |
| 4: Gitignore + migration warning | 3 | Housekeeping |
| 5: Test recovery flow | 10 | End-to-end verification |
| **Total** | **21** | |
