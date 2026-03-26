#!/usr/bin/env node
'use strict';

/**
 * Vutler E2E Test Runner
 * Runs all test suites sequentially and reports pass/fail counts.
 *
 * Usage:
 *   node tests/e2e/run-all.js
 *   TEST_API_URL=http://localhost:3099 node tests/e2e/run-all.js
 */

const { API_URL } = require('./helpers');

const suites = [
  { name: 'Health',      file: './health.test' },
  { name: 'Agents',      file: './agents.test' },
  { name: 'Tasks',       file: './tasks.test' },
  { name: 'Chat',        file: './chat.test' },
  { name: 'Drive',       file: './drive.test' },
  { name: 'Billing',     file: './billing.test' },
  { name: 'Nexus',       file: './nexus.test' },
  { name: 'Marketplace', file: './marketplace.test' },
];

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const DIM    = '\x1b[2m';

async function run() {
  console.log(`\n${BOLD}Vutler E2E Test Suite${RESET}`);
  console.log(`${DIM}Target: ${API_URL}${RESET}`);
  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);

  const startTime = Date.now();
  let totalPassed = 0;
  let totalFailed = 0;
  const failures = [];

  for (const suite of suites) {
    let mod;
    try {
      mod = require(suite.file);
    } catch (err) {
      console.log(`\n${YELLOW}⚠ ${suite.name}${RESET} — could not load: ${err.message}`);
      continue;
    }

    try {
      const result = await mod.main();
      totalPassed += result.passed;
      totalFailed += result.failed;
      if (result.failed > 0) {
        failures.push(suite.name);
      }
    } catch (err) {
      console.error(`\n${RED}ERROR in ${suite.name}:${RESET}`, err.message);
      totalFailed++;
      failures.push(suite.name);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${DIM}${'─'.repeat(50)}${RESET}`);
  console.log(`${BOLD}Results${RESET}`);
  console.log(`  ${GREEN}Passed: ${totalPassed}${RESET}`);
  console.log(`  ${totalFailed > 0 ? RED : DIM}Failed: ${totalFailed}${RESET}`);
  console.log(`  ${DIM}Time:   ${elapsed}s${RESET}`);

  if (failures.length > 0) {
    console.log(`\n${RED}Failed suites: ${failures.join(', ')}${RESET}`);
  }

  if (totalFailed === 0) {
    console.log(`\n${GREEN}${BOLD}All tests passed!${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${RED}${BOLD}${totalFailed} test(s) failed.${RESET}\n`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error(`\n${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
