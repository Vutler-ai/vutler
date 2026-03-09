const { execSync, spawn } = require('child_process');

class ShellProvider {
  constructor(config = {}) {
    this.whitelist = config.whitelist || [];
    this.blacklist = config.blacklist || ['rm -rf /', 'mkfs', 'dd if='];
    this.timeout = config.timeout_ms || 30000;
    this.maxConcurrent = config.max_concurrent || 3;
    this.running = 0;
  }

  _checkAllowed(cmd) {
    const base = cmd.split(' ')[0];
    if (this.whitelist.length && !this.whitelist.includes(base)) throw new Error('Command not in whitelist: ' + base);
    for (const b of this.blacklist) { if (cmd.includes(b)) throw new Error('Command blacklisted: ' + b); }
    if (this.running >= this.maxConcurrent) throw new Error('Max concurrent commands reached');
  }

  exec(cmd) {
    this._checkAllowed(cmd);
    this.running++;
    try {
      const output = execSync(cmd, { timeout: this.timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      return { success: true, output };
    } catch (e) {
      return { success: false, error: e.message, output: e.stdout || '' };
    } finally {
      this.running--;
    }
  }

  async execAsync(cmd) {
    this._checkAllowed(cmd);
    return new Promise((resolve, reject) => {
      const parts = cmd.split(' ');
      const proc = spawn(parts[0], parts.slice(1), { timeout: this.timeout });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', code => resolve({ success: code === 0, output: stdout, error: stderr, code }));
      proc.on('error', e => reject(e));
    });
  }
}

module.exports = { ShellProvider };
