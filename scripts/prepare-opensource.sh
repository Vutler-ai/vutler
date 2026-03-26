#!/usr/bin/env bash
# =============================================================================
# prepare-opensource.sh
# Prepares a clean open-source snapshot of Vutler in /tmp/vutler-opensource/
# SAFE: Only copies source code files. No secrets, no .env files.
# =============================================================================

set -euo pipefail

SRC="/Users/alopez/Devs/Vutler"
DEST="/tmp/vutler-opensource"

echo "==> Preparing Vutler open-source release..."
echo "    Source : $SRC"
echo "    Dest   : $DEST"
echo ""

# ---------------------------------------------------------------------------
# 1. Clean slate
# ---------------------------------------------------------------------------
rm -rf "$DEST"

# ---------------------------------------------------------------------------
# 2. Create directory structure
# ---------------------------------------------------------------------------
mkdir -p \
  "$DEST/packages/core/middleware" \
  "$DEST/packages/core/lib" \
  "$DEST/packages/core/api" \
  "$DEST/packages/agents/api" \
  "$DEST/packages/agents/services" \
  "$DEST/packages/nexus" \
  "$DEST/services" \
  "$DEST/seeds" \
  "$DEST/api" \
  "$DEST/lib"

echo "==> Directory structure created."

# ---------------------------------------------------------------------------
# 3. Helper: copy a file if it exists, skip silently if not
# ---------------------------------------------------------------------------
cp_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -f "$src" ]; then
    # Ensure destination directory exists
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "    [OK] $(basename "$src")"
  else
    echo "    [SKIP] $src — not found"
  fi
}

# ---------------------------------------------------------------------------
# 4. Copy helper: entire directory (skip hidden files and node_modules)
# ---------------------------------------------------------------------------
cp_dir_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -d "$src" ]; then
    mkdir -p "$dest"
    # Exclude node_modules, .env files, and hidden directories
    rsync -a \
      --exclude='node_modules/' \
      --exclude='.env*' \
      --exclude='*.key' \
      --exclude='*.pem' \
      --exclude='*.p12' \
      --exclude='*.pfx' \
      --exclude='credentials*' \
      "$src/" "$dest/"
    echo "    [OK] $(basename "$src")/ (directory)"
  else
    echo "    [SKIP] $src — directory not found"
  fi
}

# ---------------------------------------------------------------------------
# 5. Copy files
# ---------------------------------------------------------------------------

echo ""
echo "==> Copying packages/core..."
cp_if_exists "$SRC/packages/core/index.js"                    "$DEST/packages/core/index.js"
cp_if_exists "$SRC/packages/core/middleware/featureGate.js"   "$DEST/packages/core/middleware/featureGate.js"
cp_dir_if_exists "$SRC/packages/core/lib"                     "$DEST/packages/core/lib"
cp_dir_if_exists "$SRC/packages/core/api"                     "$DEST/packages/core/api"

echo ""
echo "==> Copying packages/agents..."
cp_if_exists "$SRC/packages/agents/routes.js"                 "$DEST/packages/agents/routes.js"
cp_dir_if_exists "$SRC/packages/agents/api"                   "$DEST/packages/agents/api"
cp_dir_if_exists "$SRC/packages/agents/services"              "$DEST/packages/agents/services"

echo ""
echo "==> Copying packages/nexus (entire package)..."
cp_dir_if_exists "$SRC/packages/nexus"                        "$DEST/packages/nexus"

echo ""
echo "==> Copying services..."
cp_if_exists "$SRC/services/llmRouter.js"                     "$DEST/services/llmRouter.js"
cp_if_exists "$SRC/services/swarmCoordinator.js"              "$DEST/services/swarmCoordinator.js"
cp_if_exists "$SRC/services/tokenService.js"                  "$DEST/services/tokenService.js"
cp_if_exists "$SRC/services/crypto.js"                        "$DEST/services/crypto.js"
cp_if_exists "$SRC/services/apiKeys.js"                       "$DEST/services/apiKeys.js"

echo ""
echo "==> Copying seeds..."
cp_if_exists "$SRC/seeds/agent-templates.json"                "$DEST/seeds/agent-templates.json"
cp_if_exists "$SRC/seeds/agent-skills.json"                   "$DEST/seeds/agent-skills.json"
cp_if_exists "$SRC/seeds/loadTemplates.js"                    "$DEST/seeds/loadTemplates.js"

echo ""
echo "==> Copying API routes..."
cp_if_exists "$SRC/api/agents.js"                             "$DEST/api/agents.js"
cp_if_exists "$SRC/api/nexus.js"                              "$DEST/api/nexus.js"
cp_if_exists "$SRC/api/llm.js"                                "$DEST/api/llm.js"
cp_if_exists "$SRC/api/memory.js"                             "$DEST/api/memory.js"
# Copy the runtime chat.js (top-level api/), NOT app/custom/api/chat.js
cp_if_exists "$SRC/api/chat.js"                               "$DEST/api/chat.js"

echo ""
echo "==> Copying infra..."
cp_if_exists "$SRC/agentRuntime.js"                           "$DEST/agentRuntime.js"
cp_if_exists "$SRC/lib/rateLimiter.js"                        "$DEST/lib/rateLimiter.js"
cp_if_exists "$SRC/lib/vaultbrix.js"                          "$DEST/lib/vaultbrix.js"

echo ""
echo "==> Copying config..."
cp_if_exists "$SRC/Dockerfile"                                "$DEST/Dockerfile"
cp_if_exists "$SRC/package.json"                              "$DEST/package.json"

# ---------------------------------------------------------------------------
# 6. Scan for potential hardcoded secrets and warn
# ---------------------------------------------------------------------------
echo ""
echo "==> Scanning copied files for potential hardcoded secrets..."

SECRET_PATTERNS=(
  'sk-[a-zA-Z0-9]{20,}'           # OpenAI / OpenRouter keys
  'sk-ant-[a-zA-Z0-9-]{20,}'      # Anthropic keys
  'rlm_[a-zA-Z0-9]{20,}'          # RLM keys
  'eyJ[a-zA-Z0-9_-]{20,}'         # JWT tokens (base64)
  'postgres://[^@]+:[^@]+@'        # DB URLs with credentials
  'postgresql://[^@]+:[^@]+@'      # DB URLs with credentials
  'password\s*[:=]\s*["\x27][^"\x27]{8,}' # Hardcoded passwords
  'secret\s*[:=]\s*["\x27][^"\x27]{8,}'   # Hardcoded secrets
  'PRIVATE KEY'                    # Private keys
  'BEGIN RSA'                      # RSA keys
)

FOUND_SECRETS=0

for pattern in "${SECRET_PATTERNS[@]}"; do
  matches=$(grep -rn --include="*.js" --include="*.json" --include="*.ts" \
    -E "$pattern" "$DEST" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo ""
    echo "  [WARN] Potential secret detected (pattern: $pattern):"
    echo "$matches" | head -5
    FOUND_SECRETS=1
  fi
done

if [ "$FOUND_SECRETS" -eq 0 ]; then
  echo "    No obvious hardcoded secrets found."
else
  echo ""
  echo "  [ACTION REQUIRED] Review the warnings above before publishing!"
fi

# ---------------------------------------------------------------------------
# 7. Summary
# ---------------------------------------------------------------------------
echo ""
echo "==> Done! Open-source snapshot ready at: $DEST"
echo ""
FILE_COUNT=$(find "$DEST" -type f | wc -l | tr -d ' ')
echo "    Total files: $FILE_COUNT"
echo ""
echo "    Next steps:"
echo "      1. Review $DEST manually"
echo "      2. Check for any secrets flagged above"
echo "      3. Run: bash scripts/sync-opensource.sh"
echo ""
