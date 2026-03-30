const http = require('http');
const fs = require('fs');
const path = require('path');

function createDashboardServer(node) {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  return http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

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
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

module.exports = { createDashboardServer };
