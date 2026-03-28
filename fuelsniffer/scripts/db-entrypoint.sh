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
      find "${PGDATA:?}" -mindepth 1 -delete 2>/dev/null || rm -rf "${PGDATA:?}"/* 2>/dev/null

      echo "[recovery] Preparing filtered backup for restore..."
      mkdir -p "$INITDB_DIR"
      # Overwrite the standard TimescaleDB init scripts with no-ops.
      # The backup contains the full extension + catalog state; if these
      # run first they create conflicting internal catalog entries.
      echo "#!/bin/bash" > "$INITDB_DIR/000_install_timescaledb.sh"
      echo "#!/bin/bash" > "$INITDB_DIR/001_timescaledb_tune.sh"
      # Filter out DROP EXTENSION (fails because C library is loaded via
      # shared_preload_libraries and can't be unloaded mid-session).
      # Keep CREATE EXTENSION IF NOT EXISTS for proper installation.
      gunzip -c "$BACKUP_REAL" \
        | grep -v "^DROP EXTENSION" \
        | gzip > "$INITDB_DIR/restore.sql.gz"

      echo "[recovery] === RECOVERY MODE === Standard entrypoint will init fresh DB and restore from backup"
    else
      echo "[recovery] *** NO BACKUP FOUND — wiping and starting fresh ***"
      find "${PGDATA:?}" -mindepth 1 -delete
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
