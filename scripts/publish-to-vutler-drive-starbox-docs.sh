#!/usr/bin/env bash
set -euo pipefail

# Publish markdown/docs files into Vutler Drive path used by all users:
#   /data/drive/Workspace/starbox/docs
#
# Hardcoded target by request: every document published with this helper
# lands under starbox/docs.

SSH_KEY="${SSH_KEY:-/Users/lopez/.openclaw/workspace/.secrets/vps-ssh-key.pem}"
VPS_HOST="${VPS_HOST:-ubuntu@83.228.222.180}"
VPS_CONTAINER="${VPS_CONTAINER:-vutler-api}"
VUTLER_DRIVE_DIR="${VUTLER_DRIVE_DIR:-/data/drive/Workspace/starbox/docs}"

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

# Ensure destination folder exists and copy file in one atomic chain.
scp -i "$SSH_KEY" "$SRC_FILE" "$VPS_HOST:$TMP_FILE"
ssh -i "$SSH_KEY" "$VPS_HOST" \
  "docker exec $VPS_CONTAINER sh -lc 'mkdir -p $VUTLER_DRIVE_DIR && chown -R 1000:1000 $(dirname "$VUTLER_DRIVE_DIR") || true' && \
   docker cp $TMP_FILE $VPS_CONTAINER:$VUTLER_DRIVE_DIR/$BASENAME && \
   docker exec $VPS_CONTAINER sh -lc \"chown 1000:1000 '$VUTLER_DRIVE_DIR/$BASENAME'\" && \
   docker exec $VPS_CONTAINER sh -lc \"ls -l '$VUTLER_DRIVE_DIR/$BASENAME'\" && \
   rm -f $TMP_FILE"

echo "[publish-drive] ✅ published $BASENAME to ${VPS_HOST}:${VUTLER_DRIVE_DIR}/${BASENAME}"