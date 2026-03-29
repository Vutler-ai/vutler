const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');

class FilesystemProvider {
  constructor(config = {}) {
    this.root = config.root || '/';
    this.blacklist = config.blocked || ['../'];
  }

  _resolve(p) {
    const resolved = path.resolve(this.root, p);
    if (!resolved.startsWith(path.resolve(this.root)) && this.root !== '/') {
      throw new Error('Path escape blocked: ' + p);
    }
    return resolved;
  }

  readFile(filePath) { return fs.readFileSync(this._resolve(filePath), 'utf8'); }
  writeFile(filePath, content) { fs.mkdirSync(path.dirname(this._resolve(filePath)), { recursive: true }); fs.writeFileSync(this._resolve(filePath), content); }
  listDir(dirPath, opts = {}) {
    const resolved = this._resolve(dirPath);
    // Recursive + pattern → use fast-glob
    if (opts.recursive && opts.pattern) {
      return fg.sync(opts.pattern, { cwd: resolved, absolute: true, onlyFiles: false, deep: 10 })
        .slice(0, 500)
        .map(p => this._entryMeta(p));
    }
    if (opts.recursive) {
      return this._walkDir(resolved, 500);
    }
    // Simple listing with optional pattern filter
    let entries = fs.readdirSync(resolved, { withFileTypes: true });
    if (opts.pattern) {
      const re = new RegExp(opts.pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
      entries = entries.filter(d => re.test(d.name));
    }
    return entries.slice(0, 500).map(d => this._entryMeta(path.join(resolved, d.name)));
  }

  _entryMeta(p) {
    try {
      const st = fs.statSync(p);
      return { name: path.basename(p), path: p, size: st.size, modifiedAt: st.mtime.toISOString(), type: st.isDirectory() ? 'directory' : path.extname(p) };
    } catch (_) {
      return { name: path.basename(p), path: p, size: 0, modifiedAt: null, type: path.extname(p) };
    }
  }

  _walkDir(dir, maxResults) {
    const results = [];
    const walk = (d) => {
      if (results.length >= maxResults) return;
      let entries;
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of entries) {
        if (results.length >= maxResults) break;
        const full = path.join(d, e.name);
        results.push(this._entryMeta(full));
        if (e.isDirectory()) walk(full);
      }
    };
    walk(dir);
    return results;
  }
  exists(p) { return fs.existsSync(this._resolve(p)); }
  stat(p) { return fs.statSync(this._resolve(p)); }
  deleteFile(p) { fs.unlinkSync(this._resolve(p)); }
  mkdir(p) { fs.mkdirSync(this._resolve(p), { recursive: true }); }

  /**
   * Glob for files matching a pattern within rootDir.
   * Uses fast-glob (sync) and applies the same path-escape security as _resolve().
   * @param {string} pattern  - Glob pattern (e.g. "**\/*.js")
   * @param {string} rootDir  - Directory to search in (defaults to this.root)
   * @returns {string[]}        Matching absolute paths
   */
  glob(pattern, rootDir = this.root) {
    const resolvedRoot = this._resolve(path.relative(this.root, rootDir) || '.');
    return fg.sync(pattern, { cwd: resolvedRoot, absolute: true });
  }

  /**
   * Recursively search dir for entries whose name contains query (case-insensitive).
   * @param {string} dir    - Directory to walk (relative or absolute within root)
   * @param {string} query  - Substring to match against entry names
   * @returns {{ name: string, path: string, size: number, isDir: boolean }[]}
   *          Up to 200 results.
   */
  searchRecursive(dir, query) {
    const resolvedDir = this._resolve(path.relative(this.root, dir) || '.');
    const lowerQuery = query.toLowerCase();
    const results = [];

    const walk = (current) => {
      if (results.length >= 200) return;
      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (_) {
        return; // skip unreadable directories
      }
      for (const entry of entries) {
        if (results.length >= 200) break;
        const entryPath = path.join(current, entry.name);
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          let size = 0;
          try { size = entry.isDirectory() ? 0 : fs.statSync(entryPath).size; } catch (_) { /* ignore */ }
          results.push({ name: entry.name, path: entryPath, size, isDir: entry.isDirectory() });
        }
        if (entry.isDirectory()) {
          walk(entryPath);
        }
      }
    };

    walk(resolvedDir);
    return results;
  }
}

module.exports = { FilesystemProvider };
