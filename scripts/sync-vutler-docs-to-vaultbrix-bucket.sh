#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${WORKSPACE_ROOT:-/Users/lopez/.openclaw/workspace}"
REPO_DIR="${REPO_DIR:-$WORKSPACE_ROOT/projects/vutler}"
MCP_ENDPOINT="${MCP_ENDPOINT:-https://api.vaultbrix.com/mcp/vutler}"
BUCKET_NAME="${BUCKET_NAME:-starbox}"
DEST_PREFIX="${DEST_PREFIX:-repo-docs}"
MAX_FILES="${MAX_FILES:-10000}"

# API key: env first, fallback to .secrets markdown
VBX_MCP_KEY="${VBX_MCP_KEY:-}"
if [[ -z "$VBX_MCP_KEY" && -f "$WORKSPACE_ROOT/.secrets/vaultbrix-vutler.md" ]]; then
  VBX_MCP_KEY=$(grep -Eo 'vbx_live_[A-Za-z0-9_]+' "$WORKSPACE_ROOT/.secrets/vaultbrix-vutler.md" | head -n 1 || true)
fi

if [[ -z "$VBX_MCP_KEY" ]]; then
  echo "[sync] missing VBX_MCP_KEY"
  exit 1
fi

if [[ ! -d "$REPO_DIR" ]]; then
  echo "[sync] repo not found: $REPO_DIR"
  exit 1
fi

call_tool() {
  local tool="$1"
  local payload="$2"
  /usr/bin/curl -sS -X POST "$MCP_ENDPOINT/tools/$tool" \
    -H "X-API-Key: $VBX_MCP_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# Resolve bucket id by name
BUCKET_JSON=$(call_tool "list_buckets" '{}')
BUCKET_ID=$(python3 - <<'PY' "$BUCKET_JSON" "$BUCKET_NAME"
import json,sys
obj=json.loads(sys.argv[1])
name=sys.argv[2]
for b in obj.get('result',{}).get('buckets',[]):
    if b.get('name')==name:
        print(b.get('id',''))
        break
PY
)

if [[ -z "$BUCKET_ID" ]]; then
  echo "[sync] bucket '$BUCKET_NAME' not found. Trying create_bucket..."
  CREATE_JSON=$(call_tool "create_bucket" "{\"name\":\"$BUCKET_NAME\",\"public\":false}")
  BUCKET_ID=$(python3 - <<'PY' "$CREATE_JSON"
import json,sys
obj=json.loads(sys.argv[1])
print(obj.get('result',{}).get('id',''))
PY
)
fi

if [[ -z "$BUCKET_ID" ]]; then
  echo "[sync] could not resolve/create bucket '$BUCKET_NAME'"
  exit 1
fi

echo "[sync] bucket id: $BUCKET_ID"

# Collect documentation files (repo docs + reports + root markdown docs)
FILES_TMP=$(mktemp)
{
  find "$REPO_DIR/docs" -type f \( -name '*.md' -o -name '*.mdx' -o -name '*.txt' \) 2>/dev/null || true
  find "$REPO_DIR/reports" -type f \( -name '*.md' -o -name '*.txt' \) 2>/dev/null || true
  find "$REPO_DIR" -maxdepth 1 -type f -name '*.md' 2>/dev/null || true
} | sort -u | head -n "$MAX_FILES" > "$FILES_TMP"

TOTAL=$(wc -l < "$FILES_TMP" | tr -d ' ')
if [[ "$TOTAL" -eq 0 ]]; then
  echo "[sync] no documentation files found"
  rm -f "$FILES_TMP"
  exit 0
fi

OK=0
FAIL=0
while IFS= read -r f; do
  rel="${f#$REPO_DIR/}"
  [[ "$rel" == "$f" ]] && rel="$(basename "$f")"
  target="$DEST_PREFIX/$rel"
  data=$(base64 < "$f" | tr -d '\n')
  # best-effort content type
  ctype="text/markdown"
  [[ "$f" == *.txt ]] && ctype="text/plain"

  payload=$(python3 - <<'PY' "$BUCKET_ID" "$target" "$data" "$ctype"
import json,sys
print(json.dumps({
  "bucket": sys.argv[1],
  "path": sys.argv[2],
  "data": sys.argv[3],
  "contentType": sys.argv[4],
}))
PY
)

  resp=''
  tries=0
  while :; do
    tries=$((tries+1))
    resp=$(call_tool "upload_file" "$payload" || true)
    if echo "$resp" | grep -q '"success":true'; then
      OK=$((OK+1))
      break
    fi

    if echo "$resp" | grep -q 'Too many requests'; then
      retry_after=$(python3 - <<'PY' "$resp"
import json,sys
try:
  print(int(json.loads(sys.argv[1]).get('retry_after', 2)))
except Exception:
  print(2)
PY
)
      if [[ "$tries" -lt 5 ]]; then
        sleep "$retry_after"
        continue
      fi
    fi

    FAIL=$((FAIL+1))
    echo "[sync][fail] $rel -> $resp"
    break
  done
  sleep 0.12
done < "$FILES_TMP"

rm -f "$FILES_TMP"

echo "[sync] done. total=$TOTAL ok=$OK fail=$FAIL bucket=$BUCKET_NAME($BUCKET_ID)"
