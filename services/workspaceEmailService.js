'use strict';

const { getPlan } = require('../packages/core/middleware/featureGate');
const { getWorkspacePlanId } = require('./workspacePlanService');

const SCHEMA = 'tenant_vutler';
const FALLBACK_DOMAIN_SUFFIX = process.env.VUTLER_FALLBACK_DOMAIN_SUFFIX || 'vutler.ai';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getPlanContext(planId) {
  const plan = getPlan(planId);
  return {
    plan,
    features: new Set(Array.isArray(plan?.features) ? plan.features : []),
    products: new Set(Array.isArray(plan?.products) ? plan.products : []),
  };
}

function hasManagedAgentEmailAccess(planId) {
  const { features, products } = getPlanContext(planId);
  return features.has('*') || features.has('email') || products.has('office') || products.has('agents');
}

function hasMailboxAdminAccess(planId) {
  const { features, products } = getPlanContext(planId);
  return features.has('*') || features.has('email') || products.has('office');
}

function hasCustomDomainAccess(planId) {
  return hasMailboxAdminAccess(planId);
}

async function resolveWorkspaceEmailEntitlements(db, workspaceId) {
  const planId = await getWorkspacePlanId(db, workspaceId).catch(() => 'free');
  return {
    planId,
    managedAgentEmail: hasManagedAgentEmailAccess(planId),
    mailboxAdmin: hasMailboxAdminAccess(planId),
    customDomains: hasCustomDomainAccess(planId),
  };
}

async function requireManagedAgentEmailAccess(db, workspaceId) {
  const entitlements = await resolveWorkspaceEmailEntitlements(db, workspaceId);
  if (!entitlements.managedAgentEmail) {
    throw createError(`Managed agent email is not available on the "${entitlements.planId}" plan.`, 403);
  }
  return entitlements;
}

async function requireMailboxAdminAccess(db, workspaceId) {
  const entitlements = await resolveWorkspaceEmailEntitlements(db, workspaceId);
  if (!entitlements.mailboxAdmin) {
    throw createError(`Email management is not available on the "${entitlements.planId}" plan.`, 403);
  }
  return entitlements;
}

async function requireCustomDomainAccess(db, workspaceId) {
  const entitlements = await resolveWorkspaceEmailEntitlements(db, workspaceId);
  if (!entitlements.customDomains) {
    throw createError(`Custom email domains are not available on the "${entitlements.planId}" plan.`, 403);
  }
  return entitlements;
}

function normalizeDomain(domain) {
  return String(domain || '').trim().toLowerCase();
}

function parseEmailDomain(address) {
  const value = String(address || '').trim().toLowerCase();
  const atIndex = value.lastIndexOf('@');
  return atIndex > -1 ? value.slice(atIndex + 1) : null;
}

async function getWorkspaceFallbackDomain(db, workspaceId) {
  try {
    const result = await db.query(
      `SELECT slug FROM ${SCHEMA}.workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    if (result.rows[0]?.slug) return `${result.rows[0].slug}.${FALLBACK_DOMAIN_SUFFIX}`;
  } catch (_) {
    void 0;
  }

  return `workspace.${FALLBACK_DOMAIN_SUFFIX}`;
}

async function findVerifiedCustomDomain(db, workspaceId, requestedDomain = null) {
  const normalizedDomain = normalizeDomain(requestedDomain);
  const clauses = ['workspace_id = $1', 'mx_verified = true', 'spf_verified = true'];
  const params = [workspaceId];

  if (normalizedDomain) {
    clauses.push('LOWER(domain) = $2');
    params.push(normalizedDomain);
  }

  const result = await db.query(
    `SELECT domain
       FROM ${SCHEMA}.workspace_domains
      WHERE ${clauses.join(' AND ')}
      ORDER BY verified_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}

async function isWorkspaceCustomDomain(db, workspaceId, domain) {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return false;

  const result = await db.query(
    `SELECT 1
       FROM ${SCHEMA}.workspace_domains
      WHERE workspace_id = $1
        AND LOWER(domain) = $2
      LIMIT 1`,
    [workspaceId, normalizedDomain]
  );

  return result.rows.length > 0;
}

async function resolveWorkspaceEmailDomain(db, workspaceId, options = {}) {
  const { requestedDomain = null, entitlements = null } = options;
  const policy = entitlements || await resolveWorkspaceEmailEntitlements(db, workspaceId);
  const normalizedDomain = normalizeDomain(requestedDomain);
  const fallbackDomain = await getWorkspaceFallbackDomain(db, workspaceId);

  if (normalizedDomain) {
    if (normalizedDomain === normalizeDomain(fallbackDomain)) {
      return fallbackDomain;
    }

    if (!policy.customDomains) {
      throw createError(`Custom email domains are not available on the "${policy.planId}" plan.`, 403);
    }

    const domainRow = await findVerifiedCustomDomain(db, workspaceId, normalizedDomain);
    if (!domainRow) {
      throw createError('Custom domain is not verified for this workspace.', 400);
    }

    return domainRow.domain;
  }

  if (policy.customDomains) {
    const domainRow = await findVerifiedCustomDomain(db, workspaceId);
    if (domainRow?.domain) return domainRow.domain;
  }

  return fallbackDomain;
}

async function findScopedAgentByRef(db, workspaceId, agentRef, columns = 'id, name, email, username') {
  const ref = String(agentRef || '').trim();
  if (!ref) return null;

  const result = await db.query(
    `SELECT ${columns}
       FROM ${SCHEMA}.agents
      WHERE workspace_id = $2
        AND (id::text = $1 OR username = $1)
      LIMIT 1`,
    [ref, workspaceId]
  );

  return result.rows[0] || null;
}

async function resolveSenderAddress({
  db,
  workspaceId,
  explicitFrom = null,
  agentRef = null,
  fallbackUserEmail = null,
  defaultDomain = FALLBACK_DOMAIN_SUFFIX,
}) {
  if (explicitFrom) return explicitFrom;

  if (agentRef) {
    const agent = await findScopedAgentByRef(db, workspaceId, agentRef, 'id, email');
    if (!agent) {
      throw createError('Agent not found in this workspace.', 404);
    }
    if (agent.email) return agent.email;
  }

  return fallbackUserEmail || `noreply@${defaultDomain}`;
}

async function updateEmailReadState(db, workspaceId, emailId, isRead) {
  const result = await db.query(
    `UPDATE ${SCHEMA}.emails
        SET is_read = $1
      WHERE id = $2
        AND workspace_id = $3
    RETURNING id, is_read`,
    [Boolean(isRead), emailId, workspaceId]
  );

  if (!result.rows[0]) {
    throw createError('Email not found', 404);
  }

  return result.rows[0];
}

async function toggleEmailFlag(db, workspaceId, emailId) {
  const result = await db.query(
    `UPDATE ${SCHEMA}.emails
        SET flagged = NOT COALESCE(flagged, false)
      WHERE id = $1
        AND workspace_id = $2
    RETURNING id, flagged`,
    [emailId, workspaceId]
  );

  if (!result.rows[0]) {
    throw createError('Email not found', 404);
  }

  return result.rows[0];
}

async function moveEmailToFolder(db, workspaceId, emailId, folder) {
  const result = await db.query(
    `UPDATE ${SCHEMA}.emails
        SET folder = $1
      WHERE id = $2
        AND workspace_id = $3
    RETURNING id, folder`,
    [folder, emailId, workspaceId]
  );

  if (!result.rows[0]) {
    throw createError('Email not found', 404);
  }

  return result.rows[0];
}

async function assignEmailToAgent(db, workspaceId, emailId, agentRef) {
  const agent = await findScopedAgentByRef(db, workspaceId, agentRef, 'id, name');
  if (!agent) {
    throw createError('Agent not found in this workspace.', 404);
  }

  const result = await db.query(
    `UPDATE ${SCHEMA}.emails
        SET agent_id = $1
      WHERE id = $2
        AND workspace_id = $3
    RETURNING id, agent_id`,
    [agent.id, emailId, workspaceId]
  );

  if (!result.rows[0]) {
    throw createError('Email not found', 404);
  }

  return {
    emailId: result.rows[0].id,
    agentId: agent.id,
    agentName: agent.name,
  };
}

async function processInboundEmail({ db, payload, sendViaPostal, logger = console }) {
  if (!db) {
    logger.warn?.('[EMAIL/INCOMING] No DB pool available');
    return { accepted: false, reason: 'no_db' };
  }

  const recipient = String(payload?.rcpt_to || payload?.to || '').trim().toLowerCase();
  const sender = String(payload?.mail_from || payload?.from || '').trim();
  const subject = String(payload?.subject || '(no subject)');
  const body = String(payload?.plain_body || payload?.body || '');
  const htmlBody = payload?.html_body || null;

  if (!recipient) {
    logger.warn?.('[EMAIL/INCOMING] Missing recipient');
    return { accepted: false, reason: 'missing_recipient' };
  }

  const directRoute = await db.query(
    `SELECT agent_id, auto_reply, approval_required, workspace_id
       FROM ${SCHEMA}.email_routes
      WHERE LOWER(email_address) = $1
      LIMIT 1`,
    [recipient]
  ).then((result) => result.rows[0] || null);

  if (directRoute) {
    const entitlements = await resolveWorkspaceEmailEntitlements(db, directRoute.workspace_id);
    if (!entitlements.managedAgentEmail) {
      logger.warn?.(`[EMAIL/INCOMING] Dropped ${recipient}: plan ${entitlements.planId} does not allow managed agent email`);
      return { accepted: false, reason: 'plan_blocked', workspaceId: directRoute.workspace_id };
    }

    const recipientDomain = parseEmailDomain(recipient);
    if (recipientDomain && await isWorkspaceCustomDomain(db, directRoute.workspace_id, recipientDomain) && !entitlements.customDomains) {
      logger.warn?.(`[EMAIL/INCOMING] Dropped ${recipient}: custom domains disabled on ${entitlements.planId}`);
      return { accepted: false, reason: 'custom_domain_blocked', workspaceId: directRoute.workspace_id };
    }

    const inserted = await db.query(
      `INSERT INTO ${SCHEMA}.emails
         (from_addr, to_addr, subject, body, html_body, folder, is_read, agent_id, workspace_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'inbox', false, $6, $7, NOW())
       RETURNING id`,
      [sender, recipient, subject, body, htmlBody, directRoute.agent_id || null, directRoute.workspace_id]
    );

    if (directRoute.agent_id && directRoute.auto_reply) {
      const replyFolder = directRoute.approval_required ? 'drafts' : 'outbox';
      const agent = await findScopedAgentByRef(db, directRoute.workspace_id, directRoute.agent_id, 'id, email').catch(() => null);
      const replyFrom = agent?.email || recipient;

      await db.query(
        `INSERT INTO ${SCHEMA}.emails
           (from_addr, to_addr, subject, body, folder, is_read, agent_id, workspace_id, created_at)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7, NOW())`,
        [
          replyFrom,
          sender,
          `Re: ${subject}`,
          `Thank you for your email. ${directRoute.approval_required ? 'Your reply is pending approval.' : 'We will be in touch shortly.'}`,
          replyFolder,
          directRoute.agent_id,
          directRoute.workspace_id,
        ]
      );
    }

    return {
      accepted: true,
      kind: 'route',
      workspaceId: directRoute.workspace_id,
      agentId: directRoute.agent_id || null,
      emailId: inserted.rows[0]?.id || null,
    };
  }

  const group = await db.query(
    `SELECT id, auto_reply, approval_required, workspace_id
       FROM ${SCHEMA}.email_groups
      WHERE LOWER(email_address) = $1
      LIMIT 1`,
    [recipient]
  ).then((result) => result.rows[0] || null);

  if (!group) {
    logger.warn?.(`[EMAIL/INCOMING] No route or group found for ${recipient}`);
    return { accepted: false, reason: 'no_route' };
  }

  const entitlements = await resolveWorkspaceEmailEntitlements(db, group.workspace_id);
  if (!entitlements.managedAgentEmail) {
    logger.warn?.(`[EMAIL/INCOMING] Dropped group ${recipient}: plan ${entitlements.planId} does not allow managed agent email`);
    return { accepted: false, reason: 'plan_blocked', workspaceId: group.workspace_id };
  }

  const recipientDomain = parseEmailDomain(recipient);
  if (recipientDomain && await isWorkspaceCustomDomain(db, group.workspace_id, recipientDomain) && !entitlements.customDomains) {
    logger.warn?.(`[EMAIL/INCOMING] Dropped group ${recipient}: custom domains disabled on ${entitlements.planId}`);
    return { accepted: false, reason: 'custom_domain_blocked', workspaceId: group.workspace_id };
  }

  const members = await db.query(
    `SELECT m.*, a.email AS agent_email, a.name AS agent_name
       FROM ${SCHEMA}.email_group_members m
       LEFT JOIN ${SCHEMA}.agents a
         ON a.id = m.agent_id
        AND a.workspace_id = $2
      WHERE m.group_id = $1
        AND m.notify = true`,
    [group.id, group.workspace_id]
  );

  let deliveredAgents = 0;
  let forwardedHumans = 0;

  for (const member of members.rows) {
    if (member.member_type === 'agent' && member.agent_id) {
      await db.query(
        `INSERT INTO ${SCHEMA}.emails
           (from_addr, to_addr, subject, body, html_body, folder, is_read, agent_id, workspace_id, created_at)
         VALUES ($1, $2, $3, $4, $5, 'inbox', false, $6, $7, NOW())`,
        [sender, recipient, subject, body, htmlBody, member.agent_id, group.workspace_id]
      );
      deliveredAgents += 1;
    }

    if (member.member_type === 'human' && member.human_email && typeof sendViaPostal === 'function') {
      await sendViaPostal({
        from: recipient,
        to: member.human_email,
        subject: `[${recipient}] ${subject}`,
        body: `Forwarded from ${sender}:\n\n${body}`,
        htmlBody,
      });
      forwardedHumans += 1;
    }
  }

  return {
    accepted: true,
    kind: 'group',
    workspaceId: group.workspace_id,
    deliveredAgents,
    forwardedHumans,
  };
}

module.exports = {
  FALLBACK_DOMAIN_SUFFIX,
  assignEmailToAgent,
  createError,
  findScopedAgentByRef,
  hasCustomDomainAccess,
  hasMailboxAdminAccess,
  hasManagedAgentEmailAccess,
  isWorkspaceCustomDomain,
  getWorkspaceFallbackDomain,
  moveEmailToFolder,
  parseEmailDomain,
  processInboundEmail,
  requireCustomDomainAccess,
  requireMailboxAdminAccess,
  requireManagedAgentEmailAccess,
  resolveSenderAddress,
  resolveWorkspaceEmailDomain,
  resolveWorkspaceEmailEntitlements,
  toggleEmailFlag,
  updateEmailReadState,
};
