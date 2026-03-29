'use strict';
const { execFileSync } = require('child_process');

class ClipboardProvider {
  constructor(opts = {}) {
    this.pollIntervalMs = opts.pollInterval || 2000;
    this._lastContent = null;
    this._timer = null;
    this._onChange = null;
  }

  read() {
    if (process.platform === 'darwin') {
      return execFileSync('pbpaste', [], { encoding: 'utf8', timeout: 3000 });
    }
    if (process.platform === 'win32') {
      return execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard'], { encoding: 'utf8', timeout: 3000 });
    }
    return execFileSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8', timeout: 3000 });
  }

  startWatching(onChange) {
    this._onChange = onChange;
    this._lastContent = this.read();
    this._timer = setInterval(() => {
      try {
        const content = this.read();
        if (content !== this._lastContent) {
          this._lastContent = content;
          if (this._onChange) this._onChange(content);
        }
      } catch (_) {}
    }, this.pollIntervalMs);
  }

  stopWatching() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}

module.exports = { ClipboardProvider };
