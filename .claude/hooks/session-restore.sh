#!/bin/bash
# Session Restore Hook for Context Restoration with Memory Injection
# Generated for project: test-workspace-api-vutler
#
# This hook:
# 1. Restores local session context from checkpoint
# 2. Fetches and injects persistent memories via rlm_recall
# 3. Applies configured filters (types, confidence, query)

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECKPOINT_FILE="$PROJECT_DIR/.claude/.session-context"
API_KEY="${SNIPARA_API_KEY:-REDACTED_SNIPARA_KEY_1}"
SETTINGS_URL="https://rlm.dev/api/projects/test-workspace-api-vutler/automation/memory-settings"
MCP_ENDPOINT="https://rlm.dev/api/mcp/test-workspace-api-vutler"

# Initialize context parts
CHECKPOINT_CONTEXT=""
MEMORIES_CONTEXT=""

# 1. Load local checkpoint if exists
if [ -f "$CHECKPOINT_FILE" ]; then
  CHECKPOINT_CONTEXT=$(cat "$CHECKPOINT_FILE")
fi

# 2. Fetch memory injection settings and recall memories
if [ -n "$API_KEY" ] && [ "$API_KEY" != "YOUR_API_KEY" ]; then
  # Get memory settings from API
  SETTINGS=$(curl -s "$SETTINGS_URL" \
    -H "X-API-Key: $API_KEY" \
    --connect-timeout 5 \
    --max-time 10 2>/dev/null) || SETTINGS=""

  # Check if memory injection is enabled
  ENABLED=$(echo "$SETTINGS" | jq -r '.data.enabled // false' 2>/dev/null || echo "false")

  if [ "$ENABLED" = "true" ]; then
    # Extract settings
    TYPES=$(echo "$SETTINGS" | jq -r '.data.types // [] | join(",")' 2>/dev/null || echo "")
    EXCLUDE_SESSION=$(echo "$SETTINGS" | jq -r '.data.excludeSession // false' 2>/dev/null || echo "false")
    MIN_CONFIDENCE=$(echo "$SETTINGS" | jq -r '.data.minConfidence // 0.2' 2>/dev/null || echo "0.2")
    CUSTOM_QUERY=$(echo "$SETTINGS" | jq -r '.data.customQuery // "session context decisions learnings architecture"' 2>/dev/null)

    # Build rlm_recall arguments
    RECALL_ARGS=$(jq -n \
      --arg query "$CUSTOM_QUERY" \
      --arg minRel "$MIN_CONFIDENCE" \
      '{
        query: $query,
        limit: 10,
        min_relevance: ($minRel | tonumber)
      }')

    # Add type filter if specific types are selected (not all)
    if [ -n "$TYPES" ] && [ "$TYPES" != "FACT,DECISION,LEARNING,PREFERENCE,TODO,CONTEXT" ]; then
      # Split first type (rlm_recall only supports single type filter)
      FIRST_TYPE=$(echo "$TYPES" | cut -d',' -f1)
      RECALL_ARGS=$(echo "$RECALL_ARGS" | jq --arg t "$FIRST_TYPE" '. + {type: $t}')
    fi

    # Call rlm_recall via MCP
    MCP_PAYLOAD=$(jq -n --argjson args "$RECALL_ARGS" '{
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "rlm_recall",
        arguments: $args
      }
    }')

    RESPONSE=$(curl -s -X POST "$MCP_ENDPOINT" \
      -H "X-API-Key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$MCP_PAYLOAD" \
      --connect-timeout 5 \
      --max-time 15 2>/dev/null) || RESPONSE=""

    # Extract memories from response
    if [ -n "$RESPONSE" ] && echo "$RESPONSE" | jq -e '.result.content[0].text' > /dev/null 2>&1; then
      MEMORIES_JSON=$(echo "$RESPONSE" | jq -r '.result.content[0].text')
      MEMORY_COUNT=$(echo "$MEMORIES_JSON" | jq '.memories | length' 2>/dev/null || echo "0")

      if [ "$MEMORY_COUNT" -gt 0 ]; then
        # Filter out session checkpoints if configured
        if [ "$EXCLUDE_SESSION" = "true" ]; then
          MEMORIES_JSON=$(echo "$MEMORIES_JSON" | jq '.memories = [.memories[] | select(.category != "session")]')
          MEMORY_COUNT=$(echo "$MEMORIES_JSON" | jq '.memories | length' 2>/dev/null || echo "0")
        fi

        if [ "$MEMORY_COUNT" -gt 0 ]; then
          # Format memories for injection
          MEMORIES_CONTEXT=$(echo "$MEMORIES_JSON" | jq -r '
            "## Persistent Memories\n\nThe following learnings and decisions were preserved from previous sessions:\n\n" +
            (.memories | to_entries | map(
              "### " + ((.value.type // "memory") | ascii_upcase) +
              (if .value.category then " (" + .value.category + ")" else "" end) + "\n" +
              .value.content + "\n" +
              "_Relevance: " + ((.value.relevance * 100 | floor | tostring) + "%") +
              ", Created: " + (.value.created_at | split("T")[0]) + "_\n"
            ) | join("\n"))
          ')
        fi
      fi
    fi
  fi
fi

# 3. Build final context
FINAL_CONTEXT=""

if [ -n "$MEMORIES_CONTEXT" ]; then
  FINAL_CONTEXT="$MEMORIES_CONTEXT"
fi

if [ -n "$CHECKPOINT_CONTEXT" ]; then
  if [ -n "$FINAL_CONTEXT" ]; then
    FINAL_CONTEXT="$FINAL_CONTEXT

---

## Session Checkpoint

$CHECKPOINT_CONTEXT"
  else
    FINAL_CONTEXT="## Session Checkpoint

$CHECKPOINT_CONTEXT"
  fi
fi

# 4. Output JSON for Claude Code
if [ -n "$FINAL_CONTEXT" ]; then
  jq -n --arg content "$FINAL_CONTEXT" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $content
    }
  }'
fi
