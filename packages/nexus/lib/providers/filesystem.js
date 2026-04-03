const fs = require('fs');
const path = require('path');

function inferMimeType(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

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
  readBinaryFile(filePath) {
    const resolved = this._resolve(filePath);
    const content = fs.readFileSync(resolved);
    return {
      path: resolved,
      contentBase64: content.toString('base64'),
      mimeType: inferMimeType(resolved),
      sizeBytes: content.length,
    };
  }
  writeFile(filePath, content) { fs.mkdirSync(path.dirname(this._resolve(filePath)), { recursive: true }); fs.writeFileSync(this._resolve(filePath), content); }
  listDir(dirPath) { return fs.readdirSync(this._resolve(dirPath), { withFileTypes: true }).map(d => ({ name: d.name, isDir: d.isDirectory() })); }
  exists(p) { return fs.existsSync(this._resolve(p)); }
  stat(p) { return fs.statSync(this._resolve(p)); }
  deleteFile(p) { fs.unlinkSync(this._resolve(p)); }
  mkdir(p) { fs.mkdirSync(this._resolve(p), { recursive: true }); }
}

module.exports = { FilesystemProvider };
