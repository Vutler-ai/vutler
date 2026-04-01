'use strict';

const pool = require('../../../lib/vaultbrix');
const { chat: llmChat } = require('../../../services/llmRouter');
const { fetchWithTimeout } = require('../../../services/fetchWithTimeout');
const { insertChatMessage } = require('../../../services/chatMessages');
const { getSniparaTaskAdapter } = require('../../../services/sniparaTaskAdapter');
const { createSniparaGateway } = require('../../../services/snipara/gateway');
const { DEFAULT_SNIPARA_SWARM_ID } = require('../../../services/sniparaResolver');
const {
  ALWAYS_ON_TOOL_SKILL_KEYS,
  buildInternalPlacementInstruction,
  normalizeCapabilities,
  splitCapabilities,
} = require('../../../services/agentConfigPolicy');
const { resolveWorkspaceDriveRoot } = require('../../../services/drivePlacementPolicy');
const {
  buildAgentDrivePlacementInstruction,
  resolveAgentDriveRoot,
} = require('../../../services/agentDriveService');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const TEAM_CHANNEL_NAME = 'team-coordination';
const SNIPARA_TIMEOUT_MS = 15_000;

const AGENT_CAPABILITIES = {
  mike: ['engineering', 'code', 'architecture', 'devops'],
  michael: ['frontend', 'ui/ux', 'design', 'css', 'ui', 'ux', 'landing page'],
  andrea: ['legal', 'hr', 'admin', 'compliance', 'contracts', 'documentation commerciale'],
  luna: ['content', 'marketing', 'social media', 'copywriting', 'presentation'],
  rex: ['monitoring', 'security', 'health checks', 'ops', 'operations'],
  marcus: ['finance', 'trading', 'analytics', 'data'],
  max: ['sales', 'crm', 'partnerships', 'outreach'],
  nora: ['support', 'onboarding', 'training', 'faq'],
  oscar: ['qa', 'testing', 'bug', 'quality'],
  philip: ['documentation', 'knowledge base', 'wiki', 'docs'],
  sentinel: ['security', 'audit', 'threat detection', 'threat'],
  victor: ['product', 'strategy', 'roadmap']
};

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || DEFAULT_WORKSPACE;
}

function parsePriority(priority) {
  if (typeof priority === 'number' && Number.isFinite(priority)) {
    if (priority >= 90) return 'high';
    if (priority <= 30) return 'low';
    return 'medium';
  }
  const value = String(priority || 'medium').toLowerCase();
  if (/(urgent|high|critique|critical|asap|haute priorite|haute priorité)/.test(value)) return 'high';
  if (/(low|faible priorite|faible priorité|quand possible)/.test(value)) return 'low';
  return 'medium';
}

function toSniparaPriority(priority) {
  if (typeof priority === 'number' && Number.isFinite(priority)) {
    return Math.max(0, Math.min(100, Math.round(priority)));
  }

  const value = String(priority || 'medium').toLowerCase();
  if (/(p0|urgent|critical|critique|asap)/.test(value)) return 100;
  if (/(p1|high|haute priorite|haute priorité)/.test(value)) return 80;
  if (/(p3|low|faible priorite|faible priorité|quand possible)/.test(value)) return 20;
  return 50;
}

function humanizeAgent(agentId) {
  const clean = String(agentId || 'agent').trim();
  if (!clean) return 'Agent';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeRemoteStatus(status, eventType = '') {
  const value = String(status || '').trim().toLowerCase();
  const fromEvent = String(eventType || '').trim().toLowerCase();

  if (value === 'claimed' || value === 'claiming' || value === 'in_progress' || value === 'in-progress') return 'in_progress';
  if (value === 'done' || value === 'completed' || value === 'complete' || value === 'closure_ready' || value === 'closed') return 'completed';
  if (value === 'failed' || value === 'error') return 'failed';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  if (value === 'blocked') return 'blocked';
  if (value === 'pending' || value === 'queued' || value === 'open') return 'pending';

  if (fromEvent.endsWith('.claimed')) return 'in_progress';
  if (fromEvent.endsWith('.completed') || fromEvent.endsWith('.closure_ready') || fromEvent.endsWith('.closed')) return 'completed';
  if (fromEvent.endsWith('.failed')) return 'failed';
  if (fromEvent.endsWith('.blocked')) return 'blocked';
  if (fromEvent.endsWith('.created')) return 'pending';

  return 'pending';
}

function buildWorkspacePlacementInstruction(driveRoot, agentDriveRoot = null) {
  const normalizedRoot = String(agentDriveRoot || driveRoot || '/projects/Vutler').trim() || '/projects/Vutler';
  let instruction = buildInternalPlacementInstruction().replaceAll('/projects/Vutler', normalizedRoot);
  if (agentDriveRoot) {
    instruction += ` ${buildAgentDrivePlacementInstruction(agentDriveRoot)}`;
  }
  return instruction;
}

async function loadAgentDirectory(workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const result = await pool.query(
    `SELECT id, name, username, role, workspace_id
     FROM ${SCHEMA}.agents
     WHERE workspace_id = $1`,
    [ws]
  );
  return result.rows;
}

class SwarmCoordinator {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || null;
    this.apiKey = options.apiKey || null;
    this.swarmId = options.swarmId || process.env.SNIPARA_SWARM_ID || null;
    this.sniparaTaskColumnChecked = false;
    this.sniparaTaskColumnAvailable = false;
  }

  async init() {
    await this.ensureSniparaTaskColumn();
    await this.ensureTeamChannel(DEFAULT_WORKSPACE);
  }

  async ensureSniparaTaskColumn() {
    if (this.sniparaTaskColumnChecked) return this.sniparaTaskColumnAvailable;

    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'tasks' AND column_name = 'snipara_task_id'
       LIMIT 1`,
      [SCHEMA]
    );

    this.sniparaTaskColumnChecked = true;
    this.sniparaTaskColumnAvailable = result.rows.length > 0;

    if (!this.sniparaTaskColumnAvailable) {
      console.warn('[SwarmCoordinator] snipara_task_id column missing; Snipara task linkage will be degraded until migration is applied.');
    }

    return this.sniparaTaskColumnAvailable;
  }

  async ensureTeamChannel(workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const existing = await pool.query(
      `SELECT id FROM ${SCHEMA}.chat_channels WHERE name = $1 AND workspace_id = $2 LIMIT 1`,
      [TEAM_CHANNEL_NAME, ws]
    );
    if (existing.rows.length) return existing.rows[0].id;

    const created = await pool.query(
      `INSERT INTO ${SCHEMA}.chat_channels (id, name, description, type, workspace_id, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'group', $3, 'swarm-coordinator', NOW(), NOW())
       RETURNING id`,
      [TEAM_CHANNEL_NAME, 'Swarm team coordination display channel', ws]
    );

    return created.rows[0].id;
  }

  async getTeamChannelId(workspaceId = DEFAULT_WORKSPACE) {
    return this.ensureTeamChannel(workspaceId);
  }

  async postSystemMessage(workspaceId, channelId, senderName, content, senderId) {
    return insertChatMessage(pool, null, SCHEMA, {
      channel_id: channelId,
      sender_id: senderId || String(senderName || 'system').toLowerCase(),
      sender_name: senderName || 'System',
      content,
      message_type: 'text',
      workspace_id: normalizeWorkspaceId(workspaceId),
      processed_at: new Date(),
      processing_state: 'processed'
    });
  }

  async postTeam(workspaceId, senderName, content, senderId) {
    const channelId = await this.getTeamChannelId(workspaceId);
    return this.postSystemMessage(workspaceId, channelId, senderName, content, senderId);
  }

  async postTeamCoordinationCreate(workspaceId, assignedAgent, title, priority) {
    const channelId = await this.getTeamChannelId(workspaceId);
    await this.postSystemMessage(workspaceId, channelId, 'Mike', `@${assignedAgent} jai une tache pour toi: ${title} (priority ${priority})`, 'mike');
    await this.postSystemMessage(workspaceId, channelId, humanizeAgent(assignedAgent), 'OK je prends. Je commence tout de suite.', String(assignedAgent || '').toLowerCase());
  }

  async postTeamCoordinationComplete(workspaceId, agentId, title) {
    const channelId = await this.getTeamChannelId(workspaceId);
    await this.postSystemMessage(workspaceId, channelId, humanizeAgent(agentId), `OK, ${title} est terminee.`, String(agentId || '').toLowerCase());
  }

  parseMcpResult(result) {
    if (!result) return null;
    if (result.structuredContent) return result.structuredContent;
    if (Array.isArray(result.content)) {
      const text = result.content.map((item) => item.text || '').join('\n').trim();
      return safeJsonParse(text) || text || result;
    }
    return result;
  }

  async sniparaCall(toolName, args = {}, workspaceId = DEFAULT_WORKSPACE) {
    const result = await createSniparaGateway({
      db: pool,
      workspaceId,
      timeoutMs: SNIPARA_TIMEOUT_MS,
    }).call(toolName, args);
    if (result == null) throw new Error('Snipara not configured for workspace');
    return result;
  }

  async getSniparaRuntimeConfig(workspaceId = DEFAULT_WORKSPACE) {
    const config = await createSniparaGateway({ db: pool, workspaceId }).resolveConfig();
    return {
      config,
      swarmId: config?.swarmId || this.swarmId || DEFAULT_SNIPARA_SWARM_ID || null,
    };
  }

  async hasSniparaConfig(workspaceId = DEFAULT_WORKSPACE) {
    const { config, swarmId } = await this.getSniparaRuntimeConfig(workspaceId);
    return Boolean(swarmId && config?.configured && config?.apiKey && config?.apiUrl);
  }

  async getWorkspaceToolPolicy(workspaceId = DEFAULT_WORKSPACE, agent = null) {
    const ws = normalizeWorkspaceId(workspaceId);
    const driveRoot = await resolveWorkspaceDriveRoot(ws).catch(() => '/projects/Vutler');
    const agentDriveRoot = agent?.id
      ? await resolveAgentDriveRoot(ws, agent).catch(() => null)
      : null;
    return {
      workspaceId: ws,
      driveRoot,
      agentDriveRoot,
      placementInstruction: buildWorkspacePlacementInstruction(driveRoot, agentDriveRoot),
      defaultCapabilities: [...ALWAYS_ON_TOOL_SKILL_KEYS],
    };
  }

  async resolveAgentExecutionContext(agent = {}, workspaceId = DEFAULT_WORKSPACE) {
    const policy = await this.getWorkspaceToolPolicy(workspaceId || agent.workspace_id, agent);
    const capabilities = normalizeCapabilities(agent.capabilities || policy.defaultCapabilities);
    return {
      ...agent,
      workspace_id: policy.workspaceId,
      capabilities,
      workspaceToolPolicy: {
        ...policy,
        ...splitCapabilities(capabilities),
      },
    };
  }

  pickBestAgent(taskInput) {
    const haystack = String(`${taskInput.title || ''} ${taskInput.description || ''} ${taskInput.text || ''}`).toLowerCase();
    let best = { agentId: 'mike', score: 0 };
    for (const [agentId, keywords] of Object.entries(AGENT_CAPABILITIES)) {
      const score = keywords.reduce((acc, kw) => acc + (haystack.includes(kw.toLowerCase()) ? 1 : 0), 0);
      if (score > best.score) best = { agentId, score };
    }
    return best.agentId;
  }

  detectTaskIntent(content) {
    const lower = String(content || '').trim().toLowerCase();
    return lower.startsWith('cree une tache')
      || lower.startsWith('crée une tâche')
      || lower.startsWith('create task')
      || lower.includes('@team');
  }

  extractTaskFromText(content) {
    const cleaned = String(content || '')
      .replace(/^cr[ée]e\s+une\s+t[âa]che\s*:?/i, '')
      .replace(/^create\s+task\s*:?/i, '')
      .replace(/@team/ig, '')
      .trim();
    const [titlePart, ...rest] = cleaned.split(/[-:\n]/);
    const title = (titlePart || cleaned || 'Nouvelle tache').trim().slice(0, 140);
    const description = rest.join('-').trim() || cleaned || title;
    return {
      title,
      description,
      priority: parsePriority(cleaned)
    };
  }

  isWorkRequest(content) {
    const text = String(content || '').trim().toLowerCase();
    if (this.detectTaskIntent(text)) return true;
    if (text.length < 50) return false;
    const actionVerbs = ['build', 'create', 'implement', 'fix', 'deploy', 'analyze', 'prepare', 'cree', 'crée', 'fais', 'deploie', 'déploie', 'corrige', 'analyse'];
    const hits = actionVerbs.filter((verb) => text.includes(verb)).length;
    const multiTopic = /,|;|\bet\b|\band\b/.test(text);
    return hits >= 1 && multiTopic;
  }

  async rememberDecisionIfAny(messageText, workspaceId = DEFAULT_WORKSPACE) {
    const text = String(messageText || '');
    if (!/(on utilise|use |decision|décision|stack|standard|policy|toujours)/i.test(text)) return;
    await this.sniparaCall('rlm_remember', {
      agent_id: 'jarvis',
      scope: 'project',
      category: `workspace-decisions-${normalizeWorkspaceId(workspaceId)}`,
      type: 'fact',
      importance: 0.8,
      text: text.slice(0, 1200)
    }, workspaceId).catch(() => {});
  }

  async recallWorkspaceContext(queryText, workspaceId = DEFAULT_WORKSPACE) {
    return this.sniparaCall('rlm_recall', {
      query: String(queryText || 'project context decisions standards').slice(0, 400),
      scope: 'project',
      category: `workspace-decisions-${normalizeWorkspaceId(workspaceId)}`,
      limit: 8
    }, workspaceId).catch(() => '');
  }

  async updateSharedContext(text, workspaceId = DEFAULT_WORKSPACE) {
    if (!text) return;
    await this.sniparaCall('rlm_shared_context', {
      scope: 'project',
      category: `workspace-shared-${normalizeWorkspaceId(workspaceId)}`,
      text: String(text).slice(0, 3000)
    }, workspaceId).catch(() => {});
  }

  async rememberLearning(taskTitle, learningText, workspaceId = DEFAULT_WORKSPACE) {
    if (!learningText) return;
    await this.sniparaCall('rlm_remember', {
      agent_id: 'jarvis',
      scope: 'project',
      category: `workspace-learning-${normalizeWorkspaceId(workspaceId)}`,
      type: 'learning',
      importance: 0.7,
      text: `${taskTitle || 'Task'}: ${String(learningText).slice(0, 1500)}`
    }, workspaceId).catch(() => {});
  }

  async decomposeWithLLM(messageText, channelAgents = [], workspaceId = DEFAULT_WORKSPACE) {
    const available = channelAgents
      .map((agent) => (agent.username || agent.name || '').toLowerCase())
      .filter(Boolean);
    const prompt = `Decompose la demande en 1-5 sous-taches JSON strict uniquement: {"tasks":[{"title":"...","description":"...","priority":"high|medium|low","agent":"username"}]}. Agents disponibles: ${available.join(', ') || 'mike'}. Demande: ${messageText}`;
    try {
      const result = await llmChat(
        {
          model: process.env.ROUTING_MODEL || 'claude-sonnet-4',
          provider: process.env.ROUTING_PROVIDER || 'anthropic',
          temperature: 0.2,
          max_tokens: 900,
          workspace_id: normalizeWorkspaceId(workspaceId)
        },
        [{ role: 'user', content: prompt }],
        pool
      );
      const raw = String(result?.content || '{}');
      const json = safeJsonParse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
      if (Array.isArray(json?.tasks) && json.tasks.length) return json.tasks;
    } catch (_) {}
    return [{ title: String(messageText).slice(0, 120), description: messageText, priority: 'medium' }];
  }

  resolveAgentForSubtask(task, channelAgents = []) {
    const available = new Set(channelAgents.map((agent) => (agent.username || agent.name || '').toLowerCase()).filter(Boolean));
    const preferred = String(task.agent || '').toLowerCase();
    if (preferred && available.has(preferred)) return preferred;
    const bySkills = this.pickBestAgent(task);
    if (!available.size || available.has(bySkills)) return bySkills;
    return [...available][0] || bySkills;
  }

  async postTaskMessageToAgentChannel(workspaceId, agentId, title, priority, contentOverride = null) {
    try {
      const result = await pool.query(
        `SELECT cm.channel_id
         FROM ${SCHEMA}.chat_channel_members cm
         LEFT JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id OR a.username = cm.user_id
         WHERE cm.channel_id IN (
           SELECT id FROM ${SCHEMA}.chat_channels WHERE workspace_id = $2
         )
           AND (LOWER(cm.user_id) = LOWER($1) OR LOWER(a.username) = LOWER($1))
         ORDER BY cm.joined_at ASC NULLS LAST
         LIMIT 1`,
        [agentId, normalizeWorkspaceId(workspaceId)]
      );
      if (!result.rows.length) return;
      const content = contentOverride || `Nouvelle tache assignee: ${title} (priority ${priority})`;
      await this.postSystemMessage(workspaceId, result.rows[0].channel_id, 'SwarmCoordinator', content, 'swarm-coordinator');
    } catch (err) {
      console.error('[SwarmCoordinator] Failed to post task message in chat:', err.message);
    }
  }

  async maybeOverflowToNexus(workspaceId, tasks) {
    if (!Array.isArray(tasks) || tasks.length < 4) return false;
    await this.postTeam(workspaceId, 'Mike', 'Charge elevee detectee, demande de renfort Nexus en cours.', 'mike');
    await this.broadcast('Overflow: Nexus support requested', 'overflow', { count: tasks.length }, workspaceId).catch(() => {});
    return true;
  }

  async upsertPgTaskFromSwarm({
    swarmTaskId,
    title,
    description,
    priority,
    status,
    assignedTo,
    source = 'snipara',
    workspaceId = DEFAULT_WORKSPACE,
    parentId = null,
    metadata = null,
    taskKind = 'task',
    sniparaSwarmId = null,
    executionMode = null,
  }) {
    await this.ensureSniparaTaskColumn();
    const ws = normalizeWorkspaceId(workspaceId);
    const normalizedTaskKind = taskKind === 'htask' ? 'htask' : 'task';
    const mergedMetadata = {
      execution_backend: 'snipara',
      execution_mode: executionMode || (normalizedTaskKind === 'htask' ? 'hierarchical_htask' : 'simple_task'),
      sync_mode: 'primary',
      sync_status: swarmTaskId ? 'synced' : 'pending_push',
      snipara_task_kind: normalizedTaskKind,
      ...(sniparaSwarmId ? { snipara_swarm_id: sniparaSwarmId } : {}),
      ...(metadata || {}),
    };
    const existing = await pool.query(
      `SELECT id FROM ${SCHEMA}.tasks
       WHERE workspace_id = $2
         AND (
           ($1::text IS NOT NULL AND (snipara_task_id = $1::text OR swarm_task_id = $1::text))
           OR (title = $3 AND assignee IS NOT DISTINCT FROM $4 AND source = $5 AND $1::text IS NULL)
         )
       LIMIT 1`,
      [swarmTaskId, ws, title || 'Nouvelle tache', assignedTo || null, source]
    );

    const metaJson = JSON.stringify(mergedMetadata);

    if (existing.rows.length) {
      const updated = await pool.query(
        `UPDATE ${SCHEMA}.tasks
         SET title = COALESCE($2, title),
             description = COALESCE($3, description),
             priority = COALESCE($4, priority),
             status = COALESCE($5, status),
             assignee = COALESCE($6, assignee),
             assigned_agent = COALESCE($6, assigned_agent),
             source = COALESCE($7, source),
             parent_id = COALESCE($8, parent_id),
             metadata = CASE WHEN $9::jsonb IS NULL THEN metadata ELSE COALESCE(metadata, '{}'::jsonb) || $9::jsonb END,
             updated_at = NOW(),
             snipara_task_id = COALESCE($1, snipara_task_id),
             swarm_task_id = COALESCE($1, swarm_task_id)
         WHERE id = $10
         RETURNING *`,
        [swarmTaskId, title, description, priority, status, assignedTo, source, parentId, metaJson, existing.rows[0].id]
      );
      return updated.rows[0];
    }

    const inserted = await pool.query(
      `INSERT INTO ${SCHEMA}.tasks
       (id, title, description, status, priority, assignee, assigned_agent, created_at, updated_at, workspace_id, source, parent_id, metadata, snipara_task_id, swarm_task_id)
       VALUES (gen_random_uuid(), $1, $2, COALESCE($3, 'pending'), COALESCE($4, 'medium'), $5, $5, NOW(), NOW(), $6, $7, $8, COALESCE($9::jsonb, '{}'::jsonb), $10, $10)
       RETURNING *`,
      [title || 'Nouvelle tache', description || '', status, priority, assignedTo, ws, source, parentId, metaJson, swarmTaskId]
    );
    return inserted.rows[0];
  }

  async resolveLocalParentIdFromRemote(remoteParentId, workspaceId = DEFAULT_WORKSPACE) {
    if (!remoteParentId) return null;
    const ws = normalizeWorkspaceId(workspaceId);
    const result = await pool.query(
      `SELECT id
       FROM ${SCHEMA}.tasks
       WHERE workspace_id = $2
         AND (snipara_task_id = $1 OR swarm_task_id = $1)
       LIMIT 1`,
      [remoteParentId, ws]
    );
    return result.rows[0]?.id || null;
  }

  async projectWebhookEvent(eventType, data = {}, workspaceId = DEFAULT_WORKSPACE) {
    const remoteTaskId = data?.task_id || data?.id || data?.task?.id || null;
    if (!remoteTaskId) return null;

    const ws = normalizeWorkspaceId(workspaceId || data?.workspace_id);
    const { config, swarmId } = await this.getSniparaRuntimeConfig(ws);
    const taskKind = String(eventType || '').startsWith('htask.') ? 'htask' : 'task';
    const remoteParentId = data?.parent_id || data?.parent_task_id || null;
    const parentId = await this.resolveLocalParentIdFromRemote(remoteParentId, ws);
    const assignedTo = data?.assigned_to || data?.for_agent_id || data?.agent_id || data?.owner || null;
    const status = normalizeRemoteStatus(data?.status, eventType);

    return this.upsertPgTaskFromSwarm({
      swarmTaskId: remoteTaskId,
      title: data?.title || `${taskKind.toUpperCase()} ${remoteTaskId}`,
      description: data?.description || '',
      priority: parsePriority(data?.priority),
      status,
      assignedTo,
      source: `snipara-webhook:${eventType}`,
      workspaceId: ws,
      parentId,
      metadata: {
        ...(config?.projectId ? { snipara_project_id: config.projectId } : {}),
        ...(remoteParentId ? { snipara_remote_parent_id: remoteParentId } : {}),
        ...(data?.level ? { snipara_hierarchy_level: data.level } : {}),
        ...(eventType ? { snipara_last_event: eventType } : {}),
        ...(data?.timestamp ? { snipara_last_event_at: data.timestamp } : {}),
        ...(data?.blocker_type ? { snipara_blocker_type: data.blocker_type } : {}),
        ...(data?.blocker_reason ? { snipara_blocker_reason: data.blocker_reason } : {}),
        ...(data?.evidence_provided ? { snipara_last_evidence: data.evidence_provided } : {}),
        ...(data?.result ? { last_output: data.result } : {}),
      },
      taskKind,
      sniparaSwarmId: data?.swarm_id || swarmId || null,
    });
  }

  async createTask(task = {}, workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const sniparaReady = await this.hasSniparaConfig(ws);
    const { config, swarmId } = await this.getSniparaRuntimeConfig(ws);
    let agentId = task.for_agent_id || task.assigned_agent || task.assignee;
    if (!agentId) {
      try {
        const { getSmartDispatcher } = require('../../../services/smartDispatcher');
        const result = await getSmartDispatcher().dispatch({ ...task, workspace_id: ws });
        agentId = result.agentId;
      } catch (err) {
        console.warn('[SwarmCoordinator] Smart dispatch failed, falling back to keyword:', err.message);
        agentId = this.pickBestAgent(task);
      }
    }

    let workflowMeta = {};
    try {
      const { getWorkflowModeSelector } = require('../../../services/workflowMode');
      const workflow = getWorkflowModeSelector().score(task);
      workflowMeta = {
        workflow_mode: workflow.mode,
        workflow_score: workflow.score,
        workflow_reasons: workflow.reasons
      };
    } catch (_) {}

    const metadata = {
      ...workflowMeta,
      ...(task.metadata || {}),
      workspace_id: ws
    };

    const payload = {
      swarm_id: swarmId,
      workspace_id: ws,
      title: task.title || 'Nouvelle tache',
      description: task.description || task.text || task.title || '',
      priority: toSniparaPriority(task.priority),
      agent_id: agentId,
      for_agent_id: agentId,
      metadata
    };

    let created = null;
    let swarmTaskId = null;

    if (sniparaReady) {
      try {
        created = await getSniparaTaskAdapter().createTask(ws, {
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          agentId,
          metadata,
        });
        if (created && typeof created === 'object' && created.error) {
          console.warn('[SwarmCoordinator] rlm_task_create returned error:', created.error);
          created = null;
        } else {
          swarmTaskId = created?.id || created?.task_id || created?.task?.id || created?.taskId || null;
        }
      } catch (err) {
        console.warn('[SwarmCoordinator] rlm_task_create failed (non-blocking):', err.message);
      }
    }

    const taskRow = await this.upsertPgTaskFromSwarm({
      swarmTaskId,
      title: payload.title,
      description: payload.description,
      priority: parsePriority(task.priority),
      status: 'pending',
      assignedTo: agentId,
      source: 'vutler-api',
      workspaceId: ws,
      parentId: task.parent_id || null,
      metadata: {
        ...(config?.projectId ? { snipara_project_id: config.projectId } : {}),
        ...metadata,
      },
      taskKind: 'task',
      sniparaSwarmId: swarmId,
    });

    if (sniparaReady) {
      await this.broadcast(
        `Nouvelle tache assignee a ${agentId}: ${payload.title}`,
        'task_assigned',
        { ...payload, task: created || { id: taskRow.id } },
        ws
      ).catch((err) => {
        console.warn('[SwarmCoordinator] rlm_broadcast failed (non-blocking):', err.message);
      });
    }

    await this.postTaskMessageToAgentChannel(ws, agentId, payload.title, payload.priority);
    await this.postTeamCoordinationCreate(ws, agentId, payload.title, payload.priority);

    return {
      ...taskRow,
      assigned_agent_id: agentId,
      snipara_task_id: swarmTaskId || taskRow.snipara_task_id || null,
      task: created || { id: taskRow.id }
    };
  }

  async listTasks(workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const { config, swarmId } = await this.getSniparaRuntimeConfig(ws);
    const data = await getSniparaTaskAdapter().listTasks(ws);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : [];
    for (const task of tasks) {
      const taskId = task.id || task.task_id;
      if (!taskId) continue;
      await this.upsertPgTaskFromSwarm({
        swarmTaskId: taskId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assigned_to || task.for_agent_id || task.agent_id,
        source: 'snipara-sync',
        workspaceId: ws,
        metadata: {
          ...(config?.projectId ? { snipara_project_id: config.projectId } : {}),
          ...(task.metadata || {}),
        },
        taskKind: 'task',
        sniparaSwarmId: swarmId,
      });
    }
    return data;
  }

  async claimTask(taskId, agentId, workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const { config, swarmId } = await this.getSniparaRuntimeConfig(ws);
    const data = await getSniparaTaskAdapter().claimTask(ws, { taskId, agentId });
    await this.upsertPgTaskFromSwarm({
      swarmTaskId: taskId,
      assignedTo: agentId,
      status: 'in_progress',
      source: 'snipara-claim',
      workspaceId: ws,
      metadata: {
        ...(config?.projectId ? { snipara_project_id: config.projectId } : {}),
      },
      taskKind: 'task',
      sniparaSwarmId: swarmId,
    });
    return data;
  }

  async completeTask(taskId, agentId, output, workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const { config, swarmId } = await this.getSniparaRuntimeConfig(ws);
    const data = await getSniparaTaskAdapter().completeTask(ws, { taskId, agentId, output });

    const existing = await pool.query(
      `SELECT title, description FROM ${SCHEMA}.tasks
       WHERE workspace_id = $2 AND (snipara_task_id = $1 OR swarm_task_id = $1)
       LIMIT 1`,
      [taskId, ws]
    );
    const title = existing.rows[0]?.title || 'Tache';
    const description = existing.rows[0]?.description || '';

    await this.upsertPgTaskFromSwarm({
      swarmTaskId: taskId,
      assignedTo: agentId,
      status: 'completed',
      source: 'snipara-complete',
      workspaceId: ws,
      metadata: {
        ...(config?.projectId ? { snipara_project_id: config.projectId } : {}),
        last_output: output || null,
      },
      taskKind: 'task',
      sniparaSwarmId: swarmId,
    });

    await this.rememberLearning(title, output || `Completed by ${agentId}`, ws);
    if (description || output) {
      await this.sniparaCall('rlm_upload_document', {
        filename: `${String(title).replace(/[^a-z0-9-_ ]/ig, '').slice(0, 40) || 'deliverable'}.md`,
        content: `# ${title}\n\n${description}\n\n## Output\n${output || 'Completed'}`
      }, ws).catch(() => {});
      await this.sniparaCall('rlm_sync_documents', {}, ws).catch(() => {});
    }
    await this.postTeamCoordinationComplete(ws, agentId, title);
    return data;
  }

  async listEvents(limit = 50, workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const { swarmId } = await this.getSniparaRuntimeConfig(ws);
    return this.sniparaCall('rlm_swarm_events', { swarm_id: swarmId, limit }, ws);
  }

  async events(limit = 50, workspaceId = DEFAULT_WORKSPACE) {
    return this.listEvents(limit, workspaceId);
  }

  async broadcast(message, type = 'announcement', payload = {}, workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const { swarmId } = await this.getSniparaRuntimeConfig(ws);
    return this.sniparaCall('rlm_broadcast', {
      swarm_id: swarmId,
      type,
      message,
      payload
    }, ws);
  }

  async createHtask(task = {}, workspaceId = DEFAULT_WORKSPACE) {
    return getSniparaTaskAdapter().createHtask(workspaceId, task);
  }

  async blockHtask(taskId, blockerType, blockerReason, workspaceId = DEFAULT_WORKSPACE) {
    return getSniparaTaskAdapter().blockHtask(workspaceId, { taskId, blockerType, blockerReason });
  }

  async unblockHtask(taskId, resolution, workspaceId = DEFAULT_WORKSPACE) {
    return getSniparaTaskAdapter().unblockHtask(workspaceId, { taskId, resolution });
  }

  async completeHtask(taskId, result, evidence, workspaceId = DEFAULT_WORKSPACE) {
    return getSniparaTaskAdapter().completeHtask(workspaceId, { taskId, result, evidence });
  }

  async verifyHtaskClosure(taskId, workspaceId = DEFAULT_WORKSPACE) {
    return getSniparaTaskAdapter().verifyHtaskClosure(workspaceId, { taskId });
  }

  async closeHtask(taskId, workspaceId = DEFAULT_WORKSPACE) {
    return getSniparaTaskAdapter().closeHtask(workspaceId, { taskId });
  }

  async createTaskFromChatMessage(content, workspaceId = DEFAULT_WORKSPACE) {
    return this.createTask(this.extractTaskFromText(content), workspaceId);
  }

  async analyzeAndRoute(message, channelAgents = [], workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId || message?.workspace_id);
    const text = typeof message === 'string' ? message : (message?.content || '');

    await this.rememberDecisionIfAny(text, ws);
    if (!this.isWorkRequest(text)) return { routed: false, reason: 'not_work_request' };

    const recalled = await this.recallWorkspaceContext(text, ws);
    const subtasks = await this.decomposeWithLLM(`${text}\n\nContexte workspace:\n${recalled || ''}`, channelAgents, ws);
    const created = [];

    for (const subtask of subtasks) {
      const agent = this.resolveAgentForSubtask(subtask, channelAgents);
      const enrichedDescription = `${subtask.description || ''}\n\n[Workspace context]\n${String(recalled || '').slice(0, 1200)}`;
      const taskRow = await this.createTask({
        title: subtask.title,
        description: enrichedDescription,
        priority: subtask.priority || 'medium',
        for_agent_id: agent,
        metadata: {
          origin: 'chat',
          origin_chat_channel_id: message?.channel_id || null,
          origin_chat_message_id: message?.id || null,
          origin_chat_user_id: message?.sender_id || null,
          origin_chat_user_name: message?.sender_name || null,
          workspace_id: ws
        }
      }, ws);
      created.push({ ...taskRow, subtask, agent });
    }

    await this.updateSharedContext(`Current priorities: ${subtasks.map((subtask) => subtask.title).join(' | ')}`, ws);
    await this.maybeOverflowToNexus(ws, subtasks);

    return { routed: true, created_count: created.length, tasks: created };
  }

  async syncFromSnipara(workspaceId = DEFAULT_WORKSPACE) {
    const ws = normalizeWorkspaceId(workspaceId);
    const { config, swarmId } = await this.getSniparaRuntimeConfig(ws);
    const data = await this.sniparaCall('rlm_tasks', { swarm_id: swarmId }, ws);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : (Array.isArray(data) ? data : []);

    let synced = 0;
    let errors = 0;
    const idMap = {};

    for (const task of tasks) {
      const taskId = task.id || task.task_id;
      if (!taskId) continue;
      try {
        const pgTask = await this.upsertPgTaskFromSwarm({
          swarmTaskId: taskId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
          assignedTo: task.assigned_to || task.for_agent_id || task.agent_id,
          source: 'snipara-sync',
          workspaceId: ws,
          metadata: {
            ...(config?.projectId ? { snipara_project_id: config.projectId } : {}),
            ...(task.metadata || {}),
          },
          taskKind: 'task',
          sniparaSwarmId: swarmId,
        });
        idMap[taskId] = pgTask.id;
        synced += 1;
      } catch (err) {
        console.error('[SwarmCoordinator] syncFromSnipara upsert error:', err.message);
        errors += 1;
      }
    }

    for (const task of tasks) {
      const taskId = task.id || task.task_id;
      const parentTaskId = task.parent_id || task.parent_task_id;
      if (!taskId || !parentTaskId || !idMap[taskId] || !idMap[parentTaskId]) continue;
      try {
        await pool.query(
          `UPDATE ${SCHEMA}.tasks
           SET parent_id = $1
           WHERE id = $2 AND workspace_id = $3 AND (parent_id IS NULL OR parent_id != $1)`,
          [idMap[parentTaskId], idMap[taskId], ws]
        );
      } catch (err) {
        console.error('[SwarmCoordinator] syncFromSnipara parent wire error:', err.message);
      }
    }

    return { synced, errors, total: tasks.length };
  }
}

let singleton = null;
function getSwarmCoordinator() {
  if (!singleton) singleton = new SwarmCoordinator();
  return singleton;
}

module.exports = { SwarmCoordinator, getSwarmCoordinator, AGENT_CAPABILITIES, loadAgentDirectory };
