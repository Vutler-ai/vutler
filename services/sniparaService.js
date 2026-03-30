/**
 * Snipara Integration Service
 * Handles RLM Swarm API calls for auto-provisioning and task sync
 */
'use strict';

const axios = require('axios');

const {
  buildSniparaProjectUrl,
  DEFAULT_SNIPARA_PROJECT_SLUG,
} = require('./sniparaResolver');
const SNIPARA_API_BASE_URL = process.env.SNIPARA_API_BASE_URL || 'https://api.snipara.com';
const SNIPARA_PROJECT_SLUG = process.env.SNIPARA_PROJECT_SLUG || DEFAULT_SNIPARA_PROJECT_SLUG;
const SNIPARA_MCP_URL = process.env.SNIPARA_PROJECT_MCP_URL
  || process.env.SNIPARA_MCP_URL
  || buildSniparaProjectUrl(SNIPARA_PROJECT_SLUG);
const SNIPARA_API_KEY = process.env.SNIPARA_API_KEY || 'REDACTED_SNIPARA_KEY_2';
const SNIPARA_SWARM_ID = process.env.SNIPARA_SWARM_ID || 'cmmdu24k500g01ihbw32d44x2';

/**
 * Create a new project for a workspace (auto-provisioning)
 * @param {string} workspaceName - Name of the workspace
 * @param {string} workspaceId - UUID of the workspace
 * @returns {Promise<{project_id: string, api_key: string}>}
 */
async function createProject(workspaceName, workspaceId) {
  try {
    // Use Integrator API to create client project
    const intKey = process.env.SNIPARA_INTEGRATION_KEY;
    if (!intKey) throw new Error('SNIPARA_INTEGRATION_KEY not set');
    
    const response = await axios.post(
      `${SNIPARA_API_BASE_URL}/clients`,
      {
        name: workspaceName,
        email: 'workspace-' + workspaceId + '@vutler.ai',
        metadata: { workspace_id: workspaceId }
      },
      {
        headers: {
          'X-API-Key': process.env.SNIPARA_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[SniparaService] Project created:', response.data);
    const result = response.data.data || response.data;
    return {
      project_id: result.project_id || result.id,
      api_key: result.api_key
    };
  } catch (err) {
    console.error('[SniparaService] createProject error:', err.response?.data || err.message);
    throw new Error(`Failed to create Snipara project: ${err.message}`);
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
          priority: task.priority || 'P2',
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
  createTask,
  completeTask
};
