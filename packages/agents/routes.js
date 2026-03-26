'use strict';

/**
 * Agents routes bundle
 * Mounts all Agents feature routers under a single Express Router.
 * Each route group is wrapped with the featureGate middleware.
 *
 * Prefers app/custom/api/ versions (newer) over api/ where both exist.
 */

const { Router } = require('express');
const { gateFeature } = require('../core/middleware/featureGate');

const router = Router();

// ── Agents ────────────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/agents', gateFeature('agents'), require('../../app/custom/api/agents'));

// Agent runtime (custom version preferred)
router.use('/agent-runtime', gateFeature('agents'), require('../../app/custom/api/runtime'));

// Agent sync (no custom replacement — legacy api/)
router.use('/agent-sync', gateFeature('agents'), require('../../api/agent-sync'));

// ── Runtime ───────────────────────────────────────────────────────────────────
// Prefer custom version (app/custom/api/runtime.js also covers this)
// api/runtime.js provides additional endpoints not in custom version
router.use('/runtime', gateFeature('runtime'), require('../../api/runtime'));

// ── Nexus ─────────────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/nexus', gateFeature('nexus'), require('../../app/custom/api/nexus'));

// Nexus routing (no custom replacement)
router.use('/nexus/routing', gateFeature('nexus'), require('../../api/nexus-routing'));

// ── Marketplace ───────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/marketplace', gateFeature('marketplace'), require('../../app/custom/api/marketplace'));

// ── Swarm ─────────────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/swarm', gateFeature('swarm'), require('../../app/custom/api/swarm'));

// ── LLM ───────────────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/llm', gateFeature('llm'), require('../../app/custom/api/llm'));

// LLM router (provider-level routing; no custom replacement)
router.use('/llm/router', gateFeature('llm'), require('../../api/llm-router'));

// LLM validate (input validation; no custom replacement)
router.use('/llm/validate', gateFeature('llm'), require('../../api/llm-validate'));

// ── Tools ─────────────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/tools', gateFeature('tools'), require('../../app/custom/api/tools'));

// ── Templates ─────────────────────────────────────────────────────────────────
router.use('/templates', gateFeature('templates'), require('../../api/templates'));

// ── Sandbox ───────────────────────────────────────────────────────────────────
router.use('/sandbox', gateFeature('sandbox'), require('../../api/sandbox'));

// ── Deployments ───────────────────────────────────────────────────────────────
router.use('/deployments', gateFeature('deployments'), require('../../api/deployments'));

// ── Provisioning ──────────────────────────────────────────────────────────────
router.use('/provisioning', gateFeature('deployments'), require('../../api/provisioning'));

// ── Automations ───────────────────────────────────────────────────────────────
router.use('/automations', gateFeature('automations'), require('../../api/automations'));

// Automation logs
router.use('/automation-logs', gateFeature('automations'), require('../../api/automation-logs-routes'));

// ── Knowledge ─────────────────────────────────────────────────────────────────
router.use('/knowledge', gateFeature('knowledge'), require('../../api/knowledge'));

// ── Memory ────────────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/memory', gateFeature('agents'), require('../../app/custom/api/memory'));

// ── Snipara ───────────────────────────────────────────────────────────────────
router.use('/snipara', gateFeature('agents'), require('../../api/snipara'));
router.use('/snipara/admin', gateFeature('agents'), require('../../api/sniparaAdmin'));
router.use('/snipara/webhook', gateFeature('agents'), require('../../api/sniparaWebhook'));

// ── Local Agent ───────────────────────────────────────────────────────────────
router.use('/local-agent', gateFeature('agents'), require('../../api/local-agent'));

// ── VPS ───────────────────────────────────────────────────────────────────────
router.use('/vps', gateFeature('agents'), require('../../api/vps'));

module.exports = router;
