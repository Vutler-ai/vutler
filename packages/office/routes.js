'use strict';

/**
 * Office routes bundle
 *
 * NOTE: Some modules define routes with FULL paths (e.g. /chat/channels, /drive/files)
 * while others use RELATIVE paths (e.g. /, /:id).
 * Full-path modules must be mounted at '/' to avoid double-prefixing.
 * Relative-path modules are mounted at their prefix (e.g. /calendar).
 */

const { Router } = require('express');
const { gateFeature } = require('../core/middleware/featureGate');

const router = Router();

// Mount with prefix (for relative-path modules like /calendar → GET /)
function mount(path, gate, modulePath) {
  try {
    router.use(path, gateFeature(gate), require(modulePath));
  } catch (e) {
    console.warn(`[OFFICE] Skip ${path}: ${e.message}`);
  }
}

// Mount at root (for full-path modules like /chat/channels, /drive/files)
function mountRoot(gate, modulePath, label) {
  try {
    router.use('/', gateFeature(gate), require(modulePath));
  } catch (e) {
    console.warn(`[OFFICE] Skip ${label}: ${e.message}`);
  }
}

// ── Chat (full-path: /chat/channels, /chat/send, etc.) ──────────────────────
mountRoot('chat', '../../app/custom/api/chat', 'chat');
mount('/vchat', 'chat', '../../api/vchat');

// ── Drive (full-path: /drive/files, /drive/upload, etc.) ────────────────────
mountRoot('drive', '../../app/custom/api/drive', 'drive');
mount('/drive-s3', 'drive', '../../app/custom/api/drive-s3');
mount('/drive-chat', 'drive', '../../api/drive-chat');
// vdrive (legacy encrypted drive) removed — use /drive (S3-backed)

// ── Email (full-path: /email, /email/send) ──────────────────────────────────
mountRoot('email', '../../app/custom/api/email', 'email');
mount('/email/vaultbrix', 'email', '../../api/email-vaultbrix');
mount('/emails', 'email', '../../api/emails');

// ── Agent Email System ───────────────────────────────────────────────────────
mount('/email/domains', 'email', '../../api/email-domains');
mount('/email/routes', 'email', '../../api/email-routes');
mount('/email/groups', 'email', '../../api/email-groups');

// ── Tasks (full-path: /tasks-v2, /tasks-v2/:id) ────────────────────────────
mountRoot('tasks', '../../app/custom/api/tasks-v2', 'tasks-v2');
mount('/task-router', 'tasks', '../../api/tasks-router');

// ── Calendar (relative: /, /events, /events/:id) ───────────────────────────
mount('/calendar', 'calendar', '../../api/calendar');

// ── Integrations (relative: /) ──────────────────────────────────────────────
mount('/integrations', 'integrations', '../../api/integrations');
mount('/providers', 'providers', '../../api/providers');

// ── Jira ────────────────────────────────────────────────────────────────────
mount('/jira', 'integrations', '../../api/jira');

// ── Dashboard ───────────────────────────────────────────────────────────────
mount('/dashboard', 'dashboard', '../../api/dashboard');

// ── Goals ───────────────────────────────────────────────────────────────────
mount('/goals', 'goals', '../../api/goals');

// ── UI Pack ─────────────────────────────────────────────────────────────────
mount('/ui-pack', 'dashboard', '../../app/custom/api/ui-pack');

module.exports = router;
