const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getPermissionEngine } = require('../lib/permission-engine');

function createDashboardServer(node) {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const onboardingHtml = fs.readFileSync(path.join(__dirname, 'onboarding.html'), 'utf8');
  const pairingState = { code: null, expiresAt: 0, pairedAt: null };
  const permissionEngine = getPermissionEngine();

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

  return http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexHtml);
    } else if (req.url === '/onboarding' || req.url === '/onboarding.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(onboardingHtml);
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, mode: node.mode, node_id: node.nodeId }));
    } else if (req.url === '/api/pairing/generate' && req.method === 'POST') {
      pairingState.code = createPairingCode();
      pairingState.expiresAt = Date.now() + 5 * 60 * 1000;
      pairingState.pairedAt = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code: pairingState.code,
        ttl_seconds: 300,
        pairing_url: `http://localhost:${node.port}/onboarding?code=${pairingState.code}`,
      }));
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
      }));
    } else if (req.url === '/api/status') {
      const agents = Array.isArray(node.agents)
        ? node.agents
        : (node.agentManager && typeof node.agentManager.getStatus === 'function' ? node.agentManager.getStatus() : []);
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
