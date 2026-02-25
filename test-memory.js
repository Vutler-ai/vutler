#!/usr/bin/env node
/**
 * Test script for Agent Memory API (Story 7.3)
 * 
 * Usage:
 *   node test-memory.js
 * 
 * Prerequisites:
 *   - Vutler API server running (npm start)
 *   - PostgreSQL running with vutler database
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_AGENT_ID = 'test-agent-' + Date.now();

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSuccess(message) {
  log('✅', message, colors.green);
}

function logError(message) {
  log('❌', message, colors.red);
}

function logInfo(message) {
  log('ℹ️ ', message, colors.cyan);
}

function logWarn(message) {
  log('⚠️ ', message, colors.yellow);
}

// Test runner
async function runTest(name, testFn) {
  logInfo(`Running: ${name}`);
  try {
    await testFn();
    logSuccess(`PASS: ${name}`);
    return true;
  } catch (err) {
    logError(`FAIL: ${name} - ${err.message}`);
    if (err.response) {
      console.error('Response:', await err.response.text());
    }
    return false;
  }
}

// HTTP helper
async function request(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
    err.response = { text: () => text };
    throw err;
  }

  return data;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

async function test_storeMemoryFact() {
  const result = await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories`, {
    memory_type: 'fact',
    content: 'The user prefers dark mode for all applications.',
    metadata: { source: 'manual_test', confidence: 0.95 },
  });

  if (!result.success) throw new Error('Failed to store memory');
  if (!result.memory.id) throw new Error('Memory ID not returned');
  if (result.memory.memory_type !== 'fact') throw new Error('Wrong memory type');

  return result.memory;
}

async function test_storeMemoryPreference() {
  const result = await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories`, {
    memory_type: 'preference',
    content: 'I like my coffee black, no sugar.',
    metadata: { source: 'conversation', timestamp: new Date().toISOString() },
  });

  if (!result.success) throw new Error('Failed to store preference');
  return result.memory;
}

async function test_storeMemoryWithExpiry() {
  const expiresAt = new Date(Date.now() + 60000).toISOString(); // 1 minute
  const result = await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories`, {
    memory_type: 'context',
    content: 'Temporary context: user is currently debugging an API issue.',
    expires_at: expiresAt,
  });

  if (!result.success) throw new Error('Failed to store memory with expiry');
  if (!result.memory.expires_at) throw new Error('Expiry not set');
  return result.memory;
}

async function test_listMemories() {
  const result = await request('GET', `/api/v1/agents/${TEST_AGENT_ID}/memories`);

  if (!result.success) throw new Error('Failed to list memories');
  if (!Array.isArray(result.memories)) throw new Error('Memories is not an array');
  if (result.memories.length < 2) throw new Error('Expected at least 2 memories');
  if (typeof result.total !== 'number') throw new Error('Total count missing');

  console.log(`   Found ${result.memories.length} memories (total: ${result.total})`);
  return result.memories;
}

async function test_filterMemoriesByType() {
  const result = await request('GET', `/api/v1/agents/${TEST_AGENT_ID}/memories?type=fact`);

  if (!result.success) throw new Error('Failed to filter memories');
  if (result.memories.some(m => m.memory_type !== 'fact')) {
    throw new Error('Returned non-fact memories');
  }

  console.log(`   Found ${result.memories.length} fact memories`);
  return result.memories;
}

async function test_searchMemories() {
  const result = await request('GET', `/api/v1/agents/${TEST_AGENT_ID}/memories?search=dark mode`);

  if (!result.success) throw new Error('Failed to search memories');
  if (result.memories.length === 0) throw new Error('Search returned no results');
  if (!result.memories.some(m => m.content.toLowerCase().includes('dark mode'))) {
    throw new Error('Search results do not contain search term');
  }

  console.log(`   Search found ${result.memories.length} matching memories`);
  return result.memories;
}

async function test_deleteMemory() {
  // First, create a memory to delete
  const created = await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories`, {
    memory_type: 'context',
    content: 'This memory will be deleted.',
  });

  const memoryId = created.memory.id;

  // Delete it
  const result = await request('DELETE', `/api/v1/agents/${TEST_AGENT_ID}/memories/${memoryId}`);

  if (!result.success) throw new Error('Failed to delete memory');
  if (result.deleted !== memoryId.toString()) throw new Error('Wrong memory ID in response');

  // Verify it's gone
  const list = await request('GET', `/api/v1/agents/${TEST_AGENT_ID}/memories`);
  if (list.memories.some(m => m.id === memoryId)) {
    throw new Error('Memory still exists after deletion');
  }

  console.log(`   Successfully deleted memory ${memoryId}`);
}

async function test_summarizeConversations() {
  const messages = [
    { role: 'user', content: 'My name is Alice and I work at Google.' },
    { role: 'assistant', content: 'Nice to meet you, Alice!' },
    { role: 'user', content: 'I like reading sci-fi novels in my free time.' },
    { role: 'assistant', content: 'That sounds great!' },
    { role: 'user', content: 'I prefer communication via email rather than phone.' },
    { role: 'assistant', content: 'Noted, I will remember that.' },
  ];

  const result = await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories/summarize`, {
    messages,
  });

  if (!result.success) throw new Error('Summarization failed');
  if (result.extracted === 0) {
    logWarn('   No facts extracted (this is OK if patterns were not matched)');
  } else {
    console.log(`   Extracted ${result.extracted} facts from conversation`);
  }

  return result;
}

async function test_memoryCleanup() {
  const result = await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories/cleanup`);

  if (!result.success) throw new Error('Cleanup failed');
  console.log(`   Cleanup completed successfully`);
}

async function test_invalidMemoryType() {
  try {
    await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories`, {
      memory_type: 'invalid_type',
      content: 'This should fail.',
    });
    throw new Error('Should have rejected invalid memory type');
  } catch (err) {
    if (err.message.includes('Should have rejected')) throw err;
    // Expected error
    console.log('   Correctly rejected invalid memory type');
  }
}

async function test_missingContent() {
  try {
    await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories`, {
      memory_type: 'fact',
      // content missing
    });
    throw new Error('Should have rejected missing content');
  } catch (err) {
    if (err.message.includes('Should have rejected')) throw err;
    // Expected error
    console.log('   Correctly rejected missing content');
  }
}

async function test_pagination() {
  // Create 15 memories
  for (let i = 0; i < 15; i++) {
    await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories`, {
      memory_type: 'context',
      content: `Test memory ${i + 1}`,
    });
  }

  // Test pagination
  const page1 = await request('GET', `/api/v1/agents/${TEST_AGENT_ID}/memories?limit=5&offset=0`);
  const page2 = await request('GET', `/api/v1/agents/${TEST_AGENT_ID}/memories?limit=5&offset=5`);

  if (page1.memories.length !== 5) throw new Error('Page 1 should have 5 items');
  if (page2.memories.length !== 5) throw new Error('Page 2 should have 5 items');
  if (page1.memories[0].id === page2.memories[0].id) {
    throw new Error('Pages should not have overlapping items');
  }

  console.log(`   Pagination working: page1=${page1.count}, page2=${page2.count}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(`${colors.bold}${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║  Agent Memory API Test Suite (Story 7.3)  ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  logInfo(`API URL: ${BASE_URL}`);
  logInfo(`Test Agent ID: ${TEST_AGENT_ID}`);
  console.log('');

  const tests = [
    ['Store memory (fact)', test_storeMemoryFact],
    ['Store memory (preference)', test_storeMemoryPreference],
    ['Store memory with expiry', test_storeMemoryWithExpiry],
    ['List all memories', test_listMemories],
    ['Filter memories by type', test_filterMemoriesByType],
    ['Search memories', test_searchMemories],
    ['Delete memory', test_deleteMemory],
    ['Summarize conversations', test_summarizeConversations],
    ['Memory cleanup', test_memoryCleanup],
    ['Reject invalid memory type', test_invalidMemoryType],
    ['Reject missing content', test_missingContent],
    ['Pagination', test_pagination],
  ];

  const results = [];
  for (const [name, testFn] of tests) {
    const passed = await runTest(name, testFn);
    results.push({ name, passed });
    console.log('');
  }

  // Summary
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════${colors.reset}`);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  if (failed === 0) {
    logSuccess(`All ${total} tests passed! 🎉`);
  } else {
    logError(`${failed} of ${total} tests failed`);
    logInfo(`${passed} tests passed`);
  }

  console.log('');

  // Cleanup
  logInfo('Cleaning up test data...');
  try {
    await request('POST', `/api/v1/agents/${TEST_AGENT_ID}/memories/cleanup`);
    logSuccess('Cleanup completed');
  } catch (err) {
    logWarn('Cleanup failed (this is OK): ' + err.message);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run
main().catch(err => {
  logError('Fatal error: ' + err.message);
  console.error(err);
  process.exit(1);
});
