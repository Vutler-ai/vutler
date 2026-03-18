#!/bin/bash
# snipara-task.sh — Create a task in Snipara Swarm (CLI-first)
# Usage: ./snipara-task.sh "title" "description" [assigned_to] [priority]

set -euo pipefail

# Load local workspace env first (CLI keys)
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

TITLE="${1:-}"
DESC="${2:-}"
ASSIGNED="${3:-}"
PRIORITY="${4:-1}"
SWARM_ID="${SNIPARA_CANONICAL_SWARM_ID:-cmmfe0cq90008o1cohufkls68}"
AGENT_ID="${SNIPARA_AGENT_ID:-jarvis}"

if [[ -z "$TITLE" ]]; then
  echo "Usage: $0 \"title\" \"description\" [assigned_to] [priority]"
  exit 1
fi

CMD=("$(dirname "$0")/snipara" --project vutler rlm_task_create \
  "swarm_id=$SWARM_ID" \
  "agent_id=$AGENT_ID" \
  "title=$TITLE" \
  "description=$DESC" \
  "priority=$PRIORITY")

if [[ -n "$ASSIGNED" ]]; then
  CMD+=("for_agent_id=$ASSIGNED")
fi

"${CMD[@]}"
