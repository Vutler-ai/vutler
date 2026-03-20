#!/usr/bin/env bash
set -euo pipefail

# Generic helper for any agent to open remediation tasks in Snipara when needed.
# Usage:
#   ./scripts/snipara-create-task-if-needed.sh "Title" "Description" [owner]

TITLE="${1:-}"
DESC="${2:-}"
OWNER="${3:-luna-local}"
SWARM_ID="${SNIPARA_CANONICAL_SWARM_ID:-cmmfe0cq90008o1cohufkls68}"

if [[ -z "$TITLE" || -z "$DESC" ]]; then
  echo "Usage: $0 \"Title\" \"Description\" [owner]" >&2
  exit 1
fi

/Users/lopez/.openclaw/workspace/scripts/snipara --project vutler rlm_task_create \
  "swarm_id=${SWARM_ID}" \
  "agent_id=rex-local" \
  "title=${TITLE}" \
  "description=${DESC}" \
  "priority=1" \
  "for_agent_id=${OWNER}"
