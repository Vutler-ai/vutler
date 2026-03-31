/**
 * Snipara Integration Service
 * Handles RLM Swarm API calls for auto-provisioning and task sync
 */
'use strict';

const axios = require('axios');

const {
  buildSniparaProjectUrl,
  DEFAULT_SNIPARA_PROJECT_SLUG,
  normalizeProjectSlug,
} = require('./sniparaResolver');
const SNIPARA_API_BASE_URL = process.env.SNIPARA_API_BASE_URL || 'https://api.snipara.com';
const SNIPARA_PROJECT_SLUG = process.env.SNIPARA_PROJECT_SLUG || DEFAULT_SNIPARA_PROJECT_SLUG;
const SNIPARA_MCP_URL = process.env.SNIPARA_PROJECT_MCP_URL
  || process.env.SNIPARA_MCP_URL
  || buildSniparaProjectUrl(SNIPARA_PROJECT_SLUG);
const SNIPARA_API_KEY = process.env.SNIPARA_API_KEY || 'REDACTED_SNIPARA_KEY_2';
const SNIPARA_SWARM_ID = process.env.SNIPARA_SWARM_ID || 'cmmdu24k500g01ihbw32d44x2';

function resolveIntegratorApiKey() {
  const candidates = [
    process.env.SNIPARA_INTEGRATION_KEY,
    process.env.SNIPARA_PROJECT_KEY,
    process.env.SNIPARA_API_KEY,
  ].filter(Boolean);

  const preferred = candidates.find((value) => String(value).startsWith('rlm_'));
  return preferred || candidates[0] || null;
}

function parseIntegratorResult(response) {
  return response?.data?.data || response?.data || {};
}

function extractClientApiKey(payload) {
  return payload?.api_key
    || payload?.project_api_key
    || payload?.key
    || payload?.secret
    || payload?.token
    || null;
}

async function createClientApiKey({
  clientId,
  name = 'Vutler Workspace Key',
  accessLevel = 'ADMIN',
}) {
  const apiKey = resolveIntegratorApiKey();
  if (!apiKey) throw new Error('SNIPARA_INTEGRATION_KEY not set');
  if (!clientId) throw new Error('clientId is required');

  const response = await axios.post(
    `${SNIPARA_API_BASE_URL}/v1/integrator/clients/${encodeURIComponent(clientId)}/api-keys`,
    {
      name,
      access_level: accessLevel,
    },
    {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      }
    }
  );

  return parseIntegratorResult(response);
}

async function createClientSwarm({ clientId, name, description = null }) {
  const apiKey = resolveIntegratorApiKey();
  if (!apiKey) throw new Error('SNIPARA_INTEGRATION_KEY not set');
  if (!clientId) throw new Error('clientId is required');
  if (!name) throw new Error('name is required');

  const response = await axios.post(
    `${SNIPARA_API_BASE_URL}/v1/integrator/clients/${encodeURIComponent(clientId)}/swarms`,
    {
      name,
      ...(description ? { description } : {}),
    },
    {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      }
    }
  );

  return parseIntegratorResult(response);
}

async function listClientSwarms({ clientId }) {
  const apiKey = resolveIntegratorApiKey();
  if (!apiKey) throw new Error('SNIPARA_INTEGRATION_KEY not set');
  if (!clientId) throw new Error('clientId is required');

  const response = await axios.get(
    `${SNIPARA_API_BASE_URL}/v1/integrator/clients/${encodeURIComponent(clientId)}/swarms`,
    {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      }
    }
  );

  return parseIntegratorResult(response);
}

function toSniparaPriority(priority) {
  if (typeof priority === 'number' && Number.isFinite(priority)) {
    return Math.max(0, Math.min(100, Math.round(priority)));
  }

  const value = String(priority || 'medium').toLowerCase();
  if (/(p0|urgent|critical|critique|asap)/.test(value)) return 100;
  if (/(p1|high|haute priorite|haute priorité)/.test(value)) return 80;
  if (/(p3|low|faible priorite|faible priorité|quand possible)/.test(value)) return 20;
  return 50;
}

/**
 * Create a new project for a workspace (auto-provisioning)
 * @param {string} workspaceName - Name of the workspace
 * @param {string} workspaceId - UUID of the workspace
 * @returns {Promise<{project_id: string, api_key: string}>}
 */
async function createProject(workspaceName, workspaceId) {
  const args = typeof workspaceName === 'object'
    ? workspaceName
    : { workspaceName, workspaceId };

  try {
    const intKey = resolveIntegratorApiKey();
    if (!intKey) throw new Error('SNIPARA_INTEGRATION_KEY not set');
    const projectSlug = normalizeProjectSlug(args.workspaceSlug || args.projectSlug || args.workspaceName || args.workspaceId);
    const webhookUrl = args.webhookUrl || process.env.SNIPARA_WEBHOOK_URL || null;
    const webhookSecret = args.webhookSecret || process.env.SNIPARA_WEBHOOK_SECRET || null;
    const basePayload = {
      name: args.workspaceName,
      slug: projectSlug,
      email: args.ownerEmail || `workspace-${args.workspaceId}@vutler.ai`,
      metadata: {
        workspace_id: args.workspaceId,
        workspace_slug: args.workspaceSlug || null,
        ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
      }
    };
    const webhookPayload = (webhookUrl && webhookSecret)
      ? {
        ...basePayload,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
      }
      : basePayload;

    const headers = {
      'X-API-Key': intKey,
      'Content-Type': 'application/json'
    };

    let response;
    try {
      response = await axios.post(
        `${SNIPARA_API_BASE_URL}/v1/integrator/clients`,
        webhookPayload,
        { headers }
      );
    } catch (err) {
      const detail = JSON.stringify(err.response?.data || {});
      const canRetryWithoutWebhook = webhookPayload !== basePayload
        && err.response?.status >= 400
        && err.response?.status < 500
        && !/rate limit/i.test(detail);

      if (!canRetryWithoutWebhook) throw err;

      response = await axios.post(
        `${SNIPARA_API_BASE_URL}/v1/integrator/clients`,
        basePayload,
        { headers }
      );
    }

    console.log('[SniparaService] Project created:', response.data);
    const result = parseIntegratorResult(response);
    let projectApiKey = extractClientApiKey(result);

    if (!projectApiKey && result.client_id) {
      const keyResult = await createClientApiKey({
        clientId: result.client_id,
        name: `${projectSlug}-workspace-key`,
        accessLevel: 'ADMIN',
      });
      projectApiKey = extractClientApiKey(keyResult);
    }

    return {
      project_id: result.project_id || result.id,
      client_id: result.client_id || null,
      api_key: projectApiKey,
      project_slug: result.project_slug || result.slug || projectSlug,
      api_url: result.mcp_url || result.api_url || buildSniparaProjectUrl(result.project_slug || result.slug || projectSlug),
    };
  } catch (err) {
    console.error('[SniparaService] createProject error:', err.response?.data || err.message);
    throw new Error(`Failed to create Snipara project: ${err.message}`);
  }
}

async function createSwarm({ apiKey, apiUrl, name, description }) {
  try {
    const response = await axios.post(
      apiUrl,
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'rlm_swarm_create',
          arguments: {
            name,
            ...(description ? { description } : {}),
          },
        },
      },
      {
        headers: {
          'X-API-Key': apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const payload = response.data?.result || response.data;
    const structured = payload?.structuredContent
      || payload?.content?.[0]?.text
      || payload;
    const parsed = typeof structured === 'string' ? JSON.parse(structured) : structured;
    if (parsed?.error) {
      throw new Error(parsed.error);
    }
    if (!parsed?.swarm_id && !parsed?.id) {
      throw new Error('Snipara swarm creation returned no swarm id');
    }
    return {
      swarm_id: parsed?.swarm_id || parsed?.id || null,
      raw: parsed,
    };
  } catch (err) {
    console.error('[SniparaService] createSwarm error:', err.response?.data || err.message);
    throw new Error(`Failed to create Snipara swarm: ${err.message}`);
  }
}

/**
 * Create a task in the swarm
 * @param {object} task - Task object from Vutler
 * @param {string} apiKey - Workspace-specific Snipara API key
 * @returns {Promise<string>} swarm_task_id
 */
async function createTask(task, apiKey = SNIPARA_API_KEY) {
  try {
    const response = await axios.post(
      SNIPARA_MCP_URL,
      {
        method: 'rlm_task_create',
        params: {
          swarm_id: SNIPARA_SWARM_ID,
          title: task.title,
          description: task.description || '',
          priority: toSniparaPriority(task.priority),
          metadata: {
            vutler_task_id: task.id,
            workspace_id: task.workspace_id,
            assigned_agent: task.assigned_agent,
            source: task.source
          }
        }
      },
      {
        headers: {
          'X-API-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const swarmTaskId = response.data.result?.task_id || response.data.task_id;
    console.log('[SniparaService] Task created in swarm:', swarmTaskId);
    return swarmTaskId;
  } catch (err) {
    console.error('[SniparaService] createTask error:', err.response?.data || err.message);
    // Non-blocking: return null if sync fails
    return null;
  }
}

/**
 * Mark a task as completed in the swarm
 * @param {string} swarmTaskId - Snipara swarm task ID
 * @param {string} apiKey - Workspace-specific Snipara API key
 * @returns {Promise<boolean>}
 */
async function completeTask(swarmTaskId, apiKey = SNIPARA_API_KEY) {
  try {
    const response = await axios.post(
      SNIPARA_MCP_URL,
      {
        method: 'rlm_task_complete',
        params: {
          task_id: swarmTaskId,
          swarm_id: SNIPARA_SWARM_ID
        }
      },
      {
        headers: {
          'X-API-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[SniparaService] Task completed in swarm:', swarmTaskId);
    return true;
  } catch (err) {
    console.error('[SniparaService] completeTask error:', err.response?.data || err.message);
    return false;
  }
}

module.exports = {
  createProject,
  createClientApiKey,
  createClientSwarm,
  listClientSwarms,
  createSwarm,
  createTask,
  completeTask
};
