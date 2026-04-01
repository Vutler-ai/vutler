'use strict';

const pool = require('../../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';

async function resolveAgentEmail(workspaceId, options = {}) {
  if (options.agentEmail) return String(options.agentEmail).trim().toLowerCase();
  if (!options.agentId) return null;

  const result = await pool.query(
    `SELECT email
       FROM ${SCHEMA}.agents
      WHERE (id::text = $1 OR username = $1)
        AND workspace_id = $2
      LIMIT 1`,
    [options.agentId, workspaceId]
  );
  return result.rows[0]?.email ? String(result.rows[0].email).trim().toLowerCase() : null;
}

async function waitForAgentEmail(workspaceId, options = {}) {
  const agentEmail = await resolveAgentEmail(workspaceId, options);
  if (!agentEmail) {
    const error = new Error('Agent email is required to consume mailbox-based authentication');
    error.code = 'AGENT_EMAIL_REQUIRED';
    throw error;
  }

  const timeoutMs = Number(options.timeoutMs) || 15000;
  const pollIntervalMs = Number(options.pollIntervalMs) || 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const result = await pool.query(
      `SELECT id, subject, body, html_body, from_addr, to_addr, created_at
         FROM ${SCHEMA}.emails
        WHERE workspace_id = $1
          AND LOWER(COALESCE(to_addr, '')) = $2
        ORDER BY created_at DESC
        LIMIT 25`,
      [workspaceId, agentEmail]
    );

    const matched = result.rows.find((row) => {
      const subject = String(row.subject || '').toLowerCase();
      const body = String(row.body || row.html_body || '').toLowerCase();
      const subjectIncludes = String(options.subjectIncludes || '').trim().toLowerCase();
      const bodyIncludes = String(options.bodyIncludes || '').trim().toLowerCase();
      if (subjectIncludes && !subject.includes(subjectIncludes)) return false;
      if (bodyIncludes && !body.includes(bodyIncludes)) return false;
      return true;
    });

    if (matched) {
      return {
        agentEmail,
        email: matched,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const error = new Error(`No matching email received for ${agentEmail}`);
  error.code = 'EMAIL_NOT_FOUND';
  throw error;
}

function extractMagicLink(email, allowedHostname = null) {
  const content = `${email?.html_body || ''}\n${email?.body || ''}`;
  const matches = String(content).match(/https?:\/\/[^\s"'<>]+/g) || [];
  const normalized = matches.map((entry) => entry.replace(/[)>.,]+$/, ''));
  if (!allowedHostname) return normalized[0] || null;
  return normalized.find((entry) => {
    try {
      return new URL(entry).hostname === allowedHostname;
    } catch (_) {
      return false;
    }
  }) || null;
}

function extractEmailCode(email, pattern) {
  const content = `${email?.body || ''}\n${email?.html_body || ''}`;
  const regex = pattern ? new RegExp(pattern, 'i') : /\b(\d{6})\b/;
  const match = String(content).match(regex);
  if (!match) return null;
  return match[1] || match[0] || null;
}

module.exports = {
  resolveAgentEmail,
  waitForAgentEmail,
  extractMagicLink,
  extractEmailCode,
};
