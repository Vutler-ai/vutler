'use strict';

const fs = require('fs/promises');
const path = require('path');
const chokidar = require('chokidar');

class BmadAutoSync {
  constructor() {
    this.driveRoot = process.env.DRIVE_STORAGE_PATH || '/data/drive';
    this.workspaceRoot = path.resolve(__dirname, '..');
    this.isRunning = false;
    this.watcher = null;
    this.syncQueue = new Set();
    this.debounceTimer = null;
    
    // Mapping des fichiers à synchroniser
    this.mapping = [
      {
        src: path.join(this.workspaceRoot, 'docs/bmad/BMAD_MASTER.md'),
        dest: path.join(this.driveRoot, 'Workspace/projects/Vutler/BMAD/BMAD_MASTER.md')
      },
      {
        src: path.join(this.workspaceRoot, 'app/custom/docs/bmad-mongo-to-pg-migration.md'),
        dest: path.join(this.driveRoot, 'Workspace/projects/Vutler/BMAD/bmad-mongo-to-pg-migration.md')
      },
      {
        src: path.join(this.workspaceRoot, 'app/custom/docs/bmad-mail-approval-phase-b.md'),
        dest: path.join(this.driveRoot, 'Workspace/projects/Vutler/BMAD/bmad-mail-approval-phase-b.md')
      }
    ];
  }

  async start() {
    if (this.isRunning) {
      console.log('[BmadAutoSync] Already running');
      return;
    }

    try {
      console.log('[BmadAutoSync] Starting BMAD auto-sync service...');
      
      // Synchronisation initiale
      await this.syncAll();
      
      // Configuration du watcher
      const watchPaths = this.mapping.map(item => item.src);
      this.watcher = chokidar.watch(watchPaths, {
        ignored: /./,
        persistent: true,
        ignoreInitial: true
      });

      this.watcher
        .on('change', (filePath) => this.queueSync(filePath))
        .on('add', (filePath) => this.queueSync(filePath))
        .on('error', (error) => console.error('[BmadAutoSync] Watcher error:', error));

      this.isRunning = true;
      console.log('[BmadAutoSync] Service started successfully');
      console.log('[BmadAutoSync] Watching paths:', watchPaths);
      
    } catch (error) {
      console.error('[BmadAutoSync] Failed to start:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[BmadAutoSync] Stopping service...');
    
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.isRunning = false;
    console.log('[BmadAutoSync] Service stopped');
  }

  queueSync(filePath) {
    console.log('[BmadAutoSync] File changed:', filePath);
    this.syncQueue.add(filePath);
    
    // Debounce pour éviter trop de synchronisations
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(async () => {
      await this.processSyncQueue();
    }, 1000); // Attendre 1 seconde avant de synchroniser
  }

  async processSyncQueue() {
    if (this.syncQueue.size === 0) {
      return;
    }

    const filesToSync = Array.from(this.syncQueue);
    this.syncQueue.clear();

    console.log('[BmadAutoSync] Processing sync queue:', filesToSync.length, 'files');

    for (const filePath of filesToSync) {
      await this.syncFile(filePath);
    }
  }

  async syncFile(srcPath) {
    try {
      const mapping = this.mapping.find(item => item.src === srcPath);
      if (!mapping) {
        console.warn('[BmadAutoSync] No mapping found for:', srcPath);
        return;
      }

      // Créer le répertoire de destination si nécessaire
      await fs.mkdir(path.dirname(mapping.dest), { recursive: true });
      
      // Copier le fichier
      await fs.copyFile(mapping.src, mapping.dest);
      
      console.log('[BmadAutoSync] Synced:', path.basename(srcPath), '→', mapping.dest);
      
    } catch (error) {
      console.error('[BmadAutoSync] Failed to sync file:', srcPath, error);
    }
  }

  async syncAll() {
    console.log('[BmadAutoSync] Starting initial sync...');
    
    let syncedCount = 0;
    
    for (const item of this.mapping) {
      try {
        // Vérifier si le fichier source existe
        await fs.access(item.src);
        
        // Créer le répertoire de destination
        await fs.mkdir(path.dirname(item.dest), { recursive: true });
        
        // Copier le fichier
        await fs.copyFile(item.src, item.dest);
        syncedCount++;
        
        console.log('[BmadAutoSync] Initial sync:', path.basename(item.src), '✓');
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn('[BmadAutoSync] Source file not found:', item.src);
        } else {
          console.error('[BmadAutoSync] Failed to sync:', item.src, error);
        }
      }
    }
    
    console.log('[BmadAutoSync] Initial sync complete. Files synced:', syncedCount);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      driveRoot: this.driveRoot,
      watchedFiles: this.mapping.length,
      queueSize: this.syncQueue.size
    };
  }
}

module.exports = BmadAutoSync;
