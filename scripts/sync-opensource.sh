#!/usr/bin/env bash
# =============================================================================
# sync-opensource.sh
# Runs prepare-opensource.sh then pushes the result to vutler-ai/vutler
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="/tmp/vutler-opensource"
REMOTE="git@github.com:vutler-ai/vutler.git"
BRANCH="main"

# ---------------------------------------------------------------------------
# 1. Prepare the snapshot
# ---------------------------------------------------------------------------
echo "==> Step 1/5: Preparing open-source snapshot..."
bash "$SCRIPT_DIR/prepare-opensource.sh"

# ---------------------------------------------------------------------------
# 2. Enter the destination directory
# ---------------------------------------------------------------------------
echo ""
echo "==> Step 2/5: Entering $DEST..."
cd "$DEST"

# ---------------------------------------------------------------------------
# 3. Initialize git repo if needed
# ---------------------------------------------------------------------------
echo ""
echo "==> Step 3/5: Setting up git repository..."

if [ ! -d ".git" ]; then
  echo "    Initializing new git repository..."
  git init
  git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH" 2>/dev/null || true
else
  echo "    Existing git repository found."
fi

# Add remote if not already set
if ! git remote get-url origin &>/dev/null; then
  echo "    Adding remote origin: $REMOTE"
  git remote add origin "$REMOTE"
else
  CURRENT_REMOTE=$(git remote get-url origin)
  if [ "$CURRENT_REMOTE" != "$REMOTE" ]; then
    echo "    Updating remote origin to: $REMOTE"
    git remote set-url origin "$REMOTE"
  else
    echo "    Remote origin already set correctly."
  fi
fi

# ---------------------------------------------------------------------------
# 4. Commit
# ---------------------------------------------------------------------------
echo ""
echo "==> Step 4/5: Committing changes..."

git add -A

# Check if there is anything to commit
if git diff --cached --quiet; then
  echo "    No changes to commit. Repository is up to date."
else
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  git commit -m "sync: update from private repo ($TIMESTAMP)"
  echo "    Committed successfully."
fi

# ---------------------------------------------------------------------------
# 5. Push
# ---------------------------------------------------------------------------
echo ""
echo "==> Step 5/5: Pushing to $REMOTE ($BRANCH)..."
git push -u origin "$BRANCH"

echo ""
echo "==> Sync complete!"
echo "    Public repo: https://github.com/vutler-ai/vutler"
echo ""
