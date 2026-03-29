'use strict';
const path = require('path');
const logger = require('../logger');

class WatchProvider {
  constructor() {
    this._watchers = new Map(); // folderPath → chokidar watcher
  }

  watch(folderPath, onFileAdded) {
    if (this._watchers.has(folderPath)) return;
    const chokidar = require('chokidar');
    const watcher = chokidar.watch(folderPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 1,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
    });
    watcher.on('add', (filePath) => {
      logger.info(`[WatchProvider] New file: ${filePath}`);
      if (onFileAdded) {
        const fs = require('fs');
        let size = 0;
        try { size = fs.statSync(filePath).size; } catch (_) {}
        onFileAdded({
          type: 'watch.file_added',
          path: filePath,
          name: path.basename(filePath),
          folder: folderPath,
          size,
        });
      }
    });
    this._watchers.set(folderPath, watcher);
    logger.info(`[WatchProvider] Watching: ${folderPath}`);
  }

  unwatch(folderPath) {
    const w = this._watchers.get(folderPath);
    if (w) { w.close(); this._watchers.delete(folderPath); }
  }

  unwatchAll() {
    for (const [, w] of this._watchers) w.close();
    this._watchers.clear();
  }

  listWatched() {
    return [...this._watchers.keys()];
  }
}

module.exports = { WatchProvider };
