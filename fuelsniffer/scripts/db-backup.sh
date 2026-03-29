#!/bin/bash
# Hourly pg_dump with rotation. Keeps last 48 backups (2 days).
# Runs as the entrypoint of the db-backup sidecar (postgres:17-alpine image).
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
