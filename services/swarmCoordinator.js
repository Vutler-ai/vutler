"use strict";

const { pool } = require("../lib/postgres");
const { chat: llmChat } = require("./llmRouter");

const SCHEMA = "tenant_vutler";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000001";
const TEAM_CHANNEL = "team-coordination";

const AGENT_CAPABILITIES = {
  mike: ["engineering", "code", "architecture", "devops"],
  michael: ["frontend", "ui/ux", "design", "css", "ui", "ux", "landing", "page"],
  andrea: ["legal", "hr", "admin", "compliance", "docs commerciaux"],
  luna: ["content", "marketing", "social media", "copywriting", "présentations"],
  rex: ["monitoring", "security", "health checks", "ops"],
  marcus: ["finance", "trading", "analytics", "data"],
  max: ["sales", "crm", "partnerships", "outreach"],
  nora: ["support", "onboarding", "training", "faq"],
  oscar: ["qa", "testing", "bug", "quality"],
  philip: ["documentation", "knowledge base", "wiki"],
  sentinel: ["security", "audit", "threat detection"],
  victor: ["product", "strategy", "roadmap"]
};

class SwarmCoordinator {
  constructor() {
    this.apiUrl = process.env.SNIPARA_API_URL || "https://api.snipara.com/mcp/test-workspace-api-vutler";
    this.apiKey = process.env.SNIPARA_API_KEY;
    this.swarmId = process.env.SNIPARA_SWARM_ID || "cmmdu24k500g01ihbw32d44x2";
  }

  async init() {
    this.hasSniparaTaskId = false;
    try {
      const c = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='tasks' AND column_name='snipara_task_id' LIMIT 1`, [SCHEMA]);
      this.hasSniparaTaskId = !!c.rows.length;
    } catch (_) {}
    await this.ensureTeamChannel();
  }

  async sniparaCall(name, args) {
    const resp = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args }
      })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data?.error?.message || `MCP ${name} failed`);
    return this.parseResult(data.result);
  }

  async sniparaLegacy(method, params) {
    const resp = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ method, params })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data?.error?.message || `${method} failed`);
    return data.result || data;
  }

  parseResult(result) {
    if (!result) return null;
    if (result.structuredContent) return result.structuredContent;
    if (Array.isArray(result.content)) {
      const txt = result.content.map((x) => x.text || "").join("\n");
      try { return JSON.parse(txt); } catch { return txt; }
    }
    return result;
  }

  detectTaskIntent(content) {
    const s = String(content || "").toLowerCase();
    return s.startsWith("crée une tâche") || s.startsWith("cree une tache") || s.startsWith("create task") || s.includes("@team");
  }

  extractTaskFromText(content) {
    const raw = String(content || "")
      .replace(/^cr[ée]e\s+une\s+t[âa]che\s*:?/i, "")
      .replace(/^create\s+task\s*:?/i, "")
      .replace(/@team/ig, "")
      .trim();
    const title = raw.split(/\n| - |:/)[0] || "Nouvelle tâche";
    const description = raw || title;
    const lc = raw.toLowerCase();
    const priority = /urgent|critique|asap|high/.test(lc) ? "high" : (/low|faible/.test(lc) ? "low" : "medium");
    return { title, description, priority };
  }

  pickAgent(task) {
    const text = `${task.title || ""} ${task.description || ""}`.toLowerCase();
    let best = "mike", scoreBest = 0;
    for (const [agent, kws] of Object.entries(AGENT_CAPABILITIES)) {
      const score = kws.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
      if (score > scoreBest) { scoreBest = score; best = agent; }
    }
    return best;
  }

  isWorkRequest(content) {
    const text = String(content || "").trim().toLowerCase();
    if (this.detectTaskIntent(text)) return true;
    if (text.length < 50) return false;
    const actionVerbs = ["build", "create", "implement", "fix", "deploy", "analyze", "prepare", "crée", "fais", "déploie", "corrige", "analyse"];
    const hits = actionVerbs.filter((v) => text.includes(v)).length;
    const multiTopic = /,|;|\bet\b|\band\b/.test(text);
    return hits >= 1 && multiTopic;
  }

  async rememberDecisionIfAny(messageText) {
    const t = String(messageText || "");
    if (!/(on utilise|use |décision|decision|stack|standard|toujours|policy)/i.test(t)) return;
    await this.sniparaCall("rlm_remember", {
      agent_id: "jarvis",
      scope: "project",
      category: "workspace-decisions",
      type: "fact",
      importance: 0.8,
      text: t.slice(0, 1200)
    }).catch(() => {});
  }

  async recallWorkspaceContext(queryText) {
    return this.sniparaCall("rlm_recall", {
      query: String(queryText || "project context decisions standards").slice(0, 400),
      scope: "project",
      category: "workspace-decisions",
      limit: 8
    }).catch(() => "");
  }

  async rememberLearning(taskTitle, learningText) {
    if (!learningText) return;
    await this.sniparaCall("rlm_remember", {
      agent_id: "jarvis",
      scope: "project",
      category: "workspace-learning",
      type: "learning",
      importance: 0.7,
      text: `${taskTitle || "Task"}: ${String(learningText).slice(0, 1500)}`
    }).catch(() => {});
  }

  async updateSharedContext(text) {
    if (!text) return;
    await this.sniparaCall("rlm_shared_context", {
      scope: "project",
      category: "workspace-shared",
      text: String(text).slice(0, 3000)
    }).catch(() => {});
  }

  async storeDocument(name, content) {
    if (!content) return;
    await this.sniparaCall("rlm_upload_document", {
      filename: name || `deliverable-${Date.now()}.md`,
      content: String(content)
    }).catch(() => {});
    await this.sniparaCall("rlm_sync_documents", {}).catch(() => {});
  }

  async decomposeWithLLM(messageText, channelAgents = []) {
    const available = channelAgents.map((a) => (a.username || a.name || "").toLowerCase()).filter(Boolean);
    const prompt = `Décompose la demande en 1-5 sous-tâches JSON strict uniquement: {"tasks":[{"title":"...","description":"...","priority":"high|medium|low","agent":"username"}]}. Agents disponibles: ${available.join(", ")}. Demande: ${messageText}`;
    try {
      const r = await llmChat({ model: process.env.OPENAI_MODEL || "gpt-5.4-mini", provider: "openai", temperature: 0.2, max_tokens: 900 }, [{ role: "user", content: prompt }]);
      const raw = String(r?.content || "{}");
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
      if (Array.isArray(json.tasks) && json.tasks.length) return json.tasks;
    } catch (_) {}
    return [{ title: String(messageText).slice(0, 120), description: messageText, priority: "medium" }];
  }

  resolveAgentForSubtask(task, channelAgents = []) {
    const available = new Set(channelAgents.map((a) => (a.username || a.name || "").toLowerCase()));
    const preferred = String(task.agent || "").toLowerCase();
    if (preferred && available.has(preferred)) return preferred;
    const bySkills = this.pickAgent(task);
    if (!available.size || available.has(bySkills)) return bySkills;
    return [...available][0] || bySkills;
  }

  async postAgentInbox(agentId, title, priority) {
    const q = await pool.query(
      `SELECT cm.channel_id FROM ${SCHEMA}.chat_channel_members cm
       WHERE LOWER(cm.user_id)=LOWER($1)
       ORDER BY cm.joined_at ASC NULLS LAST LIMIT 1`,
      [agentId]
    );
    if (!q.rows.length) return;
    await pool.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id,sender_id,sender_name,content,message_type,workspace_id,processed_at)
       VALUES ($1,$2,$3,$4,'text',$5,NOW())`,
      [q.rows[0].channel_id, "mike", "Mike", `📋 Nouvelle tâche: ${title} — priorité ${priority}`, DEFAULT_WORKSPACE]
    );
  }

  async maybeOverflowToNexus(tasks) {
    if (tasks.length < 4) return false;
    await this.postTeam("Mike", "Charge élevée détectée, demande de renfort Nexus en cours.");
    await this.broadcast("Overflow: Nexus support requested", "overflow", { count: tasks.length });
    return true;
  }

  async analyzeAndRoute(message, channelAgents = []) {
    const text = typeof message === "string" ? message : (message?.content || "");
    await this.rememberDecisionIfAny(text);
    if (!this.isWorkRequest(text)) return { routed: false, reason: "not_work_request" };

    const recalled = await this.recallWorkspaceContext(text);
    const subtasks = await this.decomposeWithLLM(`${text}\n\nContexte workspace:\n${recalled || ''}`, channelAgents);
    const created = [];
    const { getWorkflowModeSelector } = require('./workflowMode');
    for (const s of subtasks) {
      const agent = this.resolveAgentForSubtask(s, channelAgents);
      const workflow = getWorkflowModeSelector().score(s);
      const enrichedDescription = `${s.description || ''}\n\n[Workflow: ${workflow.mode}]\n[Workspace context]\n${String(recalled || '').slice(0, 1200)}`;
      const res = await this.createTask({ title: s.title, description: enrichedDescription, priority: s.priority || "medium", for_agent_id: agent, metadata: { workflow_mode: workflow.mode, workflow_score: workflow.score } });
      created.push({ ...res, subtask: s, agent });
      await this.postAgentInbox(agent, s.title, s.priority || "medium");
    }
    await this.updateSharedContext(`Current priorities: ${subtasks.map(s => s.title).join(' | ')}`);
    await this.maybeOverflowToNexus(subtasks);
    return { routed: true, created_count: created.length, tasks: created };
  }

  async ensureTeamChannel() {
    const q = await pool.query(`SELECT id FROM ${SCHEMA}.chat_channels WHERE name=$1 AND workspace_id=$2 LIMIT 1`, [TEAM_CHANNEL, DEFAULT_WORKSPACE]);
    if (q.rows[0]) return q.rows[0].id;
    const ins = await pool.query(
      `INSERT INTO ${SCHEMA}.chat_channels (id,name,description,type,workspace_id,created_by,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'group',$3,'swarm-coordinator',NOW(),NOW()) RETURNING id`,
      [TEAM_CHANNEL, "Read-only team coordination showcase", DEFAULT_WORKSPACE]
    );
    return ins.rows[0].id;
  }

  async postTeam(senderName, text, senderId) {
    const channelId = await this.ensureTeamChannel();
    await pool.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id,sender_id,sender_name,content,message_type,workspace_id,processed_at)
       VALUES ($1,$2,$3,$4,'text',$5,NOW())`,
      [channelId, senderId || senderName.toLowerCase(), senderName, text, DEFAULT_WORKSPACE]
    );
  }

  async syncPgTask({ sniparaTaskId, title, description, priority, status, assignedTo, source }) {
    const ex = await pool.query(
      this.hasSniparaTaskId
        ? `SELECT id FROM ${SCHEMA}.tasks WHERE snipara_task_id=$1 OR swarm_task_id=$1 LIMIT 1`
        : `SELECT id FROM ${SCHEMA}.tasks WHERE swarm_task_id=$1 LIMIT 1`,
      [sniparaTaskId]
    );
    if (ex.rows[0]) {
      await pool.query(
        this.hasSniparaTaskId
          ? `UPDATE ${SCHEMA}.tasks SET
             title=COALESCE($2,title), description=COALESCE($3,description), priority=COALESCE($4,priority),
             status=COALESCE($5,status), assigned_agent=COALESCE($6,assigned_agent), assignee=COALESCE($6,assignee),
             source=COALESCE($7,source), snipara_task_id=$1, swarm_task_id=$1, updated_at=NOW()
             WHERE id=$8`
          : `UPDATE ${SCHEMA}.tasks SET
             title=COALESCE($2,title), description=COALESCE($3,description), priority=COALESCE($4,priority),
             status=COALESCE($5,status), assigned_agent=COALESCE($6,assigned_agent), assignee=COALESCE($6,assignee),
             source=COALESCE($7,source), swarm_task_id=$1, updated_at=NOW()
             WHERE id=$8`,
        [sniparaTaskId, title, description, priority, status, assignedTo, source, ex.rows[0].id]
      );
      return ex.rows[0].id;
    }
    const ins = await pool.query(
      this.hasSniparaTaskId
        ? `INSERT INTO ${SCHEMA}.tasks (title,description,status,priority,assigned_agent,assignee,workspace_id,source,snipara_task_id,swarm_task_id,created_at,updated_at)
           VALUES ($1,$2,COALESCE($3,'pending'),COALESCE($4,'medium'),$5,$5,$6,$7,$8,$8,NOW(),NOW()) RETURNING id`
        : `INSERT INTO ${SCHEMA}.tasks (title,description,status,priority,assigned_agent,assignee,workspace_id,source,swarm_task_id,created_at,updated_at)
           VALUES ($1,$2,COALESCE($3,'pending'),COALESCE($4,'medium'),$5,$5,$6,$7,$8,NOW(),NOW()) RETURNING id`,
      [title || "Nouvelle tâche", description || "", status, priority, assignedTo, DEFAULT_WORKSPACE, source || "snipara", sniparaTaskId]
    );
    return ins.rows[0].id;
  }

  async createTask(taskInput) {
    const assigned = taskInput.for_agent_id || this.pickAgent(taskInput);
    const payload = {
      swarm_id: this.swarmId,
      title: taskInput.title,
      description: taskInput.description,
      priority: taskInput.priority || "medium",
      for_agent_id: assigned,
      agent_id: assigned
    };

    let created = await this.sniparaCall("rlm_task_create", payload).catch(() => null);
    if (!created || created.error) {
      const p = String(taskInput.priority || "medium").toLowerCase();
      const numericPriority = p === "high" ? 90 : (p === "low" ? 30 : 60);
      created = await this.sniparaCall("rlm_task_create", {
        data: {
          swarmId: this.swarmId,
          agentId: assigned,
          title: taskInput.title,
          description: taskInput.description,
          priority: numericPriority
        }
      }).catch(() => null);
    }
    if (!created || created.error) {
      created = await this.sniparaLegacy("rlm_task_create", {
        swarm_id: this.swarmId,
        agent_id: assigned,
        title: taskInput.title,
        description: taskInput.description || "",
        priority: taskInput.priority || "high"
      }).catch((e) => ({ error: e.message }));
    }
    const taskId = created?.id || created?.task_id || created?.task?.id || created?.data?.taskId || created?.data?.id;
    // Always persist to PG — Snipara is optional. sniparaTaskId is null when all attempts failed.
    const pgTaskId = await this.syncPgTask({
      sniparaTaskId: taskId || null,
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      status: "pending",
      assignedTo: assigned,
      source: "vutler-api"
    });
    // Normalise created: if Snipara failed, return the PG task object so callers always get an id
    if (!taskId || (created && created.error)) {
      created = { id: pgTaskId, source: "pg-local" };
    }

    // Broadcast is non-blocking
    this.sniparaCall("rlm_broadcast", {
      swarm_id: this.swarmId,
      type: "task_assigned",
      message: `Task assigned to ${assigned}: ${payload.title}`,
      payload
    }).catch((e) => console.warn('[SwarmCoordinator] broadcast failed (non-blocking):', e.message));

    await this.postTeam("Mike", `@${assigned} nouveau projet: ${payload.title}, priorité ${payload.priority}`);
    await this.postTeam(cap(assigned), "Reçu je prends.");

    return { assigned_agent_id: assigned, task: created };
  }

  async listTasks() {
    const data = await this.sniparaCall("rlm_tasks", { swarm_id: this.swarmId });
    const arr = Array.isArray(data?.tasks) ? data.tasks : (Array.isArray(data) ? data : []);
    for (const t of arr) {
      const id = t.id || t.task_id;
      if (!id) continue;
      await this.syncPgTask({
        sniparaTaskId: id,
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

  /**
   * Pull all tasks from Snipara and upsert into PG, preserving hierarchy
   * via parent_id. Returns { synced, errors }.
   */
  async syncFromSnipara() {
    const data = await this.sniparaCall("rlm_tasks", { swarm_id: this.swarmId });
    const arr = Array.isArray(data?.tasks) ? data.tasks : (Array.isArray(data) ? data : []);

    let synced = 0;
    let errors = 0;

    // First pass: upsert all tasks without parent_id resolution
    const idMap = {}; // sniparaId -> pgUUID
    for (const t of arr) {
      const sniparaId = t.id || t.task_id;
      if (!sniparaId) continue;
      try {
        const pgId = await this.syncPgTask({
          sniparaTaskId: sniparaId,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          assignedTo: t.assigned_to || t.for_agent_id || t.agent_id,
          source: "snipara-sync"
        });
        idMap[sniparaId] = pgId;
        synced++;
      } catch (e) {
        console.error("[SwarmCoordinator] syncFromSnipara upsert error:", e.message);
        errors++;
      }
    }

    // Second pass: wire parent_id relationships for tasks that have a parent
    for (const t of arr) {
      const sniparaId = t.id || t.task_id;
      const parentSniparaId = t.parent_id || t.parent_task_id;
      if (!sniparaId || !parentSniparaId) continue;
      const pgId = idMap[sniparaId];
      const pgParentId = idMap[parentSniparaId];
      if (!pgId || !pgParentId) continue;
      try {
        await pool.query(
          `UPDATE ${SCHEMA}.tasks SET parent_id = $1 WHERE id = $2 AND (parent_id IS NULL OR parent_id != $1)`,
          [pgParentId, pgId]
        );
      } catch (e) {
        console.error("[SwarmCoordinator] syncFromSnipara parent_id wire error:", e.message);
      }
    }

    return { synced, errors, total: arr.length };
  }

  async claimTask(taskId, agentId) {
    const out = await this.sniparaCall("rlm_task_claim", { swarm_id: this.swarmId, task_id: taskId, agent_id: agentId });
    await this.syncPgTask({ sniparaTaskId: taskId, assignedTo: agentId, status: "in_progress", source: "snipara-claim" });
    return out;
  }

  async completeTask(taskId, agentId, output) {
    const out = await this.sniparaCall("rlm_task_complete", { swarm_id: this.swarmId, task_id: taskId, agent_id: agentId, output: output || "Done" });
    const q = await pool.query(
      this.hasSniparaTaskId
        ? `SELECT title, description FROM ${SCHEMA}.tasks WHERE snipara_task_id=$1 OR swarm_task_id=$1 LIMIT 1`
        : `SELECT title, description FROM ${SCHEMA}.tasks WHERE swarm_task_id=$1 LIMIT 1`,
      [taskId]
    );
    const title = q.rows[0]?.title || "Task";
    const description = q.rows[0]?.description || "";
    await this.syncPgTask({ sniparaTaskId: taskId, status: "completed", assignedTo: agentId, source: "snipara-complete" });
    await this.rememberLearning(title, output || `Completed by ${agentId}`);
    await this.storeDocument(`${title.replace(/[^a-z0-9-_ ]/ig,'').slice(0,40)}-deliverable.md`, `# ${title}\n\n${description}\n\n## Output\n${output || 'Completed'}`);
    await this.postTeam(cap(agentId), `✅ Done: ${title}. @Oscar QA needed.`);
    return out;
  }

  async events(limit = 50) {
    return this.sniparaCall("rlm_swarm_events", { swarm_id: this.swarmId, limit });
  }

  async broadcast(message, type, payload) {
    return this.sniparaCall("rlm_broadcast", { swarm_id: this.swarmId, message, type: type || "announcement", payload: payload || {} });
  }

  async createTaskFromChatMessage(content) {
    return this.createTask(this.extractTaskFromText(content));
  }
}

function cap(s) { const x = String(s || "agent"); return x.charAt(0).toUpperCase() + x.slice(1); }

let singleton;
module.exports = {
  getSwarmCoordinator: () => (singleton ||= new SwarmCoordinator()),
  SwarmCoordinator,
  AGENT_CAPABILITIES
};
