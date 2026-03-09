const fs = require('fs');
const path = require('path');

class EnvProvider {
  constructor(config = {}) {
    this.envFile = config.envFile || '.env';
    this.vars = {};
    this._load();
  }

  _load() {
    try {
      const content = fs.readFileSync(this.envFile, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) this.vars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      });
    } catch (e) { /* no .env file */ }
  }

  get(key) { return this.vars[key] || process.env[key]; }
  getAll() { return { ...this.vars }; }
  set(key, value) { this.vars[key] = value; process.env[key] = value; }
}

module.exports = { EnvProvider };
