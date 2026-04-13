#!/usr/bin/env node
'use strict';

require('dotenv').config();

const pool = require('../lib/vaultbrix');
const { runJournalAutomationSweep, normalizeJournalDate } = require('../services/journalCompactionService');

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function listWorkspaceIds(db) {
  const result = await db.query(
    `SELECT id
       FROM tenant_vutler.workspaces
      ORDER BY created_at ASC NULLS LAST, id ASC`
  );
  return (result.rows || []).map((row) => row.id).filter(Boolean);
}

async function main() {
  const scope = String(getArgValue('--scope') || 'all').trim().toLowerCase();
  if (!['all', 'workspace', 'agent'].includes(scope)) {
    throw new Error('scope must be all, workspace, or agent');
  }

  const workspaceId = String(getArgValue('--workspace') || '').trim();
  const date = normalizeJournalDate(getArgValue('--date'));
  const force = hasFlag('--force');
  const workspaceIds = workspaceId ? [workspaceId] : await listWorkspaceIds(pool);

  const results = [];
  for (const currentWorkspaceId of workspaceIds) {
    const status = await runJournalAutomationSweep({
      db: pool,
      workspaceId: currentWorkspaceId,
      scope,
      date,
      force,
      user: {
        id: 'journal-automation-sweep',
        email: 'journal-sweep@vutler.ai',
        role: 'admin',
      },
    });

    results.push({
      workspace_id: currentWorkspaceId,
      scope: status.scope,
      date: status.date,
      forced: status.forced,
      totals: status.totals,
      completed_at: status.completed_at,
    });
  }

  process.stdout.write(`${JSON.stringify({ ok: true, workspaces: results }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (_) {
      // Ignore pool shutdown failures in CLI mode.
    }
  });
