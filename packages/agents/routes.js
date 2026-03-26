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

// ── Agents ──────────────────────────────────────────────────────────────────
mount('/agents',          'agents',      '../../app/custom/api/agents');
mount('/agent-runtime',   'agents',      '../../app/custom/api/runtime');
mount('/agent-sync',      'agents',      '../../api/agent-sync');

// ── Runtime ─────────────────────────────────────────────────────────────────
mount('/runtime',         'runtime',     '../../api/runtime');

// ── Nexus ───────────────────────────────────────────────────────────────────
// Mount nexus WITHOUT feature gate — register/cli need public access,
// and all other endpoints check auth internally
try { router.use('/nexus', require('../../app/custom/api/nexus')); }
catch (e) { console.warn('[AGENTS] Skip /nexus:', e.message); }
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
mount('/sandbox',         'sandbox',     '../../api/sandbox');

// ── Deployments ─────────────────────────────────────────────────────────────
mount('/deployments',     'deployments', '../../api/deployments');
mount('/provisioning',    'deployments', '../../api/provisioning');

// ── Automations ─────────────────────────────────────────────────────────────
mount('/automations',     'automations', '../../api/automations');
mount('/automation-logs', 'automations', '../../api/automation-logs-routes');

// ── Knowledge ───────────────────────────────────────────────────────────────
mount('/knowledge',       'knowledge',   '../../api/knowledge');

// ── Memory ──────────────────────────────────────────────────────────────────
mount('/memory',          'agents',      '../../app/custom/api/memory');

// ── Snipara ─────────────────────────────────────────────────────────────────
mount('/snipara',         'agents',      '../../api/snipara');
mount('/snipara/admin',   'agents',      '../../api/sniparaAdmin');
mount('/snipara/webhook', 'agents',      '../../api/sniparaWebhook');

// ── Local Agent ─────────────────────────────────────────────────────────────
mount('/local-agent',     'agents',      '../../api/local-agent');

// ── VPS ─────────────────────────────────────────────────────────────────────
mount('/vps',             'agents',      '../../api/vps');

module.exports = router;
