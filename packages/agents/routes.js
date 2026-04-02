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
mount('/nexus-enterprise', 'nexus', '../../api/nexus-enterprise');
mount('/browser-operator', 'agents', '../../api/browser-operator');
mount('/nexus/routing',   'nexus',       '../../api/nexus-routing');

// ── Marketplace ─────────────────────────────────────────────────────────────
mount('/marketplace',     'marketplace', '../../app/custom/api/marketplace');

// ── Swarm ───────────────────────────────────────────────────────────────────
mount('/swarm',           'swarm',       '../../app/custom/api/swarm');
mount('/orchestration',   'agents',      '../../app/custom/api/orchestration');

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

// ── Automations ─────────────────────────────────────────────────────────────
mount('/automations',     'automations', '../../api/automations');
mount('/automation-logs', 'automations', '../../api/automation-logs-routes');

// ── Knowledge ───────────────────────────────────────────────────────────────
mount('/knowledge',       'knowledge',   '../../api/knowledge');

// ── Memory ──────────────────────────────────────────────────────────────────
// Mounted centrally in index.js because the same router serves both:
//   /api/v1/agents/:id/memories
//   /api/v1/memory/*

// ── Snipara ─────────────────────────────────────────────────────────────────
mount('/snipara',         'agents',      '../../api/snipara');
mount('/snipara/admin',   'agents',      '../../api/sniparaAdmin');
mount('/snipara/webhook', 'agents',      '../../api/sniparaWebhook');

// ── VPS ─────────────────────────────────────────────────────────────────────
if (String(process.env.VPS_MANAGED_ENABLED || '').toLowerCase() === 'true') {
  mount('/vps', 'agents', '../../api/vps');
}

module.exports = router;
