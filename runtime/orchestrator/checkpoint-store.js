'use strict';

const fs = require('fs');
const path = require('path');

class InMemoryCheckpointStore {
  constructor(initial = null) {
    this._snapshot = initial ? JSON.parse(JSON.stringify(initial)) : null;
  }

  async load() {
    return this._snapshot ? JSON.parse(JSON.stringify(this._snapshot)) : null;
  }

  async save(snapshot) {
    this._snapshot = JSON.parse(JSON.stringify(snapshot));
  }
}

class FileCheckpointStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(snapshot) {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    const payload = JSON.stringify(snapshot, null, 2);
    await fs.promises.writeFile(tempPath, payload, 'utf8');
    await fs.promises.rename(tempPath, this.filePath);
  }
}

module.exports = {
  InMemoryCheckpointStore,
  FileCheckpointStore,
};
