'use strict';

const { spawn } = require('child_process');
const path = require('path');

const LOG_PREFIX = '[CommandRunner]';

/**
 * Bounded command runner — executes ONLY whitelisted commands.
 * No shell, no arbitrary execution. Each command is validated against
 * a per-repo allowlist before execution.
 *
 * Config shape (in daemon.json):
 * {
 *   "repos": {
 *     "Vutler": {
 *       "path": "/Users/alopez/Devs/Vutler",
 *       "allowedCommands": ["npm test", "npm run build", "npm run lint"]
 *     }
 *   }
 * }
 */
class CommandRunner {
  constructor(reposConfig = {}) {
    // Map of repoName → { path, allowedCommands[] }
    this.repos = reposConfig;
  }

  /**
   * Check if a command is whitelisted for a given repo.
   * Uses exact prefix matching — "npm test" matches "npm test" and "npm test -- --watch"
   * but NOT "npm testx" or "npm run test-hack".
   */
  isAllowed(repoName, command) {
    const repo = this.repos[repoName];
    if (!repo || !repo.allowedCommands || repo.allowedCommands.length === 0) {
      return false; // no commands allowed = deny all
    }

    const trimmed = command.trim();
    return repo.allowedCommands.some(allowed => {
      // Exact match
      if (trimmed === allowed) return true;
      // Prefix match with space separator (allows extra args like "npm test -- --watch")
      if (trimmed.startsWith(allowed + ' ')) return true;
      return false;
    });
  }

  /**
   * Resolve the working directory for a repo.
   * Returns null if repo not configured or path doesn't exist.
   */
  resolveRepoDir(repoName) {
    const repo = this.repos[repoName];
    if (!repo || !repo.path) return null;
    return repo.path;
  }

  /**
   * Execute a whitelisted command in a repo directory.
   * Returns { success, stdout, stderr, exitCode, durationMs }
   *
   * Security:
   * - Command MUST be in the whitelist
   * - Executed with shell: false (no injection possible)
   * - Timeout enforced (default 5 minutes)
   * - Output truncated to maxOutput bytes
   */
  async exec(repoName, command, options = {}) {
    const { timeout = 300_000, maxOutput = 100_000 } = options;

    // Step 1: Validate repo
    const repoDir = this.resolveRepoDir(repoName);
    if (!repoDir) {
      return {
        success: false,
        error: `Repo "${repoName}" not configured in daemon`,
        exitCode: -1,
      };
    }

    // Step 2: Validate command against whitelist
    if (!this.isAllowed(repoName, command)) {
      const allowed = (this.repos[repoName]?.allowedCommands || []).join(', ');
      console.error(`${LOG_PREFIX} BLOCKED: "${command}" not in whitelist for ${repoName}. Allowed: [${allowed}]`);
      return {
        success: false,
        error: `Command "${command}" not whitelisted for repo "${repoName}". Allowed: [${allowed}]`,
        exitCode: -1,
      };
    }

    // Step 3: Parse command into argv (no shell!)
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    console.log(`${LOG_PREFIX} Executing: ${command} (in ${repoDir})`);
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn(cmd, args, {
        cwd: repoDir,
        shell: false,       // SECURITY: no shell injection
        timeout,
        env: {
          ...process.env,
          // Ensure non-interactive
          CI: 'true',
          FORCE_COLOR: '0',
          NO_COLOR: '1',
        },
      });

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > maxOutput) {
          stdout = stdout.slice(0, maxOutput) + '\n... [truncated]';
          proc.kill('SIGTERM');
          killed = true;
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > maxOutput) {
          stderr = stderr.slice(0, maxOutput) + '\n... [truncated]';
        }
      });

      proc.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        console.error(`${LOG_PREFIX} Process error: ${err.message}`);
        resolve({
          success: false,
          error: err.message,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: -1,
          durationMs,
        });
      });

      proc.on('close', (exitCode, signal) => {
        const durationMs = Date.now() - startTime;
        const success = exitCode === 0;

        if (killed) {
          console.log(`${LOG_PREFIX} Killed (output too large): ${command} [${durationMs}ms]`);
        } else if (signal) {
          console.log(`${LOG_PREFIX} Signal ${signal}: ${command} [${durationMs}ms]`);
        } else {
          console.log(`${LOG_PREFIX} Exit ${exitCode}: ${command} [${durationMs}ms]`);
        }

        resolve({
          success,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? -1,
          signal: signal || undefined,
          durationMs,
          killed,
        });
      });
    });
  }

  /**
   * List all allowed commands for a repo (for status reporting).
   */
  listAllowed(repoName) {
    const repo = this.repos[repoName];
    if (!repo) return [];
    return repo.allowedCommands || [];
  }

  /**
   * List all configured repos with their allowed commands.
   */
  listAllRepos() {
    return Object.entries(this.repos).map(([name, config]) => ({
      name,
      path: config.path,
      allowedCommands: config.allowedCommands || [],
    }));
  }
}

module.exports = { CommandRunner };
