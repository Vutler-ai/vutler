/**
 * Webhook Routes
 */
const express = require("express");
const router = express.Router();

// Snipara task/htask webhooks (closed-loop orchestration)
router.use('/snipara', require('./sniparaWebhook'));

// Jira Cloud event webhooks (issue created/updated, comments)
router.use('/jira', require('./webhooks/jira'));
router.use('/enterprise', require('./webhooks/enterprise'));

module.exports = router;
