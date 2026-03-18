#!/bin/bash
# snipara-recall.sh — Recall memories from Snipara (CLI-first)
# Usage: ./snipara-recall.sh [query] [limit]

set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

QUERY="${1:-}"
LIMIT="${2:-20}"

if [[ -n "$QUERY" ]]; then
  "$(dirname "$0")/snipara" --project vutler rlm_recall "query=$QUERY" "limit=$LIMIT"
else
  "$(dirname "$0")/snipara" --project vutler rlm_recall "limit=$LIMIT"
fi
