'use strict';

const pool = require('../lib/vaultbrix');
const { loadTemplates } = require('../seeds/loadTemplates');

async function main() {
  await loadTemplates();
  await pool.end?.().catch(() => {});
  console.log('[SEEDS] Marketplace template sync complete');
}

main().catch((err) => {
  console.error('[SEEDS] Marketplace template sync failed:', err.message);
  process.exitCode = 1;
});
