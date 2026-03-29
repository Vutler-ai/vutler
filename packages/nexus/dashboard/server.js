const http = require('http');
const fs = require('fs');
const path = require('path');
const { getPermissionEngine } = require('../lib/permission-engine');

function createDashboardServer(node) {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  return http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexHtml);
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

    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

module.exports = { createDashboardServer };
