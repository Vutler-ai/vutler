#!/bin/bash
# snipara-triage-batch.sh — deterministic batch triage (Vutler project only)
# Usage: ./scripts/snipara-triage-batch.sh [batch_size]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BATCH_SIZE="${1:-5}"
SWARM_ID="${SNIPARA_CANONICAL_SWARM_ID:-cmmfe0cq90008o1cohufkls68}"

"$SCRIPT_DIR/snipara" --project vutler rlm_task_list "swarm_id=$SWARM_ID" "status=pending" "limit=$BATCH_SIZE"
