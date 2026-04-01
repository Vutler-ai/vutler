#!/bin/bash
# Run all Vutler tests

set -e

echo "🧪 Running Vutler Test Suite"
echo "=============================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0
PASSED=0

run_test() {
  TEST_NAME=$1
  TEST_FILE=$2
  
  echo "Running: $TEST_NAME"
  if node "$TEST_FILE"; then
    echo -e "${GREEN}✓ $TEST_NAME passed${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗ $TEST_NAME failed${NC}"
    FAILED=$((FAILED + 1))
  fi
  echo ""
}

# Configuration tests (no external dependencies)
run_test "Configuration Tests" "tests/config.test.js"

# Anthropic fix test (no external dependencies)
run_test "Anthropic System Messages Fix" "tests/anthropic-fix.test.js"
run_test "UI Pack Contract Tests" "tests/ui-pack.test.js"
run_test "Core Permissions Tests" "tests/core-permissions.test.js"

# Token usage aggregation (requires MongoDB)
if [ -n "$MONGO_URL" ]; then
  run_test "Token Usage Aggregation" "tests/usage-aggregation.test.js"
else
  echo -e "${YELLOW}⊘ Skipping usage aggregation test (MONGO_URL not set)${NC}"
  echo ""
fi

# Integration tests (require running server)
if curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1; then
  run_test "Agent Identity Tests" "tests/agent-identity.test.js"
  run_test "Email Send Tests" "tests/email-send.test.js"
  run_test "Chat API Tests" "tests/chat.test.js"
  run_test "Runtime API Tests" "tests/runtime.test.js"
  run_test "Drive API Tests" "tests/drive.test.js"
  run_test "LLM Router Tests" "tests/llm-router.test.js"
else
  echo -e "${YELLOW}⊘ Skipping integration tests (server not running at localhost:3000)${NC}"
  echo ""
fi

# Summary
echo "=============================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
else
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
fi
