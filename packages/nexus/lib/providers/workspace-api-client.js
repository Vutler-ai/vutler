'use strict';

const http = require('http');
const https = require('https');

class WorkspaceApiClient {
  constructor(config = {}) {
    this.server = config.server || 'https://app.vutler.ai';
    this.apiKey = config.apiKey || config.key || null;
  }

  async get(path) {
    return this._request('GET', path);
  }

  async post(path, body) {
    return this._request('POST', path, body);
  }

  async _request(method, requestPath, body) {
    const url = new URL(requestPath, this.server);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
          ...(payload ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 400) {
              return reject(new Error(parsed.error || parsed.message || `HTTP ${res.statusCode}`));
            }
            resolve(parsed);
          } catch (error) {
            if (res.statusCode >= 400) {
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            resolve({});
          }
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}

module.exports = { WorkspaceApiClient };
