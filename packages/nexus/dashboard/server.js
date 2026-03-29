const http = require('http');
const fs = require('fs');
const path = require('path');
const { getPermissionEngine } = require('../lib/permission-engine');

// ── Pairing state (in-memory, short-lived) ────────────────────────────────────
const crypto = require('crypto');
let activePairing = null; // { code, expiresAt, paired }

function createDashboardServer(node) {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const onboardingHtml = fs.readFileSync(path.join(__dirname, 'onboarding.html'), 'utf8');
  const manifestJson = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8');
  const swJs = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

  return http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = req.url.split('?')[0];

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexHtml);
    } else if (url === '/onboarding') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(onboardingHtml);
    } else if (url === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
      res.end(manifestJson);
    } else if (url === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(swJs);
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, mode: node.mode, node_id: node.nodeId }));
    } else if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        node_id: node.nodeId,
        name: node.name,
        mode: node.mode,
        role: node.role,
        status: node.nodeId ? 'connected' : 'disconnected',
        connection_status: node.connectionStatus || 'disconnected',
        uptime: Math.floor(process.uptime()),
        cloud_server: node.server,
        snipara_instance_id: node.sniparaInstanceId,
        client_name: node.clientName,
        agents: node.agents.length,
        memory: process.memoryUsage(),
      }));
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
    // ── Permissions API ───────────────────────────────────────────────────────
    } else if (req.url === '/api/permissions' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getPermissionEngine().getPermissions()));

    } else if (req.url === '/api/permissions/grant' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { folder } = JSON.parse(body);
          if (!folder) { res.writeHead(400); res.end(JSON.stringify({ error: 'folder required' })); return; }
          getPermissionEngine().grant(folder);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, folder }));
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });

    } else if (req.url === '/api/permissions/revoke' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { folder } = JSON.parse(body);
          if (!folder) { res.writeHead(400); res.end(JSON.stringify({ error: 'folder required' })); return; }
          getPermissionEngine().revoke(folder);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, folder }));
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });

    // ── Pairing API (QR onboarding) ──────────────────────────────────────────
    } else if (url === '/api/pairing/generate' && req.method === 'POST') {
      const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-char hex
      activePairing = { code, expiresAt: Date.now() + 5 * 60 * 1000, paired: false };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code, ttl_seconds: 300 }));

    } else if (url === '/api/pairing/status' && req.method === 'GET') {
      const qs = new URL(req.url, 'http://localhost').searchParams;
      const code = qs.get('code');
      const valid = activePairing && activePairing.code === code && Date.now() < activePairing.expiresAt;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ paired: valid ? activePairing.paired : false, expired: !valid }));

    } else if (url === '/api/pairing/confirm' && req.method === 'POST') {
      // Called by Vutler Cloud after QR scan to confirm pairing
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { code, token } = JSON.parse(body);
          if (!activePairing || activePairing.code !== code || Date.now() > activePairing.expiresAt) {
            res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid or expired code' })); return;
          }
          activePairing.paired = true;
          // Store token in ~/.vutler/nexus.json
          const os = require('os');
          const tokenPath = path.join(os.homedir(), '.vutler', 'nexus.json');
          fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
          const existing = fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')) : {};
          existing.token = token;
          existing.paired_at = new Date().toISOString();
          fs.writeFileSync(tokenPath, JSON.stringify(existing, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });

    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

module.exports = { createDashboardServer };
