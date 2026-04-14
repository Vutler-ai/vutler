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
const crypto = require('crypto');
const pool = require('../../lib/vaultbrix');

const router = express.Router();

const SCHEMA = 'tenant_vutler';
const JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET || '';

function timingSafeEqualString(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.origin.toLowerCase();
  } catch (_) {
    return null;
  }
}

function extractPayloadOrigin(payload) {
  const candidates = [
    payload?.issue?.self,
    payload?.issue?.fields?.project?.self,
    payload?.comment?.self,
    payload?.user?.self,
  ];
  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin) return origin;
  }
  return null;
}

function extractWorkspaceJiraOrigin(row) {
  return normalizeOrigin(
    row?.config?.baseUrl
    || row?.credentials?.baseUrl
    || null
  );
}

function extractWorkspaceProjectKeys(row) {
  const projectKeys = Array.isArray(row?.config?.projectKeys)
    ? row.config.projectKeys
    : [];
  return Array.from(new Set(
    projectKeys
      .map((value) => String(value || '').trim().toUpperCase())
      .filter(Boolean)
  ));
}

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
  if (!JIRA_WEBHOOK_SECRET) {
    console.error('[JIRA WEBHOOK] Rejected: JIRA_WEBHOOK_SECRET is not configured');
    return res.status(503).json({ success: false, error: 'Webhook not configured' });
  }
  const provided = req.query.secret || req.headers['x-jira-webhook-secret'];
  if (!timingSafeEqualString(provided, JIRA_WEBHOOK_SECRET)) {
    console.warn('[JIRA WEBHOOK] Rejected: invalid secret');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
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
  const jiraOrigin = extractPayloadOrigin(payload);
  const normalizedProjectKey = String(projectKey || '').trim().toUpperCase();

  console.log(`[JIRA WEBHOOK] Event: ${eventName} | Issue: ${issueKey || 'n/a'}`);

  try {
    if (!jiraOrigin) {
      console.warn('[JIRA WEBHOOK] Ignored event with no Jira origin in payload');
      return res.json({ success: true, ignored: true, reason: 'missing_origin' });
    }

    const wsResult = await pool.query(
      `SELECT workspace_id, credentials, config
       FROM ${SCHEMA}.workspace_integrations
       WHERE provider = 'jira' AND connected = TRUE AND status = 'connected'`
    );

    const candidateRows = wsResult.rows.filter((row) => {
      const workspaceOrigin = extractWorkspaceJiraOrigin(row);
      if (!workspaceOrigin || workspaceOrigin !== jiraOrigin) {
        return false;
      }

      const projectKeys = extractWorkspaceProjectKeys(row);
      if (!projectKeys.length) {
        return true;
      }

      return Boolean(normalizedProjectKey) && projectKeys.includes(normalizedProjectKey);
    });

    if (!candidateRows.length) {
      console.warn(`[JIRA WEBHOOK] Ignored unmatched event for ${jiraOrigin} (${projectKey || 'no-project'})`);
      return res.json({ success: true, ignored: true, reason: 'no_matching_workspace' });
    }

    if (candidateRows.length > 1) {
      console.warn(`[JIRA WEBHOOK] Ignored ambiguous event for ${jiraOrigin} (${projectKey || 'no-project'})`);
      return res.json({ success: true, ignored: true, reason: 'ambiguous_workspace_match' });
    }

    for (const row of candidateRows) {
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
