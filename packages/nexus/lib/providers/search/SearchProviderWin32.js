'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const ProviderUnavailableError = require('../../errors/ProviderUnavailableError');

class SearchProviderWin32 {
  async search(query, opts = {}) {
    if (!query) return [];
    const limit = opts.limit || 20;
    const timeout = opts.timeoutMs || 10000;
    const scope = opts.scope || process.env.USERPROFILE || 'C:\\Users';

    // Try PowerShell first, fallback to fast-glob
    try {
      return await this._powershellSearch(query, scope, limit, timeout);
    } catch (_) {
      return this._globFallback(query, scope, limit);
    }
  }

  _powershellSearch(query, scope, limit, timeout) {
    const script = `Get-ChildItem -Path '${scope.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '${query.replace(/'/g, "''")}' } | Select-Object -First ${limit} FullName,LastWriteTime | ConvertTo-Json -Compress`;
    return new Promise((resolve, reject) => {
      execFile('powershell', ['-NoProfile', '-Command', script], { timeout }, (err, stdout) => {
        if (err) return reject(new ProviderUnavailableError('PowerShell search failed', { provider: 'SearchProviderWin32' }));
        try {
          let items = JSON.parse(stdout || '[]');
          if (!Array.isArray(items)) items = [items];
          resolve(items.map(i => ({
            path: i.FullName,
            name: path.basename(i.FullName),
            modifiedAt: i.LastWriteTime,
            preview: null,
          })));
        } catch (_) { resolve([]); }
      });
    });
  }

  _globFallback(query, scope, limit) {
    try {
      const fg = require('fast-glob');
      const pattern = `**/*${query.replace(/[{}[\]()]/g, '')}*`;
      const matches = fg.sync(pattern, { cwd: scope, absolute: true, onlyFiles: true, deep: 8 }).slice(0, limit);
      return matches.map(p => {
        const result = { path: p, name: path.basename(p), modifiedAt: null, preview: null };
        try { result.modifiedAt = fs.statSync(p).mtime.toISOString(); } catch (_) {}
        return result;
      });
    } catch (_) { return []; }
  }
}

module.exports = SearchProviderWin32;
