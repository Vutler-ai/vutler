const { execFileSync, spawn } = require('child_process');

/**
 * Parse a shell command string into [executable, ...args].
 * Handles quoted arguments (single and double quotes) so that
 * e.g. `grep "hello world" file.txt` splits correctly.
 */
function _parseCmd(cmd) {
  const args = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current.length) { args.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current.length) args.push(current);
  return args;
}

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

  /**
   * Wrap an argument in double-quotes if it contains spaces or special chars.
   * Used when building display strings; actual execution passes args as an array.
   */
  _escapeArg(arg) {
    if (/[\s"'\\$`]/.test(arg)) {
      return '"' + arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    return arg;
  }

  exec(cmd) {
    this._checkAllowed(cmd);
    this.running++;
    try {
      const [executable, ...args] = _parseCmd(cmd);
      // execFileSync avoids spawning a shell, preventing injection via cmd string
      const output = execFileSync(executable, args, {
        timeout: this.timeout,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
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
      const [executable, ...args] = _parseCmd(cmd);
      // Use the parsed args array instead of naive split(' ') to handle quoted args
      const proc = spawn(executable, args, { timeout: this.timeout });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', code => resolve({ success: code === 0, output: stdout, error: stderr, code }));
      proc.on('error', e => reject(e));
    });
  }
}

module.exports = { ShellProvider };
