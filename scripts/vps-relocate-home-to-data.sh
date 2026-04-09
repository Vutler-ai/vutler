#!/usr/bin/env bash
set -euo pipefail

DATA_ROOT="${VUTLER_HOME_DATA_ROOT:-/mnt/data/home-ubuntu}"
ARCHIVE_ROOT="${VUTLER_HOME_ARCHIVE_ROOT:-/mnt/data/home-ubuntu-archives}"
APPLY=0

usage() {
  cat <<'EOF'
Usage: ./scripts/vps-relocate-home-to-data.sh [options]

Moves selected heavy paths from /home/ubuntu onto /mnt/data and leaves symlinks
behind so existing operational paths keep working.

Options:
  --apply                Perform the relocation. Without this flag, prints the plan only.
  --data-root <path>     Target root on the data volume. Default: /mnt/data/home-ubuntu
  --archive-root <path>  Archive root for stale backups. Default: /mnt/data/home-ubuntu-archives
  -h, --help             Show this help.
EOF
}

log() {
  printf '%s\n' "$*"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --data-root)
      [ $# -ge 2 ] || { echo "--data-root requires a value" >&2; exit 1; }
      DATA_ROOT="$2"
      shift 2
      ;;
    --archive-root)
      [ $# -ge 2 ] || { echo "--archive-root requires a value" >&2; exit 1; }
      ARCHIVE_ROOT="$2"
      shift 2
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

TARGETS=(
  "/home/ubuntu/vutler:vutler"
  "/home/ubuntu/vutler-deploy:vutler-deploy"
  "/home/ubuntu/vutler-frontend:vutler-frontend"
  "/home/ubuntu/vutler-opensource:vutler-opensource"
  "/home/ubuntu/rlm-venv:rlm-venv"
  "/home/ubuntu/.npm:.npm"
  "/home/ubuntu/.cache:.cache"
  "/home/ubuntu/backups:backups"
  "/home/ubuntu/vutler-backups:vutler-backups"
)

ARCHIVE_TARGETS=(
  "/home/ubuntu/vutler-frontend.bak.1772984686"
)

print_plan() {
  printf '[plan]\n'
  for entry in "${TARGETS[@]}"; do
    local_src="${entry%%:*}"
    local_rel="${entry#*:}"
    printf 'link %s -> %s/%s\n' "$local_src" "$DATA_ROOT" "$local_rel"
  done
  for archive_src in "${ARCHIVE_TARGETS[@]}"; do
    printf 'archive %s -> %s/<name>-<timestamp>\n' "$archive_src" "$ARCHIVE_ROOT"
  done
}

cleanup_orphan_deploys() {
  mapfile -t pids < <(ps -eo pid=,etimes=,args= | awk 'index($0, "bash -c set -e rm -rf /tmp/vutler-deploy-") { if ($2 > 3600) print $1 }')
  if [ ${#pids[@]} -gt 0 ]; then
    sudo kill "${pids[@]}" 2>/dev/null || true
    log "Killed stale deploy shells: ${pids[*]}"
  fi
}

move_with_symlink() {
  local src="$1"
  local rel="$2"
  local ts="$3"
  local dest="$DATA_ROOT/$rel"
  local tmp_dest="${dest}.migrating-${ts}"
  local backup="${src}.rootfs-old-${ts}"
  local partial_archive="${ARCHIVE_ROOT}/partial-${rel//\//-}-${ts}"

  if [ -L "$src" ]; then
    log "SKIP symlink $src -> $(readlink "$src")"
    return 0
  fi
  if [ ! -e "$src" ]; then
    log "SKIP missing $src"
    return 0
  fi

  sudo install -d -m 0775 -o ubuntu -g ubuntu "$DATA_ROOT" "$ARCHIVE_ROOT" "$(dirname "$dest")"
  sudo rm -rf "$tmp_dest"
  sudo rsync -a "$src"/ "$tmp_dest"/
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    sudo mv "$dest" "$partial_archive"
    log "ARCHIVED partial target $dest -> $partial_archive"
  fi
  sudo mv "$src" "$backup"
  sudo mv "$tmp_dest" "$dest"
  sudo ln -s "$dest" "$src"
  sudo chown -h ubuntu:ubuntu "$src" 2>/dev/null || true
  sudo rm -rf "$backup"
  log "MOVED $src -> $dest"
}

archive_path() {
  local src="$1"
  local ts="$2"
  local name
  name="$(basename "$src")"

  if [ -e "$src" ] && [ ! -L "$src" ]; then
    sudo install -d -m 0775 -o ubuntu -g ubuntu "$ARCHIVE_ROOT"
    sudo mv "$src" "$ARCHIVE_ROOT/${name}-${ts}"
    log "ARCHIVED $src -> $ARCHIVE_ROOT/${name}-${ts}"
  fi
}

print_plan
if [ "$APPLY" != "1" ]; then
  exit 0
fi

TS="$(date +%Y%m%d-%H%M%S)"

cleanup_orphan_deploys

for entry in "${TARGETS[@]}"; do
  src="${entry%%:*}"
  rel="${entry#*:}"
  move_with_symlink "$src" "$rel" "$TS"
done

for src in "${ARCHIVE_TARGETS[@]}"; do
  archive_path "$src" "$TS"
done

printf '%s\n' '---'
df -h / /mnt/data
printf '%s\n' '---'
ls -ld /home/ubuntu/vutler /home/ubuntu/vutler-deploy /home/ubuntu/vutler-frontend /home/ubuntu/vutler-opensource /home/ubuntu/rlm-venv /home/ubuntu/.npm /home/ubuntu/.cache /home/ubuntu/backups /home/ubuntu/vutler-backups
