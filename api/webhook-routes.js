/**
 * Webhook Routes
 */
const express = require("express");
const router = express.Router();

// Snipara task/htask webhooks (closed-loop orchestration)
router.use('/snipara', require('./sniparaWebhook'));

module.exports = router;
