const http = require('http');
const https = require('https');

class SniparaClient {
  constructor(serverUrl, nodeId, apiKey) {
    this.serverUrl = serverUrl;
    this.nodeId = nodeId;
    this.apiKey = apiKey;
  }

  // Semantic search in agent's memory scope
  async recall(query, opts = {}) {
    return this._call('GET', `/api/v1/nexus/${this.nodeId}/memory/recall?q=${encodeURIComponent(query)}&limit=${opts.limit || 5}&scope=${opts.scope || 'instance'}`);
  }

  // Store a memory in instance scope
  async remember(content, opts = {}) {
    return this._call('POST', `/api/v1/nexus/${this.nodeId}/memory/remember`, {
      content,
      type: opts.type || 'learning',
      tags: opts.tags || [],
      importance: opts.importance || 0.5
    });
  }

  // Promote a learning to template scope (shared with role)
  async promote(content, role) {
    return this._call('POST', `/api/v1/nexus/${this.nodeId}/memory/promote`, { content, role });
  }

  // Get shared context (SOUL.md, MEMORY.md, USER.md + template memories)
  async getContext() {
    return this._call('GET', `/api/v1/nexus/${this.nodeId}/memory/context`);
  }

  async _call(method, path, body) {
    const url = new URL(path, this.serverUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const opts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json',
        }
      };

      const req = lib.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = { SniparaClient };
