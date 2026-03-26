#!/bin/bash
# Commit Memory Hook - Save session context when git commit is detected
# Generated for project: test-workspace-api-vutler
#
# This hook is triggered on PostToolUse for Bash commands.
# It checks if the command was a git commit and saves session context as a memory.

# Quick exit if not a git commit command
if ! echo "${TOOL_INPUT:-}" | grep -qE "git commit"; then
  exit 0
fi

API_KEY="${SNIPARA_API_KEY:-REDACTED_SNIPARA_KEY_1}"
MCP_ENDPOINT="https://api.snipara.com/mcp/test-workspace-api-vutler"

# Exit if no API key
if [ -z "$API_KEY" ] || [ "$API_KEY" = "YOUR_API_KEY" ]; then
  exit 0
fi

# Extract commit message from tool input (best effort)
COMMIT_MSG=$(echo "${TOOL_INPUT:-}" | sed -n 's/.*-m[[:space:]]*["'"'"']\([^"'"'"']*\)["'"'"'].*/\1/p' || echo "")
if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="Session checkpoint on commit"
else
  COMMIT_MSG="Session checkpoint: $COMMIT_MSG"
fi

# Call rlm_remember via MCP
MCP_PAYLOAD=$(jq -n \
  --arg content "$COMMIT_MSG" \
  '{
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "rlm_remember",
      arguments: {
        content: $content,
        type: "CONTEXT",
        category: "session",
        ttl_days: 7
      }
    }
  }')

curl -s -X POST "$MCP_ENDPOINT" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$MCP_PAYLOAD" \
  --connect-timeout 5 \
  --max-time 10 > /dev/null 2>&1

exit 0
