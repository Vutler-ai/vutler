'use strict';

const pool = require('../lib/vaultbrix');
const {
  DEFAULT_WORKSPACE,
  DEFAULT_SNIPARA_SWARM_ID,
  callSniparaTool,
  resolveSniparaConfig,
} = require('./sniparaResolver');

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || DEFAULT_WORKSPACE;
}

function normalizePriority(priority) {
  if (typeof priority === 'number' && Number.isFinite(priority)) {
    return Math.max(0, Math.min(100, Math.round(priority)));
  }

  const value = String(priority || 'medium').toLowerCase();
  if (/(p0|urgent|critical|critique|asap)/.test(value)) return 100;
  if (/(p1|high|haute priorite|haute priorité)/.test(value)) return 80;
  if (/(p3|low|faible priorite|faible priorité|quand possible)/.test(value)) return 20;
  return 50;
}

function normalizeEvidence(evidence) {
  if (!evidence) return null;
  if (Array.isArray(evidence)) return evidence;
  if (typeof evidence === 'object') return [evidence];
  return [{ type: 'note', text: String(evidence) }];
}

class SniparaTaskAdapter {
  async resolve(workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const config = await resolveSniparaConfig(pool, ws);
    const swarmId = config?.swarmId || DEFAULT_SNIPARA_SWARM_ID || null;

    if (!config?.configured || !config?.apiKey || !config?.apiUrl || !swarmId) {
      throw new Error('Snipara task adapter is not configured for workspace');
    }

    return { workspaceId: ws, config, swarmId };
  }

  async call(workspaceId, toolName, args = {}) {
    const ws = normalizeWorkspaceId(workspaceId);
    const result = await callSniparaTool({
      db: pool,
      workspaceId: ws,
      toolName,
      args,
    });

    if (result == null) {
      throw new Error(`Snipara ${toolName} unavailable for workspace`);
    }

    return result;
  }

  async createTask(workspaceId, input = {}) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    return this.call(ws, 'rlm_task_create', {
      swarm_id: swarmId,
      title: input.title || 'Nouvelle tache',
      description: input.description || '',
      priority: normalizePriority(input.priority),
      ...(input.agentId ? { agent_id: input.agentId } : {}),
      ...(input.dependsOn?.length ? { depends_on: input.dependsOn } : {}),
      ...(input.deadline ? { deadline: input.deadline } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  }

  async listTasks(workspaceId) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    return this.call(ws, 'rlm_tasks', { swarm_id: swarmId });
  }

  async claimTask(workspaceId, { taskId, agentId }) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    const attemptClaim = async (resolvedAgentId) => this.call(ws, 'rlm_task_claim', {
      swarm_id: swarmId,
      task_id: taskId,
      agent_id: resolvedAgentId,
    });

    try {
      return await attemptClaim(agentId);
    } catch (err) {
      if (!/Agent not in swarm/i.test(String(err.message || err))) throw err;

      const joined = await this.call(ws, 'rlm_swarm_join', {
        swarm_id: swarmId,
        agent_id: agentId,
      });

      const candidates = Array.from(new Set([agentId, joined?.agent_id].filter(Boolean)));
      let lastError = err;

      for (const candidate of candidates) {
        try {
          return await attemptClaim(candidate);
        } catch (claimErr) {
          lastError = claimErr;
        }
      }

      throw lastError;
    }
  }

  async completeTask(workspaceId, { taskId, agentId, output }) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    const attemptComplete = async () => this.call(ws, 'rlm_task_complete', {
      swarm_id: swarmId,
      task_id: taskId,
      agent_id: agentId,
      output: output || 'Done',
    });

    try {
      return await attemptComplete();
    } catch (err) {
      if (!/not assigned to agent/i.test(String(err.message || err))) throw err;
      await this.claimTask(ws, { taskId, agentId });
      return attemptComplete();
    }
  }

  async createHtask(workspaceId, input = {}) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    return this.call(ws, 'rlm_htask_create', {
      swarm_id: swarmId,
      level: input.level,
      title: input.title,
      description: input.description || '',
      owner: input.owner || 'jarvis',
      ...(input.parentId ? { parent_id: input.parentId } : {}),
      ...(input.workstreamType ? { workstream_type: input.workstreamType } : {}),
    });
  }

  async blockHtask(workspaceId, { taskId, blockerType, blockerReason }) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    return this.call(ws, 'rlm_htask_block', {
      swarm_id: swarmId,
      task_id: taskId,
      blocker_type: blockerType,
      blocker_reason: blockerReason,
    });
  }

  async unblockHtask(workspaceId, { taskId, resolution }) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    const withResolution = {
      swarm_id: swarmId,
      task_id: taskId,
      ...(resolution ? { resolution } : {}),
    };

    try {
      return await this.call(ws, 'rlm_htask_unblock', withResolution);
    } catch (err) {
      if (!/unexpected keyword argument 'resolution'/i.test(String(err.message || err))) throw err;
      return this.call(ws, 'rlm_htask_unblock', {
        swarm_id: swarmId,
        task_id: taskId,
      });
    }
  }

  async completeHtask(workspaceId, { taskId, result, evidence }) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    const normalizedEvidence = normalizeEvidence(evidence);
    const args = {
      swarm_id: swarmId,
      task_id: taskId,
      result: result || 'Done',
      ...(normalizedEvidence ? { evidence: normalizedEvidence } : {}),
    };

    try {
      return await this.call(ws, 'rlm_htask_complete', args);
    } catch (err) {
      if (!/object has no attribute 'get'/i.test(String(err.message || err)) || !normalizedEvidence) throw err;
      return this.call(ws, 'rlm_htask_complete', {
        swarm_id: swarmId,
        task_id: taskId,
        result: result || 'Done',
      });
    }
  }

  async verifyHtaskClosure(workspaceId, { taskId }) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    return this.call(ws, 'rlm_htask_verify_closure', {
      swarm_id: swarmId,
      task_id: taskId,
    });
  }

  async closeHtask(workspaceId, { taskId }) {
    const { swarmId, workspaceId: ws } = await this.resolve(workspaceId);
    return this.call(ws, 'rlm_htask_close', {
      swarm_id: swarmId,
      task_id: taskId,
    });
  }
}

let singleton = null;

function getSniparaTaskAdapter() {
  if (!singleton) singleton = new SniparaTaskAdapter();
  return singleton;
}

module.exports = {
  SniparaTaskAdapter,
  getSniparaTaskAdapter,
  normalizePriority,
  normalizeEvidence,
};
