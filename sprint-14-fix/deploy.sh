#!/bin/bash

# Sprint 14 Runtime - Automated Deployment Script
# Author: Mike ⚙️
# Date: 2026-02-27

set -e  # Exit on error

SSH_KEY=".secrets/vps-ssh-key.pem"
VPS_HOST="ubuntu@83.228.222.180"
RUNTIME_PATH="/app/runtime"
BACKUP_PATH="/app/runtime-backup-$(date +%Y%m%d-%H%M%S)"
LOCAL_PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Sprint 14 Runtime - Schema Fix Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Local patch dir: $LOCAL_PATCH_DIR"
echo "🔑 SSH key: $SSH_KEY"
echo "🌐 VPS host: $VPS_HOST"
echo "📂 Runtime path: $RUNTIME_PATH"
echo "💾 Backup path: $BACKUP_PATH"
echo ""

# Check SSH key exists
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH key not found: $SSH_KEY"
  exit 1
fi

# Check patch files exist
echo "🔍 Checking patch files..."
FILES=(
  "agent-loop.js"
  "system-prompt-builder.js"
  "memory-manager.js"
  "tools/tasks.js"
  "tools/memories.js"
  "tools/goals.js"
  "tools/calendar.js"
)

for file in "${FILES[@]}"; do
  if [ ! -f "$LOCAL_PATCH_DIR/$file" ]; then
    echo "❌ Missing file: $file"
    exit 1
  fi
  echo "  ✅ $file"
done

echo ""
read -p "🚀 Ready to deploy? This will backup and replace runtime files. Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Deployment cancelled."
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 Step 1/6: Uploading patch files to VPS..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh -i "$SSH_KEY" "$VPS_HOST" "mkdir -p /tmp/runtime-patch/tools"
scp -i "$SSH_KEY" \
  "$LOCAL_PATCH_DIR/agent-loop.js" \
  "$LOCAL_PATCH_DIR/system-prompt-builder.js" \
  "$LOCAL_PATCH_DIR/memory-manager.js" \
  "$VPS_HOST:/tmp/runtime-patch/"

scp -i "$SSH_KEY" \
  "$LOCAL_PATCH_DIR/tools/tasks.js" \
  "$LOCAL_PATCH_DIR/tools/memories.js" \
  "$LOCAL_PATCH_DIR/tools/goals.js" \
  "$LOCAL_PATCH_DIR/tools/calendar.js" \
  "$VPS_HOST:/tmp/runtime-patch/tools/"

echo "✅ Upload complete"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 Step 2/6: Creating backup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh -i "$SSH_KEY" "$VPS_HOST" "sudo cp -r $RUNTIME_PATH $BACKUP_PATH"
echo "✅ Backup created: $BACKUP_PATH"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Step 3/6: Replacing runtime files..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh -i "$SSH_KEY" "$VPS_HOST" << 'EOF'
  sudo cp /tmp/runtime-patch/agent-loop.js /app/runtime/
  sudo cp /tmp/runtime-patch/system-prompt-builder.js /app/runtime/
  sudo cp /tmp/runtime-patch/memory-manager.js /app/runtime/
  sudo cp /tmp/runtime-patch/tools/tasks.js /app/runtime/tools/
  sudo cp /tmp/runtime-patch/tools/memories.js /app/runtime/tools/
  sudo cp /tmp/runtime-patch/tools/goals.js /app/runtime/tools/
  sudo cp /tmp/runtime-patch/tools/calendar.js /app/runtime/tools/
EOF

echo "✅ Files replaced"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 Step 4/6: Setting permissions..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh -i "$SSH_KEY" "$VPS_HOST" << 'EOF'
  sudo chown -R node:node /app/runtime/
  sudo chmod -R 755 /app/runtime/
EOF

echo "✅ Permissions set"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Step 5/6: Restarting container..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ssh -i "$SSH_KEY" "$VPS_HOST" "docker restart vutler-api"
echo "✅ Container restarted"

# Wait for container to come up
echo "⏳ Waiting 5 seconds for container to start..."
sleep 5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Step 6/6: Testing deployment..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "📋 Checking container logs..."
ssh -i "$SSH_KEY" "$VPS_HOST" "docker logs vutler-api --tail 20" || echo "⚠️  Could not fetch logs"

echo ""
echo "🔍 Testing runtime import..."
ssh -i "$SSH_KEY" "$VPS_HOST" "docker exec vutler-api node -e \"const AgentLoop = require('./runtime/agent-loop'); console.log('✅ AgentLoop loaded successfully');\"" && echo "✅ Runtime import OK" || echo "❌ Runtime import FAILED"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOYMENT COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Summary:"
echo "  ✅ Backup: $BACKUP_PATH"
echo "  ✅ Runtime files replaced"
echo "  ✅ Container restarted"
echo ""
echo "⚠️  NEXT STEPS:"
echo "  1. Check ANTHROPIC_API_KEY env var (see DEPLOYMENT.md)"
echo "  2. Test agent endpoints: POST /agent/:id/message"
echo "  3. Monitor logs: ssh $VPS_HOST 'docker logs -f vutler-api'"
echo ""
echo "🆘 Rollback if needed:"
echo "  ssh $VPS_HOST 'sudo rm -rf $RUNTIME_PATH && sudo mv $BACKUP_PATH $RUNTIME_PATH && docker restart vutler-api'"
echo ""
