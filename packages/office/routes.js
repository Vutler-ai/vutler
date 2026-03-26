'use strict';

/**
 * Office routes bundle
 * Mounts all Office feature routers under a single Express Router.
 * Uses safe mount to prevent one broken route from crashing the server.
 */

const { Router } = require('express');
const { gateFeature } = require('../core/middleware/featureGate');

const router = Router();

function mount(path, gate, modulePath) {
  try {
    router.use(path, gateFeature(gate), require(modulePath));
  } catch (e) {
    console.warn(`[OFFICE] Skip ${path}: ${e.message}`);
  }
}

// ── Chat ────────────────────────────────────────────────────────────────────
mount('/chat',              'chat',         '../../app/custom/api/chat');
mount('/vchat',             'chat',         '../../api/vchat');

// ── Drive ───────────────────────────────────────────────────────────────────
mount('/drive',             'drive',        '../../app/custom/api/drive');
mount('/drive-s3',          'drive',        '../../app/custom/api/drive-s3');
mount('/drive-chat',        'drive',        '../../api/drive-chat');
mount('/vdrive',            'drive',        '../../api/vdrive');

// ── Email ───────────────────────────────────────────────────────────────────
mount('/email',             'email',        '../../app/custom/api/email');
mount('/email/vaultbrix',   'email',        '../../api/email-vaultbrix');
mount('/emails',            'email',        '../../api/emails');

// ── Tasks ───────────────────────────────────────────────────────────────────
mount('/tasks',             'tasks',        '../../app/custom/api/tasks-v2');
mount('/task-router',       'tasks',        '../../api/tasks-router');
mount('/task-router/sync',  'tasks',        '../../api/task-router-sync');
mount('/tasks/assignment',  'tasks',        '../../api/task-assignment');

// ── Calendar ────────────────────────────────────────────────────────────────
mount('/calendar',          'calendar',     '../../api/calendar');

// ── Integrations ────────────────────────────────────────────────────────────
mount('/integrations',      'integrations', '../../api/integrations');
mount('/providers',         'integrations', '../../api/providers');

// ── Dashboard ───────────────────────────────────────────────────────────────
mount('/dashboard',         'dashboard',    '../../api/dashboard');

// ── WhatsApp ────────────────────────────────────────────────────────────────
mount('/whatsapp',          'whatsapp',     '../../app/custom/api/whatsapp-mirror');

// ── Goals ───────────────────────────────────────────────────────────────────
mount('/goals',             'goals',        '../../api/goals');

// ── UI Pack ─────────────────────────────────────────────────────────────────
mount('/ui-pack',           'dashboard',    '../../app/custom/api/ui-pack');

module.exports = router;
