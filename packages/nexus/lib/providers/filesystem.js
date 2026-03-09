const fs = require('fs');
const path = require('path');

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
  listDir(dirPath) { return fs.readdirSync(this._resolve(dirPath), { withFileTypes: true }).map(d => ({ name: d.name, isDir: d.isDirectory() })); }
  exists(p) { return fs.existsSync(this._resolve(p)); }
  stat(p) { return fs.statSync(this._resolve(p)); }
  deleteFile(p) { fs.unlinkSync(this._resolve(p)); }
  mkdir(p) { fs.mkdirSync(this._resolve(p), { recursive: true }); }
}

module.exports = { FilesystemProvider };
