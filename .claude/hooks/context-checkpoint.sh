#!/bin/bash
# Pre-Compaction Hook for Context Preservation
# Generated for project: test-workspace-api-vutler
#
# This hook saves the session context (passed via stdin) before compaction:
# 1. Saves locally to .claude/.session-context
# 2. Syncs to Snipara cloud for cross-session persistence (autoInjectContext enabled)

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECKPOINT_FILE="$PROJECT_DIR/.claude/.session-context"
API_KEY="${SNIPARA_API_KEY:-REDACTED_SNIPARA_KEY_1}"
INJECT_ENDPOINT="https://rlm.dev/api/projects/test-workspace-api-vutler/automation/inject"

# Read context from stdin (Claude passes session summary via stdin)
CONTEXT=$(cat)

if [ -n "$CONTEXT" ]; then
  # Ensure directory exists
  mkdir -p "$(dirname "$CHECKPOINT_FILE")"
  # Save context to local checkpoint file
  echo "$CONTEXT" > "$CHECKPOINT_FILE"
  echo "PreCompact: Local checkpoint saved ($(echo "$CONTEXT" | wc -c | tr -d ' ') bytes)"

  # Sync to Snipara cloud (non-blocking, ignore errors)
  if [ -n "$API_KEY" ] && [ "$API_KEY" != "YOUR_API_KEY" ]; then
    # Create JSON payload with escaped context
    PAYLOAD=$(jq -n --arg ctx "$CONTEXT" '{context: $ctx, source: "hook", append: false}')

    curl -s -X POST "$INJECT_ENDPOINT" \
      -H "X-API-Key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" > /dev/null 2>&1 && \
      echo "PreCompact: Synced to Snipara cloud" || \
      echo "PreCompact: Cloud sync skipped (API unavailable)"
  fi
else
  echo "PreCompact: No context provided"
fi
