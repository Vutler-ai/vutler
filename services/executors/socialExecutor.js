'use strict';

const { createSocialPost, listSocialAccounts, toInternalPlatform } = require('../postForMeClient');
const { getSwarmCoordinator } = require('../../app/custom/services/swarmCoordinator');
const {
  extractSocialAccountIdentifiers,
  normalizeScopeStrings,
} = require('../socialAccountScope');

function normalizePlatforms(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => toInternalPlatform(value))
      .filter(Boolean)
  ));
}

function getRemoteAccountId(account = {}) {
  const candidate = account.id || account.social_account_id || account.platform_account_id || account.account_id;
  return candidate ? String(candidate).trim() : null;
}

function buildQueuedSocialTaskPayload({ caption, params = {}, workspaceId, agentId }) {
  const requestedPlatforms = normalizePlatforms(params.platforms);
  const schedule = params.scheduled_at || params.scheduledAt || null;
  const scheduleHint = schedule ? `\nScheduled for: ${schedule}` : '';
  const platformHint = requestedPlatforms.length > 0 ? `\nPlatforms: ${requestedPlatforms.join(', ')}` : '';
  const titleBase = caption.slice(0, 48) || 'Social publication';

  return {
    title: `Social publish: ${titleBase}`,
    description: [
      'Publish the following social media update using the authorized workspace accounts.',
      '',
      caption,
      platformHint,
      scheduleHint,
    ].filter(Boolean).join('\n'),
    priority: schedule ? 'high' : 'medium',
    for_agent_id: agentId,
    due_date: schedule,
    metadata: {
      origin: 'social_executor',
      execution_mode: 'simple_task',
      social_publication_request: {
        caption,
        platforms: requestedPlatforms,
        scheduled_at: schedule,
        workspace_id: workspaceId,
      },
    },
  };
}

async function loadWorkspaceAccountScope(workspaceId, db) {
  if (!workspaceId || !db?.query) return [];

  try {
    const result = await db.query(
      `SELECT id::text AS id, platform, platform_account_id, metadata
       FROM tenant_vutler.social_accounts
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    return Array.isArray(result.rows) ? result.rows : [];
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

async function executeSocialPlan(plan = {}, context = {}) {
  const workspaceId = plan.workspace_id || plan.workspaceId || context.workspaceId || null;
  const agentId = plan.selectedAgentId || plan.agentId || context.selectedAgentId || null;
  const params = plan.params || plan.input || {};
  const caption = typeof params.caption === 'string' ? params.caption.trim() : '';
  const originTaskId = params.origin_task_id || params.originTaskId || context.originTaskId || null;
  if (!workspaceId) throw new Error('Social execution requires a workspace id.');
  if (!caption) throw new Error('Social execution requires a caption.');

  if (!originTaskId) {
    const coordinator = getSwarmCoordinator();
    const queuedTask = await coordinator.createTask(
      buildQueuedSocialTaskPayload({ caption, params, workspaceId, agentId }),
      workspaceId
    );

    return {
      success: true,
      data: {
        queued: true,
        task_id: queuedTask?.id || null,
        task_status: queuedTask?.status || 'pending',
        task_url: queuedTask?.id ? `/tasks?task=${encodeURIComponent(String(queuedTask.id))}` : '/tasks',
        message: 'Social publication was routed into the task queue before execution.',
      },
    };
  }

  const externalId = params.external_id || `ws_${workspaceId}`;
  const requestedPlatforms = normalizePlatforms(params.platforms);
  const allowedPlatforms = normalizePlatforms(params.allowed_platforms);
  const allowedAccountIds = normalizeScopeStrings(params.allowed_account_ids);
  const allowedBrandIds = normalizeScopeStrings(params.allowed_brand_ids);
  const allowedPlatformSet = allowedPlatforms.length > 0 ? new Set(allowedPlatforms) : null;
  const allowedBrandIdSet = allowedBrandIds.length > 0 ? new Set(allowedBrandIds) : null;
  const hasAccountScope = allowedAccountIds.length > 0 || allowedBrandIds.length > 0;

  const localScopedAccounts = hasAccountScope
    ? await loadWorkspaceAccountScope(workspaceId, context.db)
    : [];
  const allowedLocalIdSet = allowedAccountIds.length > 0 ? new Set(allowedAccountIds) : null;
  const allowedRemoteAccountIds = new Set(
    localScopedAccounts
      .filter((account) => {
        if (allowedLocalIdSet && allowedLocalIdSet.has(String(account.id || '').trim())) return true;
        if (allowedBrandIdSet) {
          const identifiers = extractSocialAccountIdentifiers(account);
          return identifiers.some((identifier) => allowedBrandIdSet.has(identifier));
        }
        return false;
      })
      .map((account) => getRemoteAccountId(account) || account.platform_account_id || null)
      .filter(Boolean)
  );

  const allAccounts = await listSocialAccounts({
    externalId,
    status: 'connected',
  });

  const filteredAccounts = Array.isArray(allAccounts)
    ? allAccounts.filter((account) => {
      const platform = toInternalPlatform(account.platform || account.type);
      if (allowedPlatformSet && !allowedPlatformSet.has(platform)) return false;
      if (requestedPlatforms.length > 0 && !requestedPlatforms.includes(platform)) return false;
      if (hasAccountScope) {
        const remoteAccountId = getRemoteAccountId(account);
        const accountIdentifiers = extractSocialAccountIdentifiers(account);
        const matchesRemoteAccount = remoteAccountId ? allowedRemoteAccountIds.has(remoteAccountId) : false;
        const matchesBrandIdentifier = allowedBrandIdSet
          ? accountIdentifiers.some((identifier) => allowedBrandIdSet.has(identifier))
          : false;

        if (!matchesRemoteAccount && !matchesBrandIdentifier) return false;
      }
      return true;
    })
    : [];

  let accounts = filteredAccounts
    .map((account) => account.id || account.social_account_id)
    .filter(Boolean);

  if (accounts.length === 0 && requestedPlatforms.length === 0 && allowedPlatformSet === null && !hasAccountScope && Array.isArray(allAccounts)) {
    accounts = allAccounts.map((account) => account.id || account.social_account_id).filter(Boolean);
  }

  if (accounts.length === 0) {
    throw new Error(hasAccountScope ? 'No authorized social accounts connected' : 'No social accounts connected');
  }

  const postData = await createSocialPost({
    caption,
    socialAccounts: accounts,
    scheduledAt: params.scheduled_at || params.scheduledAt || null,
    externalId,
  });

  if (context.db?.query) {
    await context.db.query(
      `INSERT INTO tenant_vutler.social_posts_usage (workspace_id, agent_id, platform, post_id, caption, status)
       VALUES ($1, $2, 'multi', $3, $4, 'processing')`,
      [workspaceId, agentId, postData.id || null, caption.slice(0, 500)]
    ).catch(() => {});
  }

  return {
    success: true,
    data: {
      account_count: accounts.length,
      post_id: postData.id || null,
      status: postData.status || 'processing',
      scheduled_at: params.scheduled_at || params.scheduledAt || null,
      requested_platforms: requestedPlatforms,
      allowed_platforms: allowedPlatforms,
      allowed_account_ids: allowedAccountIds,
      allowed_brand_ids: allowedBrandIds,
    },
  };
}

module.exports = {
  executeSocialPlan,
};
