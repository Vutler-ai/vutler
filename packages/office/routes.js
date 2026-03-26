'use strict';

/**
 * Office routes bundle
 * Mounts all Office feature routers under a single Express Router.
 * Each route is wrapped with the featureGate middleware.
 *
 * Prefers app/custom/api/ versions (newer) over api/ where both exist.
 */

const { Router } = require('express');
const { gateFeature } = require('../core/middleware/featureGate');

const router = Router();

// ── Chat ──────────────────────────────────────────────────────────────────────
// Prefer custom version
router.use('/chat', gateFeature('chat'), require('../../app/custom/api/chat'));

// ── Drive ─────────────────────────────────────────────────────────────────────
// Prefer custom version (S3-backed)
router.use('/drive', gateFeature('drive'), require('../../app/custom/api/drive'));
router.use('/drive-s3', gateFeature('drive'), require('../../app/custom/api/drive-s3'));

// Drive-chat integration (legacy, no custom replacement)
router.use('/drive-chat', gateFeature('drive'), require('../../api/drive-chat'));

// ── Email ─────────────────────────────────────────────────────────────────────
// Prefer custom version; legacy /api/email.js is a deprecated redirect stub
router.use('/email', gateFeature('email'), require('../../app/custom/api/email'));

// Vaultbrix email (PostgreSQL + Postal SMTP)
router.use('/email/vaultbrix', gateFeature('email'), require('../../api/email-vaultbrix'));

// Emails list endpoint (separate route)
router.use('/emails', gateFeature('email'), require('../../api/emails'));

// ── Tasks ─────────────────────────────────────────────────────────────────────
// Prefer custom v2
router.use('/tasks', gateFeature('tasks'), require('../../app/custom/api/tasks-v2'));

// Legacy tasks router (Snipara-backed)
router.use('/task-router', gateFeature('tasks'), require('../../api/tasks-router'));

// Task router sync (Snipara webhook)
router.use('/task-router/sync', gateFeature('tasks'), require('../../api/task-router-sync'));

// Task assignment
router.use('/tasks/assignment', gateFeature('tasks'), require('../../api/task-assignment'));

// ── Calendar ──────────────────────────────────────────────────────────────────
router.use('/calendar', gateFeature('calendar'), require('../../api/calendar'));

// ── Integrations ─────────────────────────────────────────────────────────────
router.use('/integrations', gateFeature('integrations'), require('../../api/integrations'));

// ── Providers ─────────────────────────────────────────────────────────────────
router.use('/providers', gateFeature('integrations'), require('../../api/providers'));

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.use('/dashboard', gateFeature('dashboard'), require('../../api/dashboard'));

// ── VDrive (encrypted drive) ──────────────────────────────────────────────────
router.use('/vdrive', gateFeature('drive'), require('../../api/vdrive'));

// ── VChat ─────────────────────────────────────────────────────────────────────
router.use('/vchat', gateFeature('chat'), require('../../api/vchat'));

// ── WhatsApp mirror ───────────────────────────────────────────────────────────
router.use('/whatsapp', gateFeature('whatsapp'), require('../../app/custom/api/whatsapp-mirror'));

// ── Goals ─────────────────────────────────────────────────────────────────────
router.use('/goals', gateFeature('goals'), require('../../api/goals'));

// ── UI pack ───────────────────────────────────────────────────────────────────
// Note: ui-pack exports module.exports = router (with an extra _test property)
router.use('/ui-pack', gateFeature('dashboard'), require('../../app/custom/api/ui-pack'));

// ws-chat is a WebSocket utility (exports setupChatWebSocket / publishMessage),
// not an HTTP router — mount it via your WebSocket server setup, not here.

module.exports = router;
