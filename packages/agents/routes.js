'use strict';

/**
 * Agents routes bundle
 * Mounts all Agents feature routers under a single Express Router.
 * Each route group is wrapped with the featureGate middleware.
 * Uses safe mount to prevent one broken route from crashing the server.
 */

const { Router } = require('express');
const { gateFeature } = require('../core/middleware/featureGate');

const router = Router();

function mount(path, gate, modulePath) {
  try {
    router.use(path, gateFeature(gate), require(modulePath));
  } catch (e) {
    console.warn(`[AGENTS] Skip ${path}: ${e.message}`);
  }
}

// ── Agents (full-path: /agents, /agents/:id) ────────────────────────────────
function mountRoot(gate, modulePath, label) {
  try {
    router.use('/', gateFeature(gate), require(modulePath));
  } catch (e) {
    console.warn(`[AGENTS] Skip ${label}: ${e.message}`);
  }
}
mount('/agents', 'agents', '../../api/agents');
mount('/agent-runtime',   'agents',      '../../app/custom/api/runtime');
mount('/agent-sync',      'agents',      '../../api/agent-sync');

// ── Runtime ─────────────────────────────────────────────────────────────────
mount('/runtime',         'runtime',     '../../api/runtime');

// ── Nexus ───────────────────────────────────────────────────────────────────
// Both nexus files mounted without gate — register/cli need public access
try { router.use('/nexus', require('../../api/nexus')); }
catch (e) { console.warn('[AGENTS] Skip /nexus (api):', e.message); }
try { router.use('/nexus', require('../../app/custom/api/nexus')); }
catch (e) { console.warn('[AGENTS] Skip /nexus (custom):', e.message); }
mount('/nexus/routing',   'nexus',       '../../api/nexus-routing');

// ── Marketplace ─────────────────────────────────────────────────────────────
mount('/marketplace',     'marketplace', '../../app/custom/api/marketplace');

// ── Swarm ───────────────────────────────────────────────────────────────────
mount('/swarm',           'swarm',       '../../app/custom/api/swarm');

// ── LLM ─────────────────────────────────────────────────────────────────────
mount('/llm',             'llm',         '../../app/custom/api/llm');
mount('/llm/router',      'llm',         '../../api/llm-router');
mount('/llm/validate',    'llm',         '../../api/llm-validate');

// ── Tools ───────────────────────────────────────────────────────────────────
mount('/tools',           'tools',       '../../app/custom/api/tools');

// ── Templates ───────────────────────────────────────────────────────────────
mount('/templates',       'templates',   '../../api/templates');

// ── Sandbox ─────────────────────────────────────────────────────────────────
mount('/sandbox',           'sandbox',       '../../api/sandbox');
mount('/sandbox/workspace', 'cloud_sandbox', '../../api/sandbox-workspace');

// ── Deployments ─────────────────────────────────────────────────────────────
mount('/deployments',     'deployments', '../../api/deployments');
mount('/provisioning',    'deployments', '../../api/provisioning');

// ── Automations ─────────────────────────────────────────────────────────────
mount('/automations',     'automations', '../../api/automations');
mount('/automation-logs', 'automations', '../../api/automation-logs-routes');

// ── Knowledge ───────────────────────────────────────────────────────────────
mount('/knowledge',       'knowledge',   '../../api/knowledge');

// ── Memory ──────────────────────────────────────────────────────────────────
// api/memory.js handles /agents/:agentId/memories and /memory/promote
mount('/',                'agents',      '../../api/memory');
mount('/memory',          'agents',      '../../app/custom/api/memory');

// ── Runbooks ─────────────────────────────────────────────────────────────────
mount('/runbooks',        'agents',      '../../app/custom/api/runbooks');

// ── Snipara ─────────────────────────────────────────────────────────────────
mount('/snipara',         'agents',      '../../api/snipara');
mount('/snipara/admin',   'agents',      '../../api/sniparaAdmin');
mount('/snipara/webhook', 'agents',      '../../api/sniparaWebhook');

// ── Local Agent ─────────────────────────────────────────────────────────────
mount('/local-agent',     'agents',      '../../api/local-agent');

// ── VPS ─────────────────────────────────────────────────────────────────────
mount('/vps',             'agents',      '../../api/vps');

// ── Email ────────────────────────────────────────────────────────────────────
mount('/email/routes',    'agents',      '../../api/email-routes');
mount('/email/domains',   'agents',      '../../api/email-domains');
mount('/email/groups',    'agents',      '../../api/email-groups');

module.exports = router;
