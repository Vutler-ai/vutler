#!/bin/bash
# snipara-broadcast.sh — Broadcast message to Snipara Swarm (CLI-first)
# Usage: ./snipara-broadcast.sh "message" [agent_id] [event_type]

set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

MESSAGE="${1:-}"
AGENT="${2:-jarvis}"
EVENT_TYPE="${3:-status}"
SWARM_ID="${SNIPARA_CANONICAL_SWARM_ID:-cmmfe0cq90008o1cohufkls68}"

if [[ -z "$MESSAGE" ]]; then
  echo "Usage: $0 \"message\" [agent_id] [event_type]"
  exit 1
fi

"$(dirname "$0")/snipara" --project vutler rlm_broadcast \
  "swarm_id=$SWARM_ID" \
  "agent_id=$AGENT" \
  "event_type=$EVENT_TYPE" \
  "message=$MESSAGE"
