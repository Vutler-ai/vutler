#!/bin/bash
###############################################################################
# Sprint 14 — Agent Runtime Engine
# One-Script Deployment
#
# Usage: ./DEPLOY.sh
# Or copy-paste commands individually
###############################################################################

set -e  # Exit on error

echo "🚀 Sprint 14 — Agent Runtime Deployment"
echo "========================================"
echo ""

# Configuration
VPS_HOST="83.228.222.180"
SSH_KEY="$HOME/.secrets/vps-ssh-key.pem"
CONTAINER="vutler-api"
LOCAL_DIR="$(pwd)"

# Verify we're in the right directory
if [[ ! -f "README.md" ]] || [[ ! -d "runtime" ]]; then
  echo "❌ Error: Must run from sprint-14 directory"
  echo "Current directory: $LOCAL_DIR"
  exit 1
fi

echo "✅ Local directory verified: $LOCAL_DIR"
echo ""

# Step 1: Copy to VPS
echo "📦 Step 1: Copying files to VPS..."
scp -i "$SSH_KEY" -r . "ubuntu@$VPS_HOST:/tmp/vutler-sprint14/"

if [ $? -eq 0 ]; then
  echo "✅ Files copied to VPS:/tmp/vutler-sprint14/"
else
  echo "❌ Failed to copy files to VPS"
  exit 1
fi
echo ""

# Step 2: Deploy to container
echo "🐳 Step 2: Deploying to container..."

ssh -i "$SSH_KEY" "ubuntu@$VPS_HOST" << 'ENDSSH'
  # Copy runtime directory
  docker cp /tmp/vutler-sprint14/runtime vutler-api:/app/runtime
  
  # Copy conservative wrapper (SAFE integration)
  docker cp /tmp/vutler-sprint14/runtime-wrapper.js vutler-api:/app/runtime-wrapper.js
  
  # Copy test script
  docker cp /tmp/vutler-sprint14/test-runtime.js vutler-api:/app/test-runtime.js
  
  # Verify deployment
  echo "Verifying files in container..."
  docker exec vutler-api ls -la /app/runtime
  docker exec vutler-api ls -la /app/runtime/tools
  
  echo ""
  echo "✅ Files deployed to container"
ENDSSH

if [ $? -ne 0 ]; then
  echo "❌ Failed to deploy to container"
  exit 1
fi
echo ""

# Step 3: Verify environment
echo "🔍 Step 3: Verifying environment..."

ssh -i "$SSH_KEY" "ubuntu@$VPS_HOST" << 'ENDSSH'
  # Check Anthropic API key
  if docker exec vutler-api printenv | grep -q ANTHROPIC_API_KEY; then
    echo "✅ ANTHROPIC_API_KEY is set"
  else
    echo "⚠️  WARNING: ANTHROPIC_API_KEY not set!"
    echo "Set it with: docker exec vutler-api bash -c 'echo \"ANTHROPIC_API_KEY=your_key\" >> .env'"
  fi
ENDSSH

echo ""

# Step 4: Instructions
echo "📋 Next Steps (CONSERVATIVE INTEGRATION):"
echo ""
echo "⚠️  IMPORTANT: This is an ADD-ON, not a replacement."
echo "    Your existing chat handler will continue to work."
echo "    Runtime only activates for agents with tools enabled."
echo ""
echo "1. Integrate the conservative wrapper:"
echo "   See INTEGRATION-CONSERVATIVE.md for step-by-step guide"
echo ""
echo "2. Test with ONE agent first:"
echo "   - Enable tools for one test agent in DB"
echo "   - Send a chat message"
echo "   - Verify it uses the runtime"
echo "   - Test an agent WITHOUT tools (should use existing handler)"
echo ""
echo "3. Gradual rollout:"
echo "   - Enable tools for agents one-by-one"
echo "   - Monitor logs: docker logs -f vutler-api | grep RuntimeWrapper"
echo ""
echo "4. Rollback if needed:"
echo "   - Disable tools in DB → instant rollback to existing behavior"
echo ""
echo "See INTEGRATION-CONSERVATIVE.md for SAFE integration."
echo "See CHECKLIST.md for comprehensive testing."
echo ""
echo "✅ Files deployed (not integrated yet — zero risk!)"
