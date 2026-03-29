"use strict";

const pool = require("../../../lib/vaultbrix");

const SCHEMA = "tenant_vutler";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000001";
const TEAM_CHANNEL_NAME = "team-coordination";

const AGENT_CAPABILITIES = {
  mike: ["engineering", "code", "architecture", "devops"],
  michael: ["frontend", "ui/ux", "design", "css", "ui", "ux", "landing page"],
  andrea: ["legal", "hr", "admin", "compliance", "docs commerciaux", "commercial", "contracts"],
  luna: ["content", "marketing", "social media", "copywriting", "présentations", "presentation"],
  rex: ["monitoring", "security", "health checks", "ops", "operations"],
  marcus: ["finance", "trading", "analytics", "data"],
  max: ["sales", "crm", "partnerships", "outreach"],
  nora: ["support", "onboarding", "training", "faq"],
  oscar: ["qa", "testing", "bug", "bug reports", "quality"],
  philip: ["documentation", "knowledge base", "wiki", "docs"],
  sentinel: ["security", "audit", "threat detection", "threat"],
  victor: ["product", "strategy", "roadmap"]
};

class SwarmCoordinator {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || process.env.SNIPARA_API_URL;
    this.apiKey = options.apiKey || process.env.SNIPARA_API_KEY;
    this.swarmId = options.swarmId || process.env.SNIPARA_SWARM_ID;
  }

  async init() {
    await this.ensureSniparaTaskColumn();
    await this.ensureTeamChannel();
  }

  async ensureSniparaTaskColumn() {
    await pool.query(`ALTER TABLE ${SCHEMA}.tasks ADD COLUMN IF NOT EXISTS snipara_task_id text`);
  }

  async ensureTeamChannel() {
    const existing = await pool.query(
      `SELECT id FROM ${SCHEMA}.chat_channels WHERE name = $1 AND workspace_id = $2 LIMIT 1`,
      [TEAM_CHANNEL_NAME, DEFAULT_WORKSPACE]
    );
    if (existing.rows.length) return existing.rows[0].id;

    const created = await pool.query(
      `INSERT INTO ${SCHEMA}.chat_channels (id, name, description, type, workspace_id, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'group', $3, 'swarm-coordinator', NOW(), NOW())
       RETURNING id`,
      [TEAM_CHANNEL_NAME, "Swarm team coordination display channel", DEFAULT_WORKSPACE]
    );

    return created.rows[0].id;
  }

  async getTeamChannelId() {
    return this.ensureTeamChannel();
  }

  async postSystemMessage(channelId, senderName, content, senderId) {
    await pool.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id, sender_id, sender_name, content, message_type, workspace_id, processed_at)
       VALUES ($1, $2, $3, $4, 'text', $5, NOW())`,
      [channelId, senderId || senderName.toLowerCase(), senderName, content, DEFAULT_WORKSPACE]
    );
  }

  async postTeamCoordinationCreate(assignedAgent, title, priority) {
    const channelId = await this.getTeamChannelId();
    await this.postSystemMessage(channelId, "Mike", `@${assignedAgent} jai une tâche pour toi — ${title}, priority ${priority}`);
    await this.postSystemMessage(channelId, this.humanizeAgent(assignedAgent), "OK je prends. Je commence tout de suite.");
  }

  async postTeamCoordinationComplete(agentId, title) {
    const channelId = await this.getTeamChannelId();
    await this.postSystemMessage(channelId, this.humanizeAgent(agentId), `✅ ${title} terminée. @Mike review needed.`);
  }

  humanizeAgent(agentId) {
    const clean = String(agentId || "agent").toLowerCase();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  async sniparaCall(toolName, args = {}) {
    if (!this.apiUrl || !this.apiKey) throw new Error("SNIPARA_API_URL or SNIPARA_API_KEY missing");
    const fetch = globalThis.fetch || require("node-fetch");
    const resp = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiKey}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: toolName, arguments: args } })
    });
    if (!resp.ok) throw new Error(`Snipara ${toolName} HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(`Snipara ${toolName} error: ${data.error.message || JSON.stringify(data.error)}`);
    return this.parseMcpResult(data.result);
  }

  parseMcpResult(result) {
    if (!result) return null;
    if (result.structuredContent) return result.structuredContent;
    if (Array.isArray(result.content)) {
      const text = result.content.map((c) => c.text || "").join("\n").trim();
      try { return JSON.parse(text); } catch (_) { return text || result; }
    }
    return result;
  }

  pickBestAgent(taskInput) {
    const haystack = String(`${taskInput.title || ""} ${taskInput.description || ""} ${taskInput.text || ""}`).toLowerCase();
    let best = { agentId: "mike", score: 0 };
    for (const [agentId, keywords] of Object.entries(AGENT_CAPABILITIES)) {
      const score = keywords.reduce((acc, kw) => acc + (haystack.includes(kw.toLowerCase()) ? 1 : 0), 0);
      if (score > best.score) best = { agentId, score };
    }
    return best.agentId;
  }

  detectTaskIntent(content) {
    const lower = String(content || "").trim().toLowerCase();
    return lower.startsWith("crée une tâche") || lower.startsWith("cree une tache") || lower.startsWith("create task") || lower.includes("@team");
  }

  extractTaskFromText(content) {
    const cleaned = String(content || "")
      .replace(/^cr[ée]e\s+une\s+t[âa]che\s*:?/i, "")
      .replace(/^create\s+task\s*:?/i, "")
      .replace(/@team/ig, "")
      .trim();
    const [titlePart, ...rest] = cleaned.split(/[-:\n]/);
    const title = (titlePart || cleaned || "Nouvelle tâche").trim().slice(0, 140);
    const description = rest.join("-").trim() || cleaned || title;
    let priority = "medium";
    const lower = cleaned.toLowerCase();
    if (/(urgent|critique|critical|asap|high priority|haute priorité|haute priorite)/.test(lower)) priority = "high";
    if (/(low priority|faible priorité|faible priorite|quand possible)/.test(lower)) priority = "low";
    return { title, description, priority };
  }

  async upsertPgTaskFromSwarm({ swarmTaskId, title, description, priority, status, assignedTo, source = "snipara" }) {
    await this.ensureSniparaTaskColumn();
    const existing = await pool.query(
      `SELECT id FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [swarmTaskId]
    );

    if (existing.rows.length) {
      const id = existing.rows[0].id;
      await pool.query(
        `UPDATE ${SCHEMA}.tasks
         SET title = COALESCE($2, title),
             description = COALESCE($3, description),
             priority = COALESCE($4, priority),
             status = COALESCE($5, status),
             assignee = COALESCE($6, assignee),
             assigned_agent = COALESCE($6, assigned_agent),
             source = COALESCE($7, source),
             updated_at = NOW(),
             snipara_task_id = $1,
             swarm_task_id = $1
         WHERE id = $8`,
        [swarmTaskId, title, description, priority, status, assignedTo, source, id]
      );
      return id;
    }

    const inserted = await pool.query(
      `INSERT INTO ${SCHEMA}.tasks
       (id, title, description, status, priority, assignee, assigned_agent, created_at, updated_at, workspace_id, source, snipara_task_id, swarm_task_id)
       VALUES (gen_random_uuid(), $1, $2, COALESCE($3, 'pending'), COALESCE($4, 'medium'), $5, $5, NOW(), NOW(), $6, $7, $8, $8)
       RETURNING id`,
      [title || "Nouvelle tâche", description || "", status, priority, assignedTo, DEFAULT_WORKSPACE, source, swarmTaskId]
    );
    return inserted.rows[0].id;
  }

  async createTask(task = {}) {
    let agentId = task.for_agent_id;
    if (!agentId) {
      try {
        const { getSmartDispatcher } = require('../../../services/smartDispatcher');
        const result = await getSmartDispatcher().dispatch(task);
        agentId = result.agentId;
      } catch (err) {
        console.warn('[SwarmCoordinator] Smart dispatch failed, falling back to keyword:', err.message);
        agentId = this.pickBestAgent(task);
      }
    }
    // Score workflow mode (LITE vs FULL)
    const { getWorkflowModeSelector } = require('../../../services/workflowMode');
    const workflow = getWorkflowModeSelector().score(task);
    console.log(`[SwarmCoordinator] Workflow mode: ${workflow.mode} (score: ${workflow.score}) for "${(task.title || '').slice(0, 50)}"`);

    const payload = {
      swarm_id: this.swarmId,
      title: task.title || "Nouvelle tâche",
      description: task.description || task.text || task.title || "",
      priority: task.priority || "medium",
      agent_id: agentId,
      for_agent_id: agentId,
      metadata: { workflow_mode: workflow.mode, workflow_score: workflow.score, workflow_reasons: workflow.reasons },
    };

    // Snipara is non-blocking — if it fails (bad swarm ID, network, etc.), task still gets created in PG
    let created = null;
    let swarmTaskId = null;
    if (this.swarmId && this.apiUrl && this.apiKey) {
      try {
        created = await this.sniparaCall("rlm_task_create", payload);
        // Guard against Snipara returning an error object instead of a valid task
        if (created && typeof created === 'object' && created.error) {
          console.warn('[SwarmCoordinator] rlm_task_create returned error:', created.error);
          created = null;
        } else {
          swarmTaskId = created?.id || created?.task_id || created?.task?.id || created?.taskId;
        }
      } catch (err) {
        console.warn('[SwarmCoordinator] rlm_task_create failed (non-blocking):', err.message);
      }
    } else {
      console.warn('[SwarmCoordinator] Snipara not configured — creating task locally only');
    }

    // Always persist to PG regardless of Snipara result
    const pgTaskId = await this.upsertPgTaskFromSwarm({
      swarmTaskId: swarmTaskId || null,
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      status: "pending",
      assignedTo: agentId,
      source: "vutler-api"
    });

    // Broadcast is also non-blocking
    try {
      if (this.swarmId && this.apiUrl && this.apiKey) {
        await this.sniparaCall("rlm_broadcast", {
          swarm_id: this.swarmId,
          type: "task_assigned",
          message: `📋 Nouvelle tâche assignée à ${agentId}: ${payload.title} — Priority: ${payload.priority}`,
          payload: { ...payload, task: created }
        });
      }
    } catch (err) {
      console.warn('[SwarmCoordinator] rlm_broadcast failed (non-blocking):', err.message);
    }

    await this.postTaskMessageToAgentChannel(agentId, payload.title, payload.priority);
    await this.postTeamCoordinationCreate(agentId, payload.title, payload.priority);

    return { assigned_agent_id: agentId, priority: payload.priority, task: created || { id: pgTaskId } };
  }

  async listTasks() {
    const data = await this.sniparaCall("rlm_tasks", { swarm_id: this.swarmId });
    const tasks = Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : [];
    for (const t of tasks) {
      const id = t.id || t.task_id;
      if (!id) continue;
      await this.upsertPgTaskFromSwarm({
        swarmTaskId: id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assignedTo: t.assigned_to || t.for_agent_id || t.agent_id,
        source: "snipara-sync"
      });
    }
    return data;
  }

  async claimTask(taskId, agentId) {
    const data = await this.sniparaCall("rlm_task_claim", { swarm_id: this.swarmId, task_id: taskId, agent_id: agentId });
    await this.upsertPgTaskFromSwarm({ swarmTaskId: taskId, assignedTo: agentId, status: "in_progress", source: "snipara-claim" });
    return data;
  }

  async completeTask(taskId, agentId, output) {
    const data = await this.sniparaCall("rlm_task_complete", { swarm_id: this.swarmId, task_id: taskId, agent_id: agentId, output: output || "Done" });
    const existing = await pool.query(`SELECT title FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`, [taskId]);
    const title = existing.rows[0]?.title || "Tâche";
    await this.upsertPgTaskFromSwarm({ swarmTaskId: taskId, assignedTo: agentId, status: "completed", source: "snipara-complete" });
    await this.postTeamCoordinationComplete(agentId, title);
    return data;
  }

  async listEvents(limit = 50) {
    return this.sniparaCall("rlm_swarm_events", { swarm_id: this.swarmId, limit });
  }

  async broadcast(message, type = "announcement", payload = {}) {
    return this.sniparaCall("rlm_broadcast", { swarm_id: this.swarmId, type, message, payload });
  }

  async createTaskFromChatMessage(content) {
    const task = this.extractTaskFromText(content);
    return this.createTask(task);
  }

  async postTaskMessageToAgentChannel(agentId, title, priority) {
    try {
      const result = await pool.query(
        `SELECT cm.channel_id
         FROM ${SCHEMA}.chat_channel_members cm
         LEFT JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id OR a.username = cm.user_id
         WHERE LOWER(cm.user_id) = LOWER($1) OR LOWER(a.username) = LOWER($1)
         ORDER BY cm.joined_at ASC NULLS LAST
         LIMIT 1`,
        [agentId]
      );
      if (!result.rows.length) return;
      await this.postSystemMessage(result.rows[0].channel_id, "SwarmCoordinator", `📋 Nouvelle tâche assignée: ${title} — Priority: ${priority}`, "swarm-coordinator");
    } catch (err) {
      console.error("[SwarmCoordinator] Failed to post task message in chat:", err.message);
    }
  }
}

let singleton = null;
function getSwarmCoordinator() {
  if (!singleton) singleton = new SwarmCoordinator();
  return singleton;
}

module.exports = { SwarmCoordinator, getSwarmCoordinator, AGENT_CAPABILITIES };
