const fs = require('fs');
const path = require('path');

class OfflineMonitor {
  constructor(node, opts = {}) {
    this.node = node;
    this.thresholdMs = (opts.disconnect_threshold_seconds || 300) * 1000; // 5 min default
    this.queuePath = opts.queue_path || path.join(require('os').homedir(), '.vutler', 'offline-queue');
    this.lastCloudContact = Date.now();
    this.isOffline = false;
    this.checkInterval = null;

    // Ensure queue directory exists
    fs.mkdirSync(this.queuePath, { recursive: true });
  }

  start() {
    this.checkInterval = setInterval(() => this._check(), 30000); // check every 30s
    this.node.log('[Offline] Monitor started (threshold: ' + (this.thresholdMs/1000) + 's)');
  }

  stop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.cronTimers) this.cronTimers.forEach(t => clearInterval(t));
  }

  onCloudContact() {
    this.lastCloudContact = Date.now();
    if (this.isOffline) {
      this.isOffline = false;
      this.node.log('[Offline] Cloud connection restored — syncing queue');
      this._syncQueue();
    }
  }

  _check() {
    if (Date.now() - this.lastCloudContact > this.thresholdMs && !this.isOffline) {
      this.isOffline = true;
      this.node.log('[Offline] Cloud unreachable for ' + (this.thresholdMs/1000) + 's — entering offline mode');
      this._startCronTasks();
    }
  }

  // Queue a task result for later sync
  async enqueue(taskId, action, payload) {
    const item = { taskId, action, payload, created_at: new Date().toISOString() };
    const filename = Date.now() + '-' + taskId.slice(0,8) + '.json';
    fs.writeFileSync(path.join(this.queuePath, filename), JSON.stringify(item));
    this.node.log('[Offline] Queued: ' + action + ' for task ' + taskId);
  }

  async _syncQueue() {
    const files = fs.readdirSync(this.queuePath).filter(f => f.endsWith('.json')).sort();
    if (files.length === 0) return;

    this.node.log('[Offline] Syncing ' + files.length + ' queued items');

    for (const file of files) {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(this.queuePath, file), 'utf8'));
        await this.node._apiCall('POST', '/api/v1/nexus/' + this.node.nodeId + '/sync', { items: [item] });
        fs.unlinkSync(path.join(this.queuePath, file));
      } catch (e) {
        this.node.log('[Offline] Sync failed for ' + file + ': ' + e.message);
        break; // Stop on first failure, retry next time
      }
    }
  }

  _startCronTasks() {
    const config = this.node.offlineConfig || {};
    const tasks = config.cron_tasks || [];
    if (tasks.length === 0) return;

    this.node.log('[Offline] Starting ' + tasks.length + ' cron tasks');
    // Simple interval-based execution (not full cron syntax)
    this.cronTimers = tasks.map(task => {
      const intervalMs = (task.interval_seconds || 300) * 1000;
      return setInterval(async () => {
        try {
          const output = await this.node.providers.shell?.exec(task.command);
          await this.enqueue(task.id || 'cron-' + Date.now(), 'complete', { output: String(output || '') });
          this.node.log('[Offline] Cron executed: ' + task.command);
        } catch (e) {
          this.node.log('[Offline] Cron failed: ' + task.command + ' — ' + e.message);
        }
      }, intervalMs);
    });
  }

  getStatus() {
    const files = fs.existsSync(this.queuePath) ? fs.readdirSync(this.queuePath).filter(f => f.endsWith('.json')).length : 0;
    return { isOffline: this.isOffline, queueDepth: files, lastCloudContact: this.lastCloudContact };
  }
}

module.exports = { OfflineMonitor };
