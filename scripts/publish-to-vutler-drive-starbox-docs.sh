#!/usr/bin/env bash
set -euo pipefail

# Publish markdown/docs files into Vutler Drive path used by all users:
#   /data/drive/Workspace/starbox/documentation
#
# Hardcoded target by request: every document published with this helper
# lands under starbox/documentation.

SSH_KEY="${SSH_KEY:-/Users/lopez/.openclaw/workspace/.secrets/vps-ssh-key.pem}"
VPS_HOST="${VPS_HOST:-ubuntu@83.228.222.180}"
VPS_CONTAINER="${VPS_CONTAINER:-vutler-api}"
VUTLER_DRIVE_DIR="${VUTLER_DRIVE_DIR:-/data/drive/Workspace/starbox/documentation}"

ALIAS_DIRS=(
  "/data/drive/Workspace/starbox/documentation"
  "/data/drive/Workspace/starbox/docs"
  "/data/drive/Workspace/starbox/documenation"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") <source-file>

Copies the given local file into:
  ${VUTLER_DRIVE_DIR}

Examples:
  $(basename "$0") reports/backlog-complet-2026-03-18.md
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

SRC_FILE="$1"
if [[ ! -f "$SRC_FILE" ]]; then
  echo "[publish-drive] source file not found: $SRC_FILE" >&2
  exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "[publish-drive] SSH key not found: $SSH_KEY" >&2
  exit 1
fi

BASENAME="$(basename "$SRC_FILE")"
TMP_FILE="/tmp/$BASENAME"

# Copy locally to VPS temp.
scp -i "$SSH_KEY" "$SRC_FILE" "$VPS_HOST:$TMP_FILE"

for DIR in "${ALIAS_DIRS[@]}"; do
  ssh -i "$SSH_KEY" "$VPS_HOST" "docker exec $VPS_CONTAINER sh -lc 'mkdir -p $DIR && chown -R 1000:1000 /data/drive/Workspace/starbox || true'"
  ssh -i "$SSH_KEY" "$VPS_HOST" "docker cp $TMP_FILE $VPS_CONTAINER:$DIR/$BASENAME"
  ssh -i "$SSH_KEY" "$VPS_HOST" "docker exec $VPS_CONTAINER sh -lc \"chown 1000:1000 '$DIR/$BASENAME'\""
done

for DIR in "${ALIAS_DIRS[@]}"; do
  ssh -i "$SSH_KEY" "$VPS_HOST" "docker exec $VPS_CONTAINER sh -lc \"ls -l '$DIR/$BASENAME'\""
done

ssh -i "$SSH_KEY" "$VPS_HOST" "rm -f $TMP_FILE"

echo "[publish-drive] ✅ published $BASENAME to ${VPS_HOST} in:"
for DIR in "${ALIAS_DIRS[@]}"; do
  echo "  - $DIR"
done
