const pool = require('../lib/vaultbrix');

class DispatchRouter {
  constructor(app) {
    this.app = app; // Express app — used to access app.locals.wsConnections and app.locals.broadcastToAgent
  }

  /**
   * Dispatch a validated workspace to its target.
   * @param {object} workspace — from sandboxWorkspace.getWorkspace()
   * @returns {{ success: boolean, error?: string, dispatched_at?: string }}
   */
  async dispatch(workspace) {
    switch (workspace.dispatch_target) {
      case 'local':      return this.dispatchToLocal(workspace);
      case 'enterprise': return this.dispatchToEnterprise(workspace);
      case 'cloud':      return this.dispatchToCloud(workspace);
      default:           return { success: false, error: `Unknown target: ${workspace.dispatch_target}` };
    }
  }

  async dispatchToLocal(workspace) {
    try {
      const wsConnections = this.app.locals.wsConnections;
      if (!wsConnections) {
        return { success: false, error: 'WebSocket connections unavailable' };
      }

      let targetWs = null;
      for (const [, conn] of wsConnections) {
        if (conn.agentId === workspace.dispatch_target_id) {
          targetWs = conn.ws;
          break;
        }
      }

      if (!targetWs || targetWs.readyState !== 1 /* OPEN */) {
        console.log('[DispatchRouter] Local agent offline:', workspace.dispatch_target_id);
        return { success: false, error: 'Local agent offline' };
      }

      const message = {
        type: 'code.ready',
        payload: {
          repo:        workspace.repo_url,
          branch:      workspace.branch,
          base_branch: workspace.base_branch,
          files:       workspace.files_snapshot,
        },
      };

      targetWs.send(JSON.stringify(message));
      console.log('[DispatchRouter] Dispatched to local agent:', workspace.dispatch_target_id);
      return { success: true, dispatched_at: new Date().toISOString() };
    } catch (err) {
      console.error('[DispatchRouter] dispatchToLocal error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async dispatchToEnterprise(workspace) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM tenant_vutler.nexus_nodes WHERE id = $1 LIMIT 1',
        [workspace.dispatch_target_id]
      );

      if (!rows.length) {
        console.log('[DispatchRouter] Nexus node not found:', workspace.dispatch_target_id);
        return { success: false, error: 'Nexus node not found' };
      }

      const node = rows[0];
      const payload = {
        type:    'code.ready',
        payload: {
          repo:        workspace.repo_url,
          branch:      workspace.branch,
          base_branch: workspace.base_branch,
          files:       workspace.files_snapshot,
        },
      };

      const response = await fetch(node.webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        console.error('[DispatchRouter] Enterprise webhook failed:', response.status, text);
        return { success: false, error: `Webhook returned ${response.status}: ${text}` };
      }

      console.log('[DispatchRouter] Dispatched to enterprise nexus node:', workspace.dispatch_target_id);
      return { success: true, dispatched_at: new Date().toISOString() };
    } catch (err) {
      console.error('[DispatchRouter] dispatchToEnterprise error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── Command Dispatch (Phase 2) ───────────────────────

  /**
   * Dispatch a command to a local daemon for execution.
   * The daemon will validate the command against its whitelist.
   *
   * @param {object} options
   * @param {string} options.targetId — daemon agent ID
   * @param {string} options.repo — repo name or URL
   * @param {string} options.command — command to execute (e.g. "npm test")
   * @param {string} [options.requestId] — optional correlation ID
   * @param {number} [options.timeout] — execution timeout in ms
   * @returns {{ success: boolean, error?: string }}
   */
  async dispatchCommand({ targetId, repo, command, requestId, timeout }) {
    try {
      const wsConnections = this.app.locals.wsConnections;
      if (!wsConnections) {
        return { success: false, error: 'WebSocket connections unavailable' };
      }

      let targetWs = null;
      for (const [, conn] of wsConnections) {
        if (conn.agentId === targetId) {
          targetWs = conn.ws;
          break;
        }
      }

      if (!targetWs || targetWs.readyState !== 1) {
        console.log('[DispatchRouter] Local daemon offline for cmd.exec:', targetId);
        return { success: false, error: 'Local daemon offline' };
      }

      // Check daemon capabilities
      const connEntry = [...wsConnections.values()].find(c => c.agentId === targetId);
      if (connEntry && connEntry.capabilities && !connEntry.capabilities.includes('cmd-exec')) {
        return { success: false, error: 'Local daemon does not support command execution. Update daemon config.' };
      }

      const message = {
        type: 'cmd.exec',
        payload: {
          repo,
          command,
          request_id: requestId || `cmd_${Date.now()}`,
          timeout: timeout || 300000,
        },
      };

      targetWs.send(JSON.stringify(message));
      console.log(`[DispatchRouter] Dispatched command "${command}" to local daemon:`, targetId);
      return { success: true, dispatched_at: new Date().toISOString() };
    } catch (err) {
      console.error('[DispatchRouter] dispatchCommand error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Combined dispatch: send code AND run a post-dispatch command.
   * Common flow: write files then run "npm test".
   */
  async dispatchWithCommand(workspace, command) {
    // Step 1: dispatch code
    const codeResult = await this.dispatch(workspace);
    if (!codeResult.success) return codeResult;

    // Step 2: dispatch command (only for local targets)
    if (workspace.dispatch_target !== 'local') {
      return { ...codeResult, command_skipped: true, reason: 'Commands only supported on local targets' };
    }

    const cmdResult = await this.dispatchCommand({
      targetId: workspace.dispatch_target_id,
      repo: workspace.repo_url,
      command,
    });

    return {
      ...codeResult,
      command_dispatched: cmdResult.success,
      command_error: cmdResult.error,
    };
  }

  async dispatchToCloud(workspace) {
    try {
      const broadcastToAgent = this.app.locals.broadcastToAgent;
      if (!broadcastToAgent) {
        return { success: false, error: 'broadcastToAgent unavailable' };
      }

      const payload = {
        repo:        workspace.repo_url,
        branch:      workspace.branch,
        base_branch: workspace.base_branch,
        files:       workspace.files_snapshot,
      };

      broadcastToAgent(workspace.dispatch_target_id, 'code.ready', payload);
      console.log('[DispatchRouter] Dispatched to cloud agent:', workspace.dispatch_target_id);
      return { success: true, dispatched_at: new Date().toISOString() };
    } catch (err) {
      console.error('[DispatchRouter] dispatchToCloud error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

let instance = null;
function getDispatchRouter(app) {
  if (!instance && app) instance = new DispatchRouter(app);
  return instance;
}

module.exports = { DispatchRouter, getDispatchRouter };
