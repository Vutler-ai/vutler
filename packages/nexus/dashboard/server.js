const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPermissionEngine } = require('../lib/permission-engine');
const { readRuntimeConfig } = require('../lib/runtime-config');

function createDashboardServer(node) {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const pairingState = { code: null, expiresAt: 0, pairedAt: null };
  const permissionEngine = getPermissionEngine();

  function getPairingState() {
    const active = Boolean(pairingState.code && Date.now() <= pairingState.expiresAt);
    return {
      active,
      code: active ? pairingState.code : null,
      expires_at: active ? new Date(pairingState.expiresAt).toISOString() : null,
      paired_at: pairingState.pairedAt,
    };
  }

  function buildWorkspaceLinks(runtimeConfig = readRuntimeConfig()) {
    const server = runtimeConfig?.server || node.server || 'https://app.vutler.ai';
    const baseUrl = String(server || 'https://app.vutler.ai').replace(/\/+$/, '');
    const nodeId = node.nodeId || runtimeConfig?.node_id || null;
    return {
      base_url: baseUrl,
      nexus_url: `${baseUrl}/nexus`,
      node_url: nodeId ? `${baseUrl}/nexus/${nodeId}` : null,
    };
  }

  function getSetupState() {
    const runtimeConfig = readRuntimeConfig();
    const permissions = permissionEngine.getPermissions();
    const configured = Boolean(runtimeConfig?.deploy_token || runtimeConfig?.api_key);
    const connected = Boolean(node.nodeId);
    return {
      configured,
      connected,
      setup_mode: !connected,
      has_deploy_token: Boolean(runtimeConfig?.deploy_token),
      has_api_key: Boolean(runtimeConfig?.api_key),
      node_name: runtimeConfig?.node_name || node.name || os.hostname(),
      node_id: node.nodeId || runtimeConfig?.node_id || null,
      mode: runtimeConfig?.mode || node.mode || 'local',
      server: runtimeConfig?.server || node.server || 'https://app.vutler.ai',
      allowed_folders: permissions.allowedFolders || [],
      allowed_actions: permissions.allowedActions || [],
      permissions,
      links: buildWorkspaceLinks(runtimeConfig),
      pairing: getPairingState(),
      next_step: !configured
        ? 'connect'
        : !connected
          ? 'connect'
          : (permissions.allowedFolders || []).length === 0
            ? 'permissions'
            : 'ready',
    };
  }

  function createPairingCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  async function resolveAgentId(agentIdOrName) {
    if (!agentIdOrName) return null;
    const direct = String(agentIdOrName).trim();
    if (!direct) return null;
    if (/^[0-9a-f-]{36}$/i.test(direct)) return direct;

    if (!node.server || !node.nodeId || !node.key) return null;
    const response = await fetch(`${node.server}/api/v1/nexus/${node.nodeId}/agent-configs`, {
      headers: { 'X-API-Key': node.key },
    }).catch(() => null);
    if (!response || !response.ok) return null;

    const payload = await response.json().catch(() => null);
    const agents = Array.isArray(payload?.agents) ? payload.agents : [];
    const match = agents.find((agent) => String(agent.name || '').toLowerCase() === direct.toLowerCase());
    return match?.id || null;
  }

  async function syncPermissionsToCloud() {
    node.permissions = permissionEngine.getPermissions();
    if (!node.nodeId || typeof node._apiCall !== 'function') return;

    const agents = Array.isArray(node.agents)
      ? node.agents
      : (node.agentManager && typeof node.agentManager.getStatus === 'function' ? node.agentManager.getStatus() : []);

    await node._apiCall('POST', `/api/v1/nexus/${node.nodeId}/connect`, {
      status: 'online',
      agents,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      permissions: node.permissions,
    }).catch(() => {});
  }

  async function configureAndConnect({ token, nodeName, serverUrl, permissions }) {
    if (permissions) {
      permissionEngine.replace(permissions);
      node.permissions = permissionEngine.getPermissions();
    }

    if (token) {
      node.configureFromDeployToken(token, {
        nodeName: nodeName || node.name,
        server: serverUrl || node.server,
        permissions: node.permissions,
      });
    }

    if (!node.key && !node.deployToken) {
      throw new Error('A deploy token is required before Nexus can connect.');
    }

    await node.connect();
    await syncPermissionsToCloud();
  }

  return http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    if (req.url === '/' || req.url === '/index.html' || req.url === '/onboarding' || req.url === '/onboarding.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexHtml);
    } else if (req.url === '/api/discovery') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'vutler-nexus',
        dashboard: {
          port: node.port,
          url: `http://localhost:${node.port}/`,
        },
        discovery: {
          port: node.discoveryPort || node.port,
          url: `http://localhost:${node.discoveryPort || node.port}/`,
        },
        state: getSetupState(),
      }));
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, mode: node.mode, node_id: node.nodeId }));
    } else if (req.url === '/api/setup-state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSetupState()));
    } else if (req.url === '/api/setup/connect' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const token = typeof data.token === 'string' ? data.token.trim() : '';
          const nodeName = typeof data.nodeName === 'string' ? data.nodeName.trim() : '';
          const serverUrl = typeof data.server === 'string' ? data.server.trim() : '';
          const permissions = data.permissions && typeof data.permissions === 'object'
            ? data.permissions
            : null;

          await configureAndConnect({
            token,
            nodeName,
            serverUrl,
            permissions,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, state: getSetupState() }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message, state: getSetupState() }));
        }
      });
    } else if (req.url === '/api/local/dispatch' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const action = String(data.action || '').trim();
          if (!action) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'action is required' }));
          }

          const result = await node._dispatchNodeAction({
            id: `local-ui-${Date.now()}`,
            payload: {
              action,
              args: data.args && typeof data.args === 'object' ? data.args : {},
            },
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error.message,
            result: error.result || null,
          }));
        }
      });
    } else if (req.url === '/api/pairing/generate' && req.method === 'POST') {
      pairingState.code = createPairingCode();
      pairingState.expiresAt = Date.now() + 5 * 60 * 1000;
      pairingState.pairedAt = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code: pairingState.code,
        ttl_seconds: 300,
        expires_at: new Date(pairingState.expiresAt).toISOString(),
        pairing_url: `http://localhost:${node.port}/onboarding?code=${pairingState.code}`,
      }));
    } else if (req.url === '/api/pairing/claim' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const code = String(data.code || '').trim().toUpperCase();
          const token = typeof data.token === 'string' ? data.token.trim() : '';
          const nodeName = typeof data.nodeName === 'string' ? data.nodeName.trim() : '';
          const serverUrl = typeof data.server === 'string' ? data.server.trim() : '';
          const permissions = data.permissions && typeof data.permissions === 'object'
            ? data.permissions
            : null;

          const expired = !pairingState.code || Date.now() > pairingState.expiresAt;
          if (expired || !code || code !== pairingState.code) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'Invalid or expired pairing code.',
              pairing: getPairingState(),
              state: getSetupState(),
            }));
          }

          await configureAndConnect({
            token,
            nodeName,
            serverUrl,
            permissions,
          });

          pairingState.pairedAt = new Date().toISOString();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            pairing: getPairingState(),
            state: getSetupState(),
          }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error.message,
            pairing: getPairingState(),
            state: getSetupState(),
          }));
        }
      });
    } else if (req.url && req.url.startsWith('/api/pairing/status')) {
      const url = new URL(req.url, `http://localhost:${node.port}`);
      const code = url.searchParams.get('code');
      const expired = !pairingState.code || Date.now() > pairingState.expiresAt;
      const paired = !!(code && pairingState.code && code === pairingState.code && node.nodeId && !expired);
      if (paired && !pairingState.pairedAt) pairingState.pairedAt = new Date().toISOString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code,
        paired,
        expired,
        paired_at: pairingState.pairedAt,
        current: getPairingState(),
      }));
    } else if (req.url === '/api/status') {
      const agents = Array.isArray(node.agents)
        ? node.agents
        : (node.agentManager && typeof node.agentManager.getStatus === 'function' ? node.agentManager.getStatus() : []);
      const runtimeConfig = readRuntimeConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        node_id: node.nodeId,
        name: node.name,
        mode: node.mode,
        role: node.role,
        status: node.nodeId ? 'connected' : 'disconnected',
        uptime: Math.floor(process.uptime()),
        cloud_server: node.server,
        snipara_instance_id: node.sniparaInstanceId,
        client_name: node.clientName,
        agents: agents.length,
        memory: process.memoryUsage(),
        configured: Boolean(runtimeConfig?.deploy_token || runtimeConfig?.api_key),
        links: buildWorkspaceLinks(runtimeConfig),
      }));
    } else if (req.url === '/api/permissions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(permissionEngine.getPermissions()));
    } else if (req.url === '/api/permissions/model' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const current = permissionEngine.getPermissions();
          const nextPermissions = data.permissions || {
            ...current,
            consent: data.consent || current.consent,
            allowedFolders: data.allowedFolders || current.allowedFolders,
            allowedActions: data.allowedActions || current.allowedActions,
          };
          permissionEngine.replace(nextPermissions);
          await syncPermissionsToCloud();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, permissions: permissionEngine.getPermissions() }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
    } else if ((req.url === '/api/permissions/grant' || req.url === '/api/permissions/revoke') && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const folder = data.folder;
          if (!folder) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'folder is required' }));
          }
          if (req.url.endsWith('/grant')) permissionEngine.grant(folder);
          else permissionEngine.revoke(folder);
          await syncPermissionsToCloud();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, permissions: permissionEngine.getPermissions() }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
    } else if (req.url === '/api/tasks') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(node.recentTasks || []));
    } else if (req.url === '/api/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(node.logBuffer || []));
    } else if (req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mode: node.mode,
        providers: Object.keys(node.providers || {}),
        permissions: node.permissions || {},
        filesystem_root: node.filesystemRoot,
        offline_enabled: node.offlineConfig?.enabled || false,
        discovery_snapshot: node.discoverySnapshot || null,
      }));
    } else if (req.url === '/agents' && req.method === 'GET') {
      const agents = node.agentManager && typeof node.agentManager.getStatus === 'function'
        ? node.agentManager.getStatus()
        : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents }));
    } else if (req.url === '/agents/spawn' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const requested = data.agentId || data.agentName;
          const agentId = await resolveAgentId(requested);
          if (!agentId) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Agent not found in available pool' }));
          }
          const worker = await node.agentManager.spawnAgent(agentId);
          node.agents = node.agentManager.getStatus();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            agent: {
              id: worker.id,
              name: worker.name,
              model: worker.model,
              status: worker.status,
              tasksCompleted: worker.tasksCompleted,
            },
            seats: node.agentManager.seatsInfo,
          }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
    } else if (req.url && req.url.startsWith('/agents/') && req.url.endsWith('/stop') && req.method === 'POST') {
      const parts = req.url.split('/');
      const agentId = parts[2];
      try {
        node.agentManager.stopAgent(agentId);
        node.agents = node.agentManager.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, seats: node.agentManager.seatsInfo }));
      } catch (error) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

module.exports = { createDashboardServer };
