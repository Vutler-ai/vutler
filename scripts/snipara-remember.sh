#!/bin/bash
# snipara-remember.sh — Persist a memory to Snipara (CLI-first)
# Usage: ./snipara-remember.sh "text" [category] [type]

set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

TEXT="${1:-}"
CATEGORY="${2:-general}"
TYPE="${3:-fact}"

if [[ -z "$TEXT" ]]; then
  echo "Usage: $0 \"memory text\" [category] [type]"
  exit 1
fi

"$(dirname "$0")/snipara" --project vutler rlm_remember \
  "text=$TEXT" \
  "type=$TYPE" \
  "scope=project" \
  "category=$CATEGORY"
