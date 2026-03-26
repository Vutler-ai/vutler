const http = require('http');
const https = require('https');

class LLMProvider {
  constructor(config = {}) {
    this.provider = config.provider || 'ollama';
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.model = config.model || 'llama3.3:70b';
    this.fallback = config.fallback || null;
  }

  async chat(messages, opts = {}) {
    try {
      if (this.provider === 'ollama') return await this._ollama(messages, opts);
      if (this.provider === 'openai') return await this._openai(messages, opts);
      if (this.provider === 'cloud') return await this._cloud(messages, opts);
      throw new Error('Unknown LLM provider: ' + this.provider);
    } catch (e) {
      if (this.fallback) {
        console.warn('[LLM] Primary failed, trying fallback:', e.message);
        const fb = new LLMProvider(this.fallback);
        return fb.chat(messages, opts);
      }
      throw e;
    }
  }

  async _ollama(messages, opts) {
    const body = JSON.stringify({ model: opts.model || this.model, messages, stream: false });
    return this._post(this.endpoint + '/api/chat', body);
  }

  async _openai(messages, opts) {
    const body = JSON.stringify({ model: opts.model || this.model, messages });
    return this._post(this.endpoint + '/v1/chat/completions', body, { 'Authorization': 'Bearer ' + (opts.apiKey || process.env.OPENAI_API_KEY) });
  }

  async _cloud(messages, opts) {
    // Proxy through Vutler Cloud
    const body = JSON.stringify({ model: opts.model || 'gpt-4o', messages });
    return this._post((opts.server || 'https://app.vutler.ai') + '/api/v1/llm/chat', body, { 'Authorization': 'Bearer ' + (opts.key || process.env.NEXUS_KEY) });
  }

  _post(url, body, extraHeaders = {}) {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request({ hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, timeout: 120000 }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data }); } });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = { LLMProvider };
