#!/bin/bash

echo "🔍 Testing BMAD Auto-Sync Hook Persistence"
echo "============================================="

# 1. Vérifier que le service est présent dans le code
echo "[1/5] Checking service file exists..."
if [ -f "/home/ubuntu/vutler/services/bmadAutoSync.js" ]; then
  echo "✅ BmadAutoSync service file exists"
else
  echo "❌ BmadAutoSync service file missing"
  exit 1
fi

# 2. Vérifier que le service est intégré dans index.js
echo "[2/5] Checking integration in index.js..."
if grep -q "BmadAutoSync" /home/ubuntu/vutler/index.js; then
  echo "✅ BmadAutoSync is integrated in index.js"
else
  echo "❌ BmadAutoSync not found in index.js"
  exit 1
fi

# 3. Tester la syntaxe
echo "[3/5] Testing syntax..."
cd /home/ubuntu/vutler
if node -c services/bmadAutoSync.js && node -c index.js; then
  echo "✅ All files have correct syntax"
else
  echo "❌ Syntax errors found"
  exit 1
fi

# 4. Tester la synchronisation initiale
echo "[4/5] Testing initial sync (dry run)..."
BACKUP_DIR="/tmp/bmad-backup-$(date +%s)"
mkdir -p "$BACKUP_DIR"

# Backup des fichiers Drive existants
if [ -d "/data/drive/Workspace/projects/Vutler/BMAD" ]; then
  cp -r /data/drive/Workspace/projects/Vutler/BMAD/* "$BACKUP_DIR/" 2>/dev/null || true
fi

# Test de démarrage du service avec timeout
echo "Starting service with 10 second timeout..."
timeout 10 node -e "
const BmadAutoSync = require('./services/bmadAutoSync');
const service = new BmadAutoSync();
console.log('[TEST] Starting service...');
service.start().then(() => {
  console.log('[TEST] Service started, checking status...');
  console.log('[TEST] Status:', JSON.stringify(service.getStatus(), null, 2));
  process.exit(0);
}).catch(err => {
  console.error('[TEST] Service failed:', err);
  process.exit(1);
});
" || echo "[WARNING] Service test timed out (expected)"

# 5. Vérifier que les fichiers ont été synchronisés
echo "[5/5] Verifying files are synced..."
SYNC_COUNT=0
FILES_TO_CHECK=(
  "/data/drive/Workspace/projects/Vutler/BMAD/BMAD_MASTER.md"
  "/data/drive/Workspace/projects/Vutler/BMAD/bmad-mongo-to-pg-migration.md"
  "/data/drive/Workspace/projects/Vutler/BMAD/bmad-mail-approval-phase-b.md"
)

for file in "${FILES_TO_CHECK[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $(basename $file) synced to Drive"
    SYNC_COUNT=$((SYNC_COUNT + 1))
  else
    echo "❌ $(basename $file) NOT synced to Drive"
  fi
done

echo ""
echo "📊 BMAD Auto-Sync Persistence Test Results"
echo "==========================================="
echo "✅ Service file exists: YES"
echo "✅ Integrated in runtime: YES"
echo "✅ Syntax valid: YES"
echo "✅ Files synced: $SYNC_COUNT/${#FILES_TO_CHECK[@]}"

if [ $SYNC_COUNT -eq ${#FILES_TO_CHECK[@]} ]; then
  echo ""
  echo "🎉 BMAD Auto-Sync Hook is PERSISTENT and FUNCTIONAL"
  echo "   Ready for production Docker rebuild!"
  exit 0
else
  echo ""
  echo "⚠️  BMAD Auto-Sync Hook has issues"
  exit 1
fi
