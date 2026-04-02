#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
MODE="${BACKUP_DB_MODE:-schema}"
DB_HOST="${BACKUP_DB_HOST:-}"
DB_PORT="${BACKUP_DB_PORT:-6543}"
DB_NAME="${BACKUP_DB_NAME:-postgres}"
DB_USER="${BACKUP_DB_USER:-}"
DB_PASSWORD="${BACKUP_DB_PASSWORD:-}"
DB_SCHEMA="${BACKUP_DB_SCHEMA:-tenant_vutler}"
VERIFY_BACKUP=1
DATE_UTC="$(date -u +%Y%m%d-%H%M%S)"
CREATED_AT_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

usage() {
  cat <<'EOF'
Usage: ./scripts/backup-db.sh [options]

Options:
  --mode <schema|full|data>  Backup mode. Default: schema
  --keep <count>             Number of backups to retain per mode. Default: 7
  --output-dir <path>        Directory for backup artifacts. Default: /home/ubuntu/backups
  --schema <name>            PostgreSQL schema to dump. Default: tenant_vutler
  --no-verify                Skip integrity verification after dump
  -h, --help                 Show this help

Environment:
  BACKUP_DB_HOST             Required
  BACKUP_DB_PORT             Default: 6543
  BACKUP_DB_NAME             Default: postgres
  BACKUP_DB_USER             Required
  BACKUP_DB_PASSWORD         Required
  BACKUP_DB_SCHEMA           Default: tenant_vutler
EOF
}

log() {
  printf '[Backup] %s\n' "$*"
}

fail() {
  printf '[Backup] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)
      [ $# -ge 2 ] || fail "--mode requires a value"
      MODE="$2"
      shift 2
      ;;
    --keep)
      [ $# -ge 2 ] || fail "--keep requires a value"
      KEEP_BACKUPS="$2"
      shift 2
      ;;
    --output-dir)
      [ $# -ge 2 ] || fail "--output-dir requires a value"
      BACKUP_DIR="$2"
      shift 2
      ;;
    --schema)
      [ $# -ge 2 ] || fail "--schema requires a value"
      DB_SCHEMA="$2"
      shift 2
      ;;
    --no-verify)
      VERIFY_BACKUP=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

case "$MODE" in
  schema|full|data)
    ;;
  *)
    fail "Unsupported mode: $MODE"
    ;;
esac

case "$KEEP_BACKUPS" in
  ''|*[!0-9]*)
    fail "--keep must be a non-negative integer"
    ;;
esac

require_cmd pg_dump
require_cmd gzip
require_cmd sha256sum
if [ "$MODE" != "schema" ]; then
  require_cmd pg_restore
fi

[ -n "$DB_HOST" ] || fail "BACKUP_DB_HOST is not set"
[ -n "$DB_USER" ] || fail "BACKUP_DB_USER is not set"
[ -n "$DB_PASSWORD" ] || fail "BACKUP_DB_PASSWORD is not set"

mkdir -p "$BACKUP_DIR"

PREFIX="vutler-${MODE}-backup-${DATE_UTC}"
case "$MODE" in
  schema)
    BACKUP_FILE="${BACKUP_DIR}/${PREFIX}.sql.gz"
    ;;
  full|data)
    BACKUP_FILE="${BACKUP_DIR}/${PREFIX}.dump"
    ;;
esac

META_FILE="${BACKUP_FILE}.meta"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

log "Starting ${MODE} backup for schema ${DB_SCHEMA}"
STARTED_AT="$(date +%s)"

PG_DUMP_ARGS=(
  -h "$DB_HOST"
  -p "$DB_PORT"
  -U "$DB_USER"
  -d "$DB_NAME"
  -n "$DB_SCHEMA"
  --no-owner
  --no-privileges
)

case "$MODE" in
  schema)
    PGPASSWORD="$DB_PASSWORD" pg_dump \
      "${PG_DUMP_ARGS[@]}" \
      --schema-only \
      --format=plain \
      | gzip -c > "$BACKUP_FILE"
    ;;
  full)
    PGPASSWORD="$DB_PASSWORD" pg_dump \
      "${PG_DUMP_ARGS[@]}" \
      --format=custom \
      --file "$BACKUP_FILE"
    ;;
  data)
    PGPASSWORD="$DB_PASSWORD" pg_dump \
      "${PG_DUMP_ARGS[@]}" \
      --data-only \
      --format=custom \
      --file "$BACKUP_FILE"
    ;;
esac

[ -f "$BACKUP_FILE" ] || fail "Backup file was not created"

if [ "$VERIFY_BACKUP" = "1" ]; then
  log "Verifying backup integrity"
  if [ "$MODE" = "schema" ]; then
    gzip -t "$BACKUP_FILE"
  else
    pg_restore --list "$BACKUP_FILE" >/dev/null
  fi
fi

sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"

SIZE_BYTES="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
SIZE_HUMAN="$(du -h "$BACKUP_FILE" | cut -f1)"
DURATION_SECONDS="$(( $(date +%s) - STARTED_AT ))"

cat > "$META_FILE" <<EOF
created_at_utc=$CREATED_AT_UTC
mode=$MODE
schema=$DB_SCHEMA
file=$BACKUP_FILE
size_bytes=$SIZE_BYTES
size_human=$SIZE_HUMAN
duration_seconds=$DURATION_SECONDS
verified=$VERIFY_BACKUP
db_host=$DB_HOST
db_port=$DB_PORT
db_name=$DB_NAME
db_user=$DB_USER
EOF

log "Backup completed: $BACKUP_FILE (${SIZE_HUMAN})"
log "Checksum: $CHECKSUM_FILE"
log "Metadata: $META_FILE"

shopt -s nullglob
case "$MODE" in
  schema)
    backups=( "$BACKUP_DIR"/vutler-schema-backup-*.sql.gz )
    ;;
  full)
    backups=( "$BACKUP_DIR"/vutler-full-backup-*.dump )
    ;;
  data)
    backups=( "$BACKUP_DIR"/vutler-data-backup-*.dump )
    ;;
esac

if [ "${#backups[@]}" -gt "$KEEP_BACKUPS" ]; then
  mapfile -t old_backups < <(ls -1t "${backups[@]}" | tail -n +$((KEEP_BACKUPS + 1)))
  for backup in "${old_backups[@]}"; do
    rm -f "$backup" "$backup.meta" "$backup.sha256"
  done
  log "Rotation completed: kept last ${KEEP_BACKUPS} ${MODE} backup(s)"
else
  log "Rotation skipped: ${#backups[@]} ${MODE} backup(s) present"
fi

case "$MODE" in
  schema)
    log "Restore hint: gunzip -c '$BACKUP_FILE' | psql \"\$DATABASE_URL\""
    ;;
  full|data)
    log "Restore hint: pg_restore --clean --if-exists -d \"\$DATABASE_URL\" '$BACKUP_FILE'"
    ;;
esac
