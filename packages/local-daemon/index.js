'use strict';

const WebSocket = require('ws');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CommandRunner } = require('./src/command-runner');

const LOG_PREFIX = '[VutlerDaemon]';

class VutlerDaemon {
  constructor(config) {
    this.wsUrl = config.wsUrl || 'wss://api.vutler.com/ws/chat';
    this.apiKey = config.apiKey;

    // Legacy flat config support
    this.reposDir = config.reposDir || path.join(process.env.HOME, 'Developer');
    this.allowedRepos = config.allowedRepos || [];

    // New structured repos config (Phase 2)
    // If config.repos exists, build the CommandRunner from it
    // Otherwise fall back to legacy allowedRepos (git-sync only, no commands)
    this.reposConfig = config.repos || {};
    this.commandRunner = new CommandRunner(this.reposConfig);

    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.running = false;
  }

  start() {
    this.running = true;
    this.connect();

    const repoCount = Object.keys(this.reposConfig).length;
    const cmdCount = Object.values(this.reposConfig).reduce(
      (sum, r) => sum + (r.allowedCommands?.length || 0), 0
    );

    console.log(`${LOG_PREFIX} Started. Connecting to ${this.wsUrl}`);
    if (repoCount > 0) {
      console.log(`${LOG_PREFIX} Command runner: ${repoCount} repo(s), ${cmdCount} whitelisted command(s)`);
    }
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
      this.reconnectDelay = 1000;

      // Register with capabilities
      const capabilities = ['git-sync'];
      if (Object.keys(this.reposConfig).length > 0) {
        capabilities.push('cmd-exec');
      }

      this.send({
        type: 'agent.register',
        data: {
          mode: 'local-daemon',
          capabilities,
          repos: this.commandRunner.listAllRepos(),
        }
      });
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

      case 'cmd.exec':
        await this.handleCmdExec(msg.payload || msg.data);
        break;

      case 'git.pull':
        await this.handleGitPull(msg.payload || msg.data);
        break;

      case 'status.request':
        this.handleStatusRequest();
        break;

      default:
        console.log(`${LOG_PREFIX} Unknown message type: ${msg.type}`);
    }
  }

  // ─── Status ──────────────────────────────────────────

  handleStatusRequest() {
    this.send({
      type: 'status.response',
      data: {
        status: 'online',
        repos_dir: this.reposDir,
        allowed_repos: this.allowedRepos,
        repos: this.commandRunner.listAllRepos(),
        capabilities: Object.keys(this.reposConfig).length > 0
          ? ['git-sync', 'cmd-exec']
          : ['git-sync'],
      }
    });
  }

  // ─── Code Dispatch (Phase 1) ─────────────────────────

  async handleCodeReady({ repo, branch, base_branch, files }) {
    const repoName = repo.split('/').pop().replace('.git', '');

    // Security: check whitelist (legacy + new)
    const repoDir = this._resolveRepoDir(repoName);
    if (!repoDir) {
      console.error(`${LOG_PREFIX} Repo "${repoName}" not configured. Rejecting.`);
      this.send({ type: 'dispatch.result', data: { success: false, error: `Repo "${repoName}" not configured` } });
      return;
    }

    try {
      if (!fs.existsSync(repoDir)) {
        console.error(`${LOG_PREFIX} Repo dir not found: ${repoDir}`);
        this.send({ type: 'dispatch.result', data: { success: false, error: `Repo not found locally: ${repoDir}` } });
        return;
      }

      console.log(`${LOG_PREFIX} Syncing ${files.length} files to ${repoName}/${branch}`);
      execSync(`git fetch origin`, { cwd: repoDir, stdio: 'pipe' });

      try {
        execSync(`git checkout -b ${branch} origin/${base_branch || 'main'}`, { cwd: repoDir, stdio: 'pipe' });
      } catch {
        execSync(`git checkout ${branch}`, { cwd: repoDir, stdio: 'pipe' });
      }

      for (const file of files) {
        const filePath = path.join(repoDir, file.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content, 'utf8');
        console.log(`${LOG_PREFIX}   Wrote ${file.path}`);
      }

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

  // ─── Command Execution (Phase 2) ─────────────────────

  async handleCmdExec({ repo, command, request_id, timeout }) {
    const repoName = repo?.split('/').pop().replace('.git', '') || repo;

    console.log(`${LOG_PREFIX} cmd.exec request: "${command}" in ${repoName}`);

    const result = await this.commandRunner.exec(repoName, command, {
      timeout: timeout || 300_000,
    });

    this.send({
      type: 'cmd.exec.result',
      data: {
        request_id,
        repo: repoName,
        command,
        ...result,
      }
    });
  }

  // ─── Git Pull ────────────────────────────────────────

  async handleGitPull({ repo }) {
    const repoName = repo.split('/').pop().replace('.git', '');
    const repoDir = this._resolveRepoDir(repoName);

    if (!repoDir) {
      this.send({ type: 'git.pull.result', data: { success: false, error: `Repo "${repoName}" not configured` } });
      return;
    }

    try {
      execSync(`git pull --rebase`, { cwd: repoDir, stdio: 'pipe' });
      console.log(`${LOG_PREFIX} Pulled ${repoName}`);
      this.send({ type: 'git.pull.result', data: { success: true, repo: repoName } });
    } catch (err) {
      this.send({ type: 'git.pull.result', data: { success: false, error: err.message } });
    }
  }

  // ─── Helpers ─────────────────────────────────────────

  /**
   * Resolve repo directory from either new config.repos or legacy config.
   */
  _resolveRepoDir(repoName) {
    // Try new structured config first
    if (this.reposConfig[repoName]?.path) {
      return this.reposConfig[repoName].path;
    }

    // Fall back to legacy flat config
    if (this.allowedRepos.length === 0 || this.allowedRepos.includes(repoName)) {
      return path.join(this.reposDir, repoName);
    }

    return null;
  }
}

module.exports = { VutlerDaemon };
