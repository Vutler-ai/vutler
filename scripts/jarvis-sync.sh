#!/bin/bash
# Jarvis Cloud ↔ Mac Memory Sync via Snipara
# Writes key MEMORY.md sections to Snipara, reads back from Snipara for cloud Jarvis
#
# Usage: ./jarvis-sync.sh [push|pull|test]

SNIPARA_KEY="REDACTED_SNIPARA_KEY_2"
SNIPARA_MCP="https://api.snipara.com/mcp"
WORKSPACE="/Users/lopez/.openclaw/workspace"

call_snipara() {
  local tool="$1"
  local args="$2"
  curl -s -X POST "$SNIPARA_MCP" \
    -H "X-API-Key: $SNIPARA_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}"
}

push_memory() {
  echo "📤 Pushing MEMORY.md to Snipara..."
  
  # Read key sections from MEMORY.md
  local memory_content
  memory_content=$(cat "$WORKSPACE/MEMORY.md" | head -200)
  
  # Escape for JSON
  local escaped
  escaped=$(echo "$memory_content" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
  
  # Store as a document
  call_snipara "rlm_remember" "{\"content\":$escaped,\"type\":\"fact\",\"tags\":[\"jarvis-memory\",\"sync\",\"mac\"]}"
  echo ""
  echo "✅ Memory pushed"
}

pull_memory() {
  echo "📥 Pulling shared memories from Snipara..."
  call_snipara "rlm_recall" "{\"query\":\"jarvis memory team decisions\",\"limit\":10}"
  echo ""
}

test_sync() {
  echo "🧪 Testing Snipara connection..."
  call_snipara "rlm_remember" "{\"content\":\"Jarvis sync test $(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"type\":\"fact\",\"tags\":[\"sync-test\"]}"
  echo ""
  echo "📥 Recalling..."
  sleep 2
  call_snipara "rlm_recall" "{\"query\":\"jarvis sync test\",\"limit\":3}"
  echo ""
}

case "${1:-test}" in
  push) push_memory ;;
  pull) pull_memory ;;
  test) test_sync ;;
  *) echo "Usage: $0 [push|pull|test]" ;;
esac
