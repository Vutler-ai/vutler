'use strict';

const WebSocket = require('ws');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[VutlerDaemon]';

class VutlerDaemon {
  constructor(config) {
    this.wsUrl = config.wsUrl || 'wss://api.vutler.com/ws/chat';
    this.apiKey = config.apiKey;
    this.reposDir = config.reposDir || path.join(process.env.HOME, 'Developer');
    this.allowedRepos = config.allowedRepos || []; // whitelist
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.running = false;
  }

  start() {
    this.running = true;
    this.connect();
    console.log(`${LOG_PREFIX} Started. Connecting to ${this.wsUrl}`);
  }

  stop() {
    this.running = false;
    if (this.ws) this.ws.close();
    console.log(`${LOG_PREFIX} Stopped.`);
  }

  connect() {
    if (!this.running) return;

    this.ws = new WebSocket(this.wsUrl, {
      headers: { 'x-api-key': this.apiKey }
    });

    this.ws.on('open', () => {
      console.log(`${LOG_PREFIX} Connected to Vutler cloud`);
      this.reconnectDelay = 1000; // reset backoff
      // Register as local daemon
      this.send({ type: 'agent.register', data: { mode: 'local-daemon', capabilities: ['git-sync'] } });
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        this.handleMessage(msg);
      } catch (err) {
        console.error(`${LOG_PREFIX} Invalid message: ${err.message}`);
      }
    });

    this.ws.on('close', () => {
      console.log(`${LOG_PREFIX} Disconnected. Reconnecting in ${this.reconnectDelay}ms...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error(`${LOG_PREFIX} WebSocket error: ${err.message}`);
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'ping':
        this.send({ type: 'pong', data: { timestamp: Date.now() } });
        break;

      case 'code.ready':
        await this.handleCodeReady(msg.payload || msg.data);
        break;

      case 'git.pull':
        await this.handleGitPull(msg.payload || msg.data);
        break;

      case 'status.request':
        this.send({ type: 'status.response', data: { status: 'online', repos_dir: this.reposDir, allowed_repos: this.allowedRepos } });
        break;

      default:
        console.log(`${LOG_PREFIX} Unknown message type: ${msg.type}`);
    }
  }

  async handleCodeReady({ repo, branch, base_branch, files }) {
    const repoName = repo.split('/').pop().replace('.git', '');

    // Security: check whitelist
    if (this.allowedRepos.length > 0 && !this.allowedRepos.includes(repoName)) {
      console.error(`${LOG_PREFIX} Repo "${repoName}" not in whitelist. Rejecting.`);
      this.send({ type: 'dispatch.result', data: { success: false, error: `Repo "${repoName}" not whitelisted` } });
      return;
    }

    const repoDir = path.join(this.reposDir, repoName);

    try {
      if (!fs.existsSync(repoDir)) {
        console.error(`${LOG_PREFIX} Repo dir not found: ${repoDir}`);
        this.send({ type: 'dispatch.result', data: { success: false, error: `Repo not found locally: ${repoDir}` } });
        return;
      }

      // Fetch + create branch
      console.log(`${LOG_PREFIX} Syncing ${files.length} files to ${repoName}/${branch}`);
      execSync(`git fetch origin`, { cwd: repoDir, stdio: 'pipe' });

      try {
        execSync(`git checkout -b ${branch} origin/${base_branch || 'main'}`, { cwd: repoDir, stdio: 'pipe' });
      } catch {
        // Branch might already exist
        execSync(`git checkout ${branch}`, { cwd: repoDir, stdio: 'pipe' });
      }

      // Write files
      for (const file of files) {
        const filePath = path.join(repoDir, file.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content, 'utf8');
        console.log(`${LOG_PREFIX}   Wrote ${file.path}`);
      }

      // Stage + commit
      execSync(`git add -A`, { cwd: repoDir, stdio: 'pipe' });
      execSync(`git commit -m "cloud-sandbox: ${branch}"`, { cwd: repoDir, stdio: 'pipe' });

      const sha = execSync(`git rev-parse HEAD`, { cwd: repoDir, stdio: 'pipe' }).toString().trim();

      console.log(`${LOG_PREFIX} Synced successfully. Commit: ${sha}`);
      this.send({ type: 'dispatch.result', data: { success: true, branch, commit_sha: sha, files_count: files.length } });

    } catch (err) {
      console.error(`${LOG_PREFIX} Code sync failed: ${err.message}`);
      this.send({ type: 'dispatch.result', data: { success: false, error: err.message } });
    }
  }

  async handleGitPull({ repo }) {
    const repoName = repo.split('/').pop().replace('.git', '');
    const repoDir = path.join(this.reposDir, repoName);

    try {
      execSync(`git pull --rebase`, { cwd: repoDir, stdio: 'pipe' });
      console.log(`${LOG_PREFIX} Pulled ${repoName}`);
      this.send({ type: 'git.pull.result', data: { success: true, repo: repoName } });
    } catch (err) {
      this.send({ type: 'git.pull.result', data: { success: false, error: err.message } });
    }
  }
}

module.exports = { VutlerDaemon };
