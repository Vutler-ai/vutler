#!/bin/bash
# Vutler Database Backup Script
# Backups tenant_vutler schema from Vaultbrix PostgreSQL

set -e

BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/vutler-backup-${DATE}.sql.gz"
KEEP_BACKUPS=7

# Database connection (from .env)
DB_HOST="REDACTED_DB_HOST"
DB_PORT="6543"
DB_NAME="postgres"
DB_USER="REDACTED_DB_USER"
DB_PASSWORD="REDACTED_DB_PASSWORD"
DB_SCHEMA="tenant_vutler"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

echo "[Backup] Starting database backup: ${DATE}"

# Dump database with pg_dump (schema only)
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h ${DB_HOST} \
  -p ${DB_PORT} \
  -U ${DB_USER} \
  -d ${DB_NAME} \
  -n ${DB_SCHEMA} \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip > ${BACKUP_FILE}

if [ -f "${BACKUP_FILE}" ]; then
  SIZE=$(du -h ${BACKUP_FILE} | cut -f1)
  echo "[Backup] Backup completed: ${BACKUP_FILE} (${SIZE})"
else
  echo "[Backup] ERROR: Backup file not created!"
  exit 1
fi

# Rotate old backups (keep last 7)
echo "[Backup] Cleaning old backups (keeping last ${KEEP_BACKUPS})..."
cd ${BACKUP_DIR}
ls -t vutler-backup-*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
echo "[Backup] Cleanup completed"

# List current backups
echo "[Backup] Current backups:"
ls -lh vutler-backup-*.sql.gz 2>/dev/null || echo "No backups found"

echo "[Backup] Done!"
