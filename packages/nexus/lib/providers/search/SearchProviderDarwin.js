'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ProviderUnavailableError = require('../../errors/ProviderUnavailableError');

class SearchProviderDarwin {
  async search(query, opts = {}) {
    if (!query) return [];
    const limit = opts.limit || 20;
    const timeout = opts.timeoutMs || 5000;
    const args = opts.scope ? ['-onlyin', opts.scope, query] : [query];

    const lines = await new Promise((resolve, reject) => {
      execFile('mdfind', args, { timeout }, (err, stdout) => {
        if (err) {
          if (err.code === 'ENOENT') return reject(new ProviderUnavailableError('mdfind not found — Spotlight disabled?', { provider: 'SearchProviderDarwin' }));
          if (err.killed) return resolve([]); // timeout
          return reject(err);
        }
        resolve(stdout.trim().split('\n').filter(Boolean));
      });
    });

    return lines.slice(0, limit).map((p) => {
      const result = { path: p, name: path.basename(p), modifiedAt: null, preview: null };
      try {
        const st = fs.statSync(p);
        result.modifiedAt = st.mtime.toISOString();
      } catch (_) {}
      try {
        const buf = fs.readFileSync(p, { encoding: 'utf8', flag: 'r' });
        result.preview = buf.slice(0, 200);
      } catch (_) {}
      return result;
    });
  }
}

module.exports = SearchProviderDarwin;
