#!/usr/bin/env bash
set -euo pipefail

TARGET_ROOT="${DOCKER_DATA_ROOT_TARGET:-/mnt/data/docker}"
DAEMON_FILE="${DOCKER_DAEMON_FILE:-/etc/docker/daemon.json}"
APPLY=0
CLEANUP_OLD_ROOT=0

usage() {
  cat <<'EOF'
Usage: ./scripts/migrate-docker-data-root.sh [options]

Prepare or apply a Docker data-root migration from the current root
(usually /var/lib/docker) to a data volume such as /mnt/data/docker.

Options:
  --apply                    Perform the migration. Without this flag, prints the plan only.
  --target-root <path>       Target Docker data-root. Default: /mnt/data/docker
  --daemon-file <path>       Docker daemon.json path. Default: /etc/docker/daemon.json
  --cleanup-old-root         Remove the previous Docker root after a successful cutover.
  -h, --help                 Show this help.
EOF
}

log() {
  printf '%s\n' "$*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --target-root)
      [ $# -ge 2 ] || { echo "--target-root requires a value" >&2; exit 1; }
      TARGET_ROOT="$2"
      shift 2
      ;;
    --daemon-file)
      [ $# -ge 2 ] || { echo "--daemon-file requires a value" >&2; exit 1; }
      DAEMON_FILE="$2"
      shift 2
      ;;
    --cleanup-old-root)
      CLEANUP_OLD_ROOT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

require_cmd docker
require_cmd python3
require_cmd rsync
require_cmd sudo
require_cmd systemctl

docker_root_dir() {
  docker info --format '{{ .DockerRootDir }}' 2>/dev/null || printf '%s\n' '/var/lib/docker'
}

service_exists() {
  systemctl list-unit-files "$1" >/dev/null 2>&1
}

stop_service_if_present() {
  if service_exists "$1"; then
    sudo systemctl stop "$1"
  fi
}

start_service_if_present() {
  if service_exists "$1"; then
    sudo systemctl start "$1"
  fi
}

wait_for_docker() {
  local expected_root="$1"
  local current=""

  for _ in $(seq 1 30); do
    current="$(docker info --format '{{ .DockerRootDir }}' 2>/dev/null || true)"
    if [ "$current" = "$expected_root" ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

write_daemon_json() {
  local daemon_file="$1"
  local target_root="$2"

  sudo mkdir -p "$(dirname "$daemon_file")"
  sudo python3 - "$daemon_file" "$target_root" <<'PY'
import json
import os
import sys

daemon_file, target_root = sys.argv[1:3]
data = {}

if os.path.exists(daemon_file):
    with open(daemon_file, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
        if not isinstance(data, dict):
            raise SystemExit(f"{daemon_file} must contain a JSON object")

data["data-root"] = target_root

tmp_file = f"{daemon_file}.tmp"
with open(tmp_file, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, indent=2, sort_keys=True)
    fh.write("\n")
PY
  sudo mv "${daemon_file}.tmp" "$daemon_file"
}

CURRENT_ROOT="$(docker_root_dir)"
CURRENT_SIZE="$(sudo du -sh "$CURRENT_ROOT" 2>/dev/null | awk '{print $1}')"
TARGET_PARENT="$(dirname "$TARGET_ROOT")"
TARGET_AVAIL="$(df -h "$TARGET_PARENT" 2>/dev/null | awk 'NR==2 {print $4}')"

printf '[plan]\n'
printf 'current_root=%s\n' "$CURRENT_ROOT"
printf 'current_size=%s\n' "${CURRENT_SIZE:-unknown}"
printf 'target_root=%s\n' "$TARGET_ROOT"
printf 'target_parent_available=%s\n' "${TARGET_AVAIL:-unknown}"
printf 'daemon_file=%s\n' "$DAEMON_FILE"
printf 'apply=%s\n' "$APPLY"
printf 'cleanup_old_root=%s\n' "$CLEANUP_OLD_ROOT"

if [ "$CURRENT_ROOT" = "$TARGET_ROOT" ]; then
  log "Docker already uses $TARGET_ROOT"
  exit 0
fi

if [ "$APPLY" != "1" ]; then
  exit 0
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_NOTE="/mnt/data/docker-data-root-migration-${TIMESTAMP}.env"
DAEMON_BACKUP="${DAEMON_FILE}.bak.${TIMESTAMP}"

sudo install -d -m 0711 "$TARGET_PARENT"
sudo install -d -m 0711 "$TARGET_ROOT"

if [ -f "$DAEMON_FILE" ]; then
  sudo cp -a "$DAEMON_FILE" "$DAEMON_BACKUP"
fi

log "Stopping Docker services"
stop_service_if_present docker
stop_service_if_present docker.socket
stop_service_if_present containerd

log "Syncing $CURRENT_ROOT -> $TARGET_ROOT"
sudo rsync -aHAXx --delete "$CURRENT_ROOT"/ "$TARGET_ROOT"/

log "Writing $DAEMON_FILE"
write_daemon_json "$DAEMON_FILE" "$TARGET_ROOT"

log "Starting Docker services"
start_service_if_present containerd
start_service_if_present docker

if ! wait_for_docker "$TARGET_ROOT"; then
  echo "Docker did not come back with data-root=$TARGET_ROOT" >&2
  exit 1
fi

sudo tee "$BACKUP_NOTE" >/dev/null <<EOF
MIGRATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PREVIOUS_DOCKER_ROOT=$CURRENT_ROOT
TARGET_DOCKER_ROOT=$TARGET_ROOT
DAEMON_FILE=$DAEMON_FILE
DAEMON_BACKUP=$DAEMON_BACKUP
EOF

log "Docker data-root is now $(docker info --format '{{ .DockerRootDir }}')"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
log "Migration note: $BACKUP_NOTE"

if [ "$CLEANUP_OLD_ROOT" = "1" ]; then
  log "Removing previous Docker root $CURRENT_ROOT"
  sudo rm -rf "$CURRENT_ROOT"
fi
