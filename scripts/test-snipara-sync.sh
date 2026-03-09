#!/bin/bash

# Test script for Snipara Auto-Provisioning + Task Sync
# Run after DB migration is complete

API_BASE="http://83.228.222.180:3001/api/v1"
WORKSPACE_ID=""  # Fill after first test
TASK_ID=""       # Fill after task creation test

echo "🧪 Snipara Integration Tests"
echo "=============================="
echo

# Test 1: Check if server is running
echo "📡 Test 1: Health Check"
curl -s "$API_BASE/health" | jq '.' || echo "❌ Server not responding"
echo
echo "---"
echo

# Test 2: Test webhook endpoint (without auth)
echo "📬 Test 2: Webhook Endpoint (Simulated Snipara Callback)"
curl -X POST "$API_BASE/task-router/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "task_created",
    "task": {
      "swarm_task_id": "test-swarm-'$(date +%s)'",
      "title": "Test Task from Snipara Swarm",
      "description": "This task was created in Snipara swarm",
      "priority": "P2",
      "status": "todo",
      "metadata": {
        "workspace_id": "00000000-0000-0000-0000-000000000001"
      }
    }
  }' | jq '.'
echo
echo "---"
echo

# Test 3: List tasks to verify webhook created task
echo "📋 Test 3: List Tasks (should include webhook-created task)"
curl -s "$API_BASE/task-router?workspace_id=00000000-0000-0000-0000-000000000001" | jq '.data | length'
echo "tasks found"
echo
echo "---"
echo

# Test 4: Create task (requires workspace with Snipara configured)
echo "📝 Test 4: Create Task (Vutler → Snipara sync)"
echo "⚠️  This will only fully work after migration + workspace with Snipara configured"
TASK_RESPONSE=$(curl -s -X POST "$API_BASE/task-router" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Vutler Task Sync",
    "description": "Should sync to Snipara swarm",
    "priority": "P2",
    "workspace_id": "00000000-0000-0000-0000-000000000001"
  }')
echo "$TASK_RESPONSE" | jq '.'
TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.data.id // empty')
echo "Created task ID: $TASK_ID"
echo
echo "---"
echo

# Test 5: Complete task (triggers Snipara completion)
if [ -n "$TASK_ID" ]; then
  echo "✅ Test 5: Complete Task (Vutler → Snipara complete)"
  curl -s -X PUT "$API_BASE/task-router/$TASK_ID" \
    -H "Content-Type: application/json" \
    -d '{ "status": "done" }' | jq '.'
  echo
else
  echo "⏭️  Test 5: SKIPPED (no task ID from previous test)"
fi
echo "---"
echo

# Test 6: Webhook - Complete Task
echo "📬 Test 6: Webhook Complete Task (Snipara → Vutler)"
curl -X POST "$API_BASE/task-router/sync" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "task_completed",
    "task": {
      "swarm_task_id": "test-swarm-completed-'$(date +%s)'",
      "metadata": {
        "workspace_id": "00000000-0000-0000-0000-000000000001"
      }
    }
  }' | jq '.'
echo
echo "---"
echo

echo "🎯 Tests Complete!"
echo
echo "Next Steps:"
echo "1. Run DB migration with admin credentials"
echo "2. Create a workspace via onboarding (will auto-provision Snipara)"
echo "3. Re-run tests with actual workspace_id"
echo "4. Configure Snipara webhook to point to: http://83.228.222.180:3001/api/v1/task-router/sync"
