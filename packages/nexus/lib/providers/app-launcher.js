'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const { getPermissionEngine } = require('../permission-engine');
const UnknownError = require('../errors/UnknownError');

class AppLauncher {
  async open(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new UnknownError(new Error(`File not found: ${filePath}`));
    }
    getPermissionEngine().validate(filePath, 'open_file');

    const cmd = process.platform === 'darwin' ? ['open', [filePath]]
              : process.platform === 'win32'  ? ['cmd', ['/c', 'start', '', filePath]]
              : ['xdg-open', [filePath]];

    return new Promise((resolve, reject) => {
      execFile(cmd[0], cmd[1], { timeout: 5000 }, (err) => {
        if (err) return reject(new UnknownError(err));
        resolve({ opened: true, path: filePath });
      });
    });
  }
}

module.exports = { AppLauncher };
