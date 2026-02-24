/**
 * Provision a new Snipara project for a workspace.
 * S9.1 — Updated to use real Snipara Enterprise API
 *
 * @param {string} workspaceId
 * @param {{ name?: string, description?: string }} opts
 * @returns {object} Snipara project object with API key
 */
async function provisionProject(workspaceId, opts = {}) {
  const ENTERPRISE_API_BASE = 'https://snipara.com/api/v1/enterprise';
  const ENTERPRISE_TOKEN = process.env.SNIPARA_ENTERPRISE_KEY || 'ent_admin_2568e324a7193ab1e6cf43983f65052c';
  
  try {
    // Step 1: Create workspace in Snipara Enterprise
    const workspacePayload = {
      name: opts.name || `Vutler Workspace ${workspaceId}`,
      description: opts.description || `Auto-provisioned workspace for Vutler workspace ${workspaceId}`,
      workspace_id: workspaceId
    };

    const workspaceResponse = await fetch(`${ENTERPRISE_API_BASE}/workspaces`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENTERPRISE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workspacePayload)
    });

    if (!workspaceResponse.ok) {
      const errorData = await workspaceResponse.text();
      throw new Error(`Failed to create workspace (${workspaceResponse.status}): ${errorData}`);
    }

    const workspace = await workspaceResponse.json();
    console.log(`[Snipara] Created workspace: ${workspace.id || workspace.workspace_id}`);

    // Step 2: Generate API key for the workspace
    const apiKeyResponse = await fetch(`${ENTERPRISE_API_BASE}/api-keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENTERPRISE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workspace_id: workspace.id || workspace.workspace_id,
        name: `${opts.name || 'Vutler'} API Key`,
        permissions: ['read', 'write', 'admin']
      })
    });

    if (!apiKeyResponse.ok) {
      const errorData = await apiKeyResponse.text();
      throw new Error(`Failed to create API key (${apiKeyResponse.status}): ${errorData}`);
    }

    const apiKeyData = await apiKeyResponse.json();
    console.log(`[Snipara] Generated API key for workspace ${workspace.id || workspace.workspace_id}`);

    // Return combined result
    return {
      id: workspace.id || workspace.workspace_id,
      name: workspace.name,
      description: workspace.description,
      workspace_id: workspaceId,
      api_key: apiKeyData.key || apiKeyData.api_key,
      created_at: workspace.created_at || new Date().toISOString(),
      status: 'active'
    };

  } catch (error) {
    console.error('[Snipara] Enterprise provisioning failed:', error.message);
    
    // Fallback to mock/local provisioning for development
    console.log('[Snipara] Falling back to mock provisioning...');
    return {
      id: `snp_${workspaceId}_${Date.now()}`,
      name: opts.name || `Vutler Workspace ${workspaceId}`,
      description: opts.description || 'Auto-provisioned by Vutler',
      workspace_id: workspaceId,
      api_key: `snp_mock_${Math.random().toString(36).substr(2, 16)}`,
      created_at: new Date().toISOString(),
      status: 'mock',
      fallback: true
    };
  }
}