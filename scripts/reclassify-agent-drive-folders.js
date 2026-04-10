#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: '.env.local', quiet: true, override: true });
require('dotenv').config({ quiet: true, override: true });

const SCHEMA = 'tenant_vutler';

function normalizeVirtualPath(inputPath = '/') {
  const normalized = String(inputPath || '/').replace(/\\/g, '/');
  const compact = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return compact.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function slugifyAgentFolderSegment(value = '') {
  const normalized = String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || '';
}

function buildAgentFolderName(agent = {}) {
  return slugifyAgentFolderSegment(agent.username || '')
    || slugifyAgentFolderSegment(agent.name || '')
    || String(agent.id || '').trim();
}

function parseArgs(argv = []) {
  const options = {
    dryRun: false,
    verbose: false,
    workspaceId: null,
    workspaceSlug: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (arg === '--workspace-id') {
      options.workspaceId = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === '--workspace-slug') {
      options.workspaceSlug = argv[index + 1] || null;
      index += 1;
      continue;
    }
  }

  return options;
}

function buildAgentDriveTargets({ workspaceRoot, agent }) {
  const normalizedRoot = normalizeVirtualPath(workspaceRoot || '/projects/Vutler');
  const readableFolder = buildAgentFolderName(agent);

  return {
    workspaceRoot: normalizedRoot,
    flatLegacyIdRoot: normalizeVirtualPath(`${normalizedRoot}/Agents/${String(agent?.id || '').trim()}`),
    flatLegacyReadableRoot: normalizeVirtualPath(`${normalizedRoot}/Agents/${readableFolder}`),
  };
}

async function detectAgentDriveState(db, workspaceId, agent) {
  const { resolveWorkspaceDriveRoot } = require('../services/drivePlacementPolicy');
  const { resolveAgentDriveRoot } = require('../services/agentDriveService');
  const workspaceRoot = await resolveWorkspaceDriveRoot(workspaceId);
  const targetRoot = await resolveAgentDriveRoot(workspaceId, agent);
  const targets = buildAgentDriveTargets({ workspaceRoot, agent });
  const candidateRoots = Array.from(new Set([
    targetRoot,
    targets.flatLegacyIdRoot,
    targets.flatLegacyReadableRoot,
  ]));

  const result = await db.query(
    `SELECT path
       FROM ${SCHEMA}.drive_files
      WHERE workspace_id = $1
        AND is_deleted = false
        AND path = ANY($2::text[])`,
    [workspaceId, candidateRoots]
  );
  const existingRoots = new Set((result.rows || []).map((row) => row.path));

  const legacyRoots = [targets.flatLegacyIdRoot, targets.flatLegacyReadableRoot]
    .filter((path, index, values) => values.indexOf(path) === index)
    .filter((path) => path !== targetRoot && existingRoots.has(path));

  return {
    workspaceRoot: normalizeVirtualPath(workspaceRoot),
    targetRoot: normalizeVirtualPath(targetRoot),
    existingTarget: existingRoots.has(targetRoot),
    legacyRoots,
  };
}

function summarizePlanEntry(agent, workspace, state) {
  if (state.legacyRoots.length > 0) {
    return {
      action: 'migrate',
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      agentId: agent.id,
      agentName: agent.name || null,
      agentUsername: agent.username || null,
      agentType: agent.type,
      from: state.legacyRoots,
      to: state.targetRoot,
    };
  }

  if (!state.existingTarget) {
    return {
      action: 'scaffold',
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      agentId: agent.id,
      agentName: agent.name || null,
      agentUsername: agent.username || null,
      agentType: agent.type,
      from: [],
      to: state.targetRoot,
    };
  }

  return {
    action: 'noop',
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    agentId: agent.id,
    agentName: agent.name || null,
    agentUsername: agent.username || null,
    agentType: agent.type,
    from: [],
    to: state.targetRoot,
  };
}

async function listAgents(db, options = {}) {
  const params = [];
  const clauses = [];

  if (options.workspaceId) {
    params.push(options.workspaceId);
    clauses.push(`a.workspace_id = $${params.length}`);
  }
  if (options.workspaceSlug) {
    params.push(options.workspaceSlug);
    clauses.push(`w.slug = $${params.length}`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT
        a.id,
        a.workspace_id,
        a.name,
        a.username,
        a.type,
        w.slug AS workspace_slug
     FROM ${SCHEMA}.agents a
     JOIN ${SCHEMA}.workspaces w
       ON w.id = a.workspace_id
     ${where}
     ORDER BY w.slug ASC, a.name ASC, a.id ASC`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    username: row.username,
    type: row.type,
    workspace_slug: row.workspace_slug,
  }));
}

async function buildPlan(db, options = {}) {
  const agents = await listAgents(db, options);
  const plan = [];

  for (const agent of agents) {
    const workspace = { id: agent.workspace_id, slug: agent.workspace_slug };
    const state = await detectAgentDriveState(db, workspace.id, agent);
    plan.push(summarizePlanEntry(agent, workspace, state));
  }

  return plan;
}

function printPlan(plan, options = {}) {
  const counts = plan.reduce((accumulator, entry) => {
    accumulator[entry.action] = (accumulator[entry.action] || 0) + 1;
    return accumulator;
  }, {});

  console.log(`[Drive Reclassify] scanned=${plan.length} migrate=${counts.migrate || 0} scaffold=${counts.scaffold || 0} noop=${counts.noop || 0}`);

  if (!options.verbose) {
    const actionable = plan.filter((entry) => entry.action !== 'noop');
    for (const entry of actionable) {
      const ref = `${entry.workspaceSlug}/${entry.agentUsername || entry.agentId}`;
      if (entry.action === 'migrate') {
        console.log(`  - migrate ${ref}: ${entry.from.join(', ')} -> ${entry.to}`);
      } else {
        console.log(`  - scaffold ${ref}: ${entry.to}`);
      }
    }
    return;
  }

  for (const entry of plan) {
    const ref = `${entry.workspaceSlug}/${entry.agentUsername || entry.agentId}`;
    if (entry.action === 'migrate') {
      console.log(`  - migrate ${ref}: ${entry.from.join(', ')} -> ${entry.to}`);
    } else if (entry.action === 'scaffold') {
      console.log(`  - scaffold ${ref}: ${entry.to}`);
    } else {
      console.log(`  - noop ${ref}: ${entry.to}`);
    }
  }
}

async function executePlan(db, plan) {
  const { ensureWorkspaceDriveSetup } = require('../app/custom/services/provisioning');
  const { ensureAgentDriveProvisioned } = require('../services/agentDriveService');
  const provisionedWorkspaces = new Set();
  let changed = 0;

  for (const entry of plan) {
    if (entry.action === 'noop') continue;

    if (!provisionedWorkspaces.has(entry.workspaceId)) {
      await ensureWorkspaceDriveSetup(entry.workspaceId);
      provisionedWorkspaces.add(entry.workspaceId);
    }

    await ensureAgentDriveProvisioned(db, entry.workspaceId, {
      id: entry.agentId,
      username: entry.agentUsername,
      type: entry.agentType,
      name: entry.agentName,
    });
    changed += 1;
  }

  return changed;
}

async function main(argv = process.argv.slice(2)) {
  const pool = require('../lib/vaultbrix');
  const options = parseArgs(argv);
  const plan = await buildPlan(pool, options);
  printPlan(plan, options);

  if (options.dryRun) {
    console.log('[Drive Reclassify] dry-run only, no changes applied.');
    return;
  }

  const actionable = plan.filter((entry) => entry.action !== 'noop');
  if (actionable.length === 0) {
    console.log('[Drive Reclassify] nothing to change.');
    return;
  }

  const changed = await executePlan(pool, actionable);
  console.log(`[Drive Reclassify] applied changes for ${changed} agent(s).`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[Drive Reclassify] failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      const pool = require('../lib/vaultbrix');
      await pool.end().catch(() => {});
    });
}

module.exports = {
  buildAgentDriveTargets,
  parseArgs,
  summarizePlanEntry,
};
