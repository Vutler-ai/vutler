'use strict';

/**
 * Jira Webhook Receiver
 *
 * Receives events from Jira Cloud and syncs relevant changes to Vutler.
 *
 * To register this webhook in Jira:
 *   Jira Settings > System > WebHooks → POST https://app.vutler.ai/api/v1/webhooks/jira
 *   Events: Issue Created, Issue Updated, Comment Created
 *
 * Security: Jira Cloud webhooks do NOT support HMAC signatures.
 * We validate using a shared secret passed as a query param:
 *   ?secret=<JIRA_WEBHOOK_SECRET>
 *
 * Set JIRA_WEBHOOK_SECRET env var on the server. If not set, the endpoint
 * remains open (acceptable for non-production; add IP allowlist at reverse proxy).
 */

const express = require('express');
const pool = require('../../lib/vaultbrix');

const router = express.Router();

const SCHEMA = 'tenant_vutler';
const JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET || '';

// Jira event → Vutler action mapping
const EVENT_MAP = {
  'jira:issue_created': 'issue_created',
  'jira:issue_updated': 'issue_updated',
  'jira:issue_deleted': 'issue_deleted',
  'comment_created': 'comment_added',
  'comment_updated': 'comment_updated',
};

// POST /api/v1/webhooks/jira
router.post('/', express.json({ limit: '512kb' }), async (req, res) => {
  // Validate shared secret (if configured)
  if (JIRA_WEBHOOK_SECRET) {
    const provided = req.query.secret || req.headers['x-jira-webhook-secret'];
    if (provided !== JIRA_WEBHOOK_SECRET) {
      console.warn('[JIRA WEBHOOK] Rejected: invalid secret');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  }

  // Jira webhook payload shape:
  // { webhookEvent, issue, comment, changelog, ... }
  const eventName = payload.webhookEvent;
  const vutlerAction = EVENT_MAP[eventName];

  if (!vutlerAction) {
    // Unknown event type — acknowledge and ignore
    console.log(`[JIRA WEBHOOK] Ignored unknown event: ${eventName}`);
    return res.json({ success: true, ignored: true, event: eventName });
  }

  const issue = payload.issue;
  const issueKey = issue?.key;
  const projectKey = issue?.fields?.project?.key;

  console.log(`[JIRA WEBHOOK] Event: ${eventName} | Issue: ${issueKey || 'n/a'}`);

  try {
    // Find which workspace(s) have Jira connected and match this project
    const wsResult = await pool.query(
      `SELECT workspace_id, credentials
       FROM ${SCHEMA}.workspace_integrations
       WHERE provider = 'jira' AND connected = TRUE AND status = 'connected'`
    );

    for (const row of wsResult.rows) {
      const creds = row.credentials || {};
      // Check that this event is for an issue in a project accessible to this workspace.
      // (We can't do fine-grained filtering without storing project allowlists, so we
      // log all events for all connected workspaces — agent logic filters further.)
      try {
        await logJiraEvent(row.workspace_id, {
          event: vutlerAction,
          issueKey,
          projectKey,
          summary: issue?.fields?.summary,
          status: issue?.fields?.status?.name,
          assignee: issue?.fields?.assignee?.accountId,
          comment: payload.comment?.body,
          rawEvent: eventName,
        });
      } catch (logErr) {
        console.error(`[JIRA WEBHOOK] Log error for workspace ${row.workspace_id}:`, logErr.message);
      }
    }

    res.json({ success: true, event: vutlerAction, issueKey });
  } catch (err) {
    console.error('[JIRA WEBHOOK] Processing error:', err.message);
    // Always return 200 to prevent Jira from retrying bad payloads
    res.json({ success: false, error: err.message });
  }
});

/**
 * Persist a Jira event to workspace_integration_logs.
 * Agents can poll these logs to react to Jira changes.
 */
async function logJiraEvent(workspaceId, data) {
  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_integration_logs
      (workspace_id, provider, action, status, payload)
     VALUES ($1, 'jira', $2, 'success', $3::jsonb)`,
    [workspaceId, data.event, JSON.stringify(data)]
  );
}

module.exports = router;
