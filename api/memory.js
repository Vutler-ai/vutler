/**
 * Agent Memory API
 * Provides recall, remember, context-query, promote, and delete
 * for the 3-level hierarchy: instance → template → global
 */
const express = require("express");
const router = express.Router();

const SNIPARA_URL = process.env.SNIPARA_MCP_URL || process.env.SNIPARA_API_URL || "https://api.snipara.com/mcp/test-workspace-api-vutler";
const SNIPARA_KEY = process.env.SNIPARA_API_KEY || process.env.RLM_TOKEN || "REDACTED_SNIPARA_KEY_2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the Snipara memory scope for an agent.
 * Prefers username, falls back to name-slug, then the raw agentId.
 * This matches how sniparaClient.remember() stores memories (scope = username/slug).
 */
async function resolveAgentScope(req, agentId) {
  const pg = req.app?.locals?.pg;
  if (pg) {
    try {
      const wsId = req.workspaceId; // SECURITY: workspace from JWT only (audit 2026-03-29)
      const result = await pg.query(
        `SELECT username, name FROM tenant_vutler.agents
         WHERE (id::text = $1 OR username = $1) AND workspace_id = $2 LIMIT 1`,
        [agentId, wsId]
      );
      if (result.rows[0]) {
        const { username, name } = result.rows[0];
        return username || name.toLowerCase().replace(/\s+/g, '-');
      }
    } catch (_) { /* table may not exist / agent not found */ }
  }
  return agentId; // fallback to whatever was passed (UUID or slug)
}

function normalizeRole(role) {
  return String(role || "general")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "general";
}

function getMemoryScope(agentId, level, role) {
  if (level === "instance") return { scope: "agent", category: String(agentId || "unknown-agent") };
  if (level === "template") return { scope: "project", category: `template-${normalizeRole(role)}` };
  return { scope: "project", category: "platform-standards" };
}

async function sniparaCall(name, args) {
  if (!SNIPARA_KEY) return null;
  const resp = await fetch(SNIPARA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SNIPARA_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args }
    })
  });

  if (!resp.ok) throw new Error(`Snipara HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "Snipara error");

  // Parse result — Snipara may return structured content or text
  const result = data.result;
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;
  if (Array.isArray(result.content)) {
    const txt = result.content.map((x) => x.text || "").join("\n");
    try { return JSON.parse(txt); } catch { return txt; }
  }
  return result;
}

function normalizeMemories(raw, scope) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.memories || raw.results || raw.items || []);
  return arr.map((m, i) => ({
    id: m.id || m.memory_id || `mem-${scope}-${i}`,
    text: m.text || m.content || m.description || String(m),
    type: m.type || "learning",
    importance: typeof m.importance === "number" ? m.importance : 0.5,
    scope: m.scope || scope,
    category: m.category || undefined,
    created_at: m.created_at || m.createdAt || new Date().toISOString(),
    agent_id: m.agent_id || m.agentId || undefined,
  }));
}

// ─── GET /api/v1/agents/:agentId/memories ─────────────────────────────────────
// Recall instance memories for an agent + optional query
router.get("/agents/:agentId/memories", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { q, limit = "20" } = req.query;

    if (!SNIPARA_KEY) {
      return res.json({ success: true, memories: [], meta: { snipara: false } });
    }

    // Resolve the real Snipara scope (username/slug, not UUID)
    const agentScope = await resolveAgentScope(req, agentId);

    // Use rlm_memories (listing) when no query, rlm_recall (semantic) when searching
    const recalled = q
      ? await sniparaCall("rlm_recall", {
          query: q,
          scope: agentScope,
          agent_id: agentScope,
          limit: parseInt(limit) || 20,
        })
      : await sniparaCall("rlm_memories", {
          agent: agentScope,
          agent_id: agentScope,
          limit: parseInt(limit) || 20,
        });

    const memories = normalizeMemories(recalled, "agent");
    return res.json({ success: true, memories });
  } catch (error) {
    console.error("[Memory API] recall failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/v1/agents/:agentId/memories/template ────────────────────────────
// Recall template-level memories (shared by role)
router.get("/agents/:agentId/memories/template", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { role = "general", limit = "20" } = req.query;

    if (!SNIPARA_KEY) {
      return res.json({ success: true, memories: [], meta: { snipara: false } });
    }

    const normalizedRole = normalizeRole(role);
    const recalled = await sniparaCall("rlm_recall", {
      query: `${normalizedRole} knowledge best practices`,
      scope: "project",
      category: `template-${normalizedRole}`,
      limit: parseInt(limit) || 20,
    });

    const memories = normalizeMemories(recalled, "template");
    return res.json({ success: true, memories, role: normalizedRole });
  } catch (error) {
    console.error("[Memory API] template recall failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/v1/agents/:agentId/memories/context ─────────────────────────────
// Get agent context: soul doc + loaded memory count + template count
router.get("/agents/:agentId/memories/context", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { role = "general" } = req.query;

    if (!SNIPARA_KEY) {
      return res.json({
        success: true,
        memories: [],
        context: "",
        soul: "",
        template_count: 0,
        instance_count: 0,
        role,
        meta: { snipara: false },
      });
    }

    const normalizedRole = normalizeRole(role);

    const [instanceRaw, templateRaw, soulDoc] = await Promise.all([
      sniparaCall("rlm_recall", {
        query: `agent ${agentId}`,
        agent_id: agentId,
        scope: "agent",
        category: agentId,
        limit: 50,
      }).catch(() => []),
      sniparaCall("rlm_recall", {
        query: `${normalizedRole} knowledge`,
        scope: "project",
        category: `template-${normalizedRole}`,
        limit: 10,
      }).catch(() => []),
      sniparaCall("rlm_load_document", { path: "agents/SOUL.md" }).catch(() => ""),
    ]);

    const instanceMemories = normalizeMemories(instanceRaw, "agent");
    const templateMemories = normalizeMemories(templateRaw, "template");
    const allMemories = [...instanceMemories, ...templateMemories];

    return res.json({
      success: true,
      memories: allMemories,
      context: `Agent ${agentId} — ${instanceMemories.length} personal memories, ${templateMemories.length} template memories loaded`,
      soul: typeof soulDoc === "string" ? soulDoc : JSON.stringify(soulDoc),
      template_count: templateMemories.length,
      instance_count: instanceMemories.length,
      role: normalizedRole,
    });
  } catch (error) {
    console.error("[Memory API] context failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/v1/agents/:agentId/memories ────────────────────────────────────
// Store a new instance memory for an agent
router.post("/agents/:agentId/memories", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { text, type = "fact", importance = 0.5 } = req.body || {};

    if (!text) {
      return res.status(400).json({ success: false, error: "text is required" });
    }

    if (!SNIPARA_KEY) {
      return res.status(503).json({ success: false, error: "Snipara not configured" });
    }

    const agentScope = await resolveAgentScope(req, agentId);

    await sniparaCall("rlm_remember", {
      text,
      type,
      importance: Math.min(1, Math.max(0, Number(importance) || 0.5)),
      scope: agentScope,
      agent_id: agentScope,
      metadata: {
        agent_id: agentScope,
        source: "vutler-dashboard",
        created_at: new Date().toISOString(),
      },
    });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("[Memory API] remember failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/v1/agents/:agentId/memories/:memoryId ────────────────────────
// Delete an instance memory (best-effort via rlm_remember with empty text)
router.delete("/agents/:agentId/memories/:memoryId", async (req, res) => {
  try {
    const { agentId, memoryId } = req.params;

    if (!SNIPARA_KEY) {
      return res.status(503).json({ success: false, error: "Snipara not configured" });
    }

    // Snipara RLM does not expose a delete tool — we overwrite with a tombstone
    await sniparaCall("rlm_remember", {
      text: `[DELETED memory ${memoryId}]`,
      type: "fact",
      importance: 0,
      scope: "agent",
      category: agentId,
      metadata: {
        deleted: true,
        memory_id: memoryId,
        deleted_at: new Date().toISOString(),
      },
    });

    return res.json({ success: true, data: { id: memoryId, deleted: true } });
  } catch (error) {
    console.error("[Memory API] delete failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/v1/memory/promote ──────────────────────────────────────────────
// Promote one instance memory to template pool (write-gate)
router.post("/promote", async (req, res) => {
  try {
    const { memory_id, role, agent_id } = req.body || {};
    if (!memory_id) {
      return res.status(400).json({ success: false, error: "memory_id is required" });
    }

    const effectiveAgent = agent_id || "unknown-agent";
    const recalled = await sniparaCall("rlm_recall", {
      query: `memory_id:${memory_id}`,
      agent_id: effectiveAgent,
      scope: "agent",
      category: effectiveAgent,
      limit: 1,
    });

    const textBlob = JSON.stringify(recalled || "");
    const isRelevant = textBlob.length >= 30 && !/greet|hello|bonjour|salut/i.test(textBlob);
    if (!isRelevant) {
      return res.status(422).json({
        success: false,
        error: "Memory not relevant enough for template promotion",
      });
    }

    const templateScope = getMemoryScope(effectiveAgent, "template", role || "general");
    await sniparaCall("rlm_remember", {
      text: `Promoted memory (${memory_id}): ${textBlob.substring(0, 1200)}`,
      type: "learning",
      importance: 0.7,
      scope: templateScope.scope,
      category: templateScope.category,
      metadata: {
        source_memory_id: memory_id,
        promoted_from: "instance",
        promoted_at: new Date().toISOString(),
      },
    });

    return res.json({ success: true, data: { memory_id, promoted_to: templateScope } });
  } catch (error) {
    console.error("[Memory API] promote failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/v1/agents/:agentId/memories/:memoryId/promote ──────────────────
// Promote a specific agent memory to template scope
router.post("/agents/:agentId/memories/:memoryId/promote", async (req, res) => {
  try {
    const { agentId, memoryId } = req.params;
    const { role = "general" } = req.body || {};

    if (!SNIPARA_KEY) {
      return res.status(503).json({ success: false, error: "Snipara not configured" });
    }

    const recalled = await sniparaCall("rlm_recall", {
      query: `memory_id:${memoryId}`,
      agent_id: agentId,
      scope: "agent",
      category: agentId,
      limit: 1,
    });

    const textBlob = JSON.stringify(recalled || "");
    const isRelevant = textBlob.length >= 30 && !/greet|hello|bonjour|salut/i.test(textBlob);
    if (!isRelevant) {
      return res.status(422).json({
        success: false,
        error: "Memory not relevant enough for template promotion",
      });
    }

    const normalizedRole = normalizeRole(role);
    await sniparaCall("rlm_remember", {
      text: `Promoted from agent ${agentId} (${memoryId}): ${textBlob.substring(0, 1200)}`,
      type: "learning",
      importance: 0.7,
      scope: "project",
      category: `template-${normalizedRole}`,
      metadata: {
        source_agent_id: agentId,
        source_memory_id: memoryId,
        promoted_from: "instance",
        promoted_at: new Date().toISOString(),
      },
    });

    return res.json({
      success: true,
      data: {
        memory_id: memoryId,
        promoted_to: { scope: "project", category: `template-${normalizedRole}` },
      },
    });
  } catch (error) {
    console.error("[Memory API] agent promote failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/v1/memory/workspace-knowledge ────────────────────────────────────
// Returns the SOUL.md / workspace global knowledge from Snipara
router.get("/workspace-knowledge", async (req, res) => {
  try {
    if (!SNIPARA_KEY) {
      return res.json({ success: true, content: "", updatedAt: null });
    }
    const result = await sniparaCall("rlm_recall", {
      query: "workspace knowledge soul",
      scope: "project",
      category: "platform-standards",
      limit: 1,
    });
    const content = typeof result === "string" ? result : JSON.stringify(result || "");
    res.json({ success: true, content, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[Memory] workspace-knowledge error:", err.message);
    res.json({ success: true, content: "", updatedAt: null });
  }
});

// ─── PUT /api/v1/memory/workspace-knowledge ────────────────────────────────────
router.put("/workspace-knowledge", async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!SNIPARA_KEY) {
      return res.status(503).json({ success: false, error: "Snipara not configured" });
    }
    await sniparaCall("rlm_remember", {
      content: content || "",
      scope: "project",
      category: "platform-standards",
      type: "soul",
      importance: 10,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[Memory] update workspace-knowledge error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v1/memory/templates ──────────────────────────────────────────────
// Returns template-level memory scopes and their doc counts
router.get("/templates", async (req, res) => {
  try {
    if (!SNIPARA_KEY) {
      return res.json({ success: true, templates: [] });
    }
    // Get list of known roles from agents
    const pg = req.app?.locals?.pg;
    let roles = ["general"];
    if (pg) {
      try {
        const result = await pg.query(
          "SELECT DISTINCT role FROM tenant_vutler.agents WHERE role IS NOT NULL AND workspace_id = $1",
          [req.workspaceId]
        );
        roles = result.rows.map(r => r.role).filter(Boolean);
        if (!roles.length) roles = ["general"];
      } catch (_) { /* table may not exist */ }
    }
    const templates = [];
    for (const role of roles) {
      const normalized = normalizeRole(role);
      const recalled = await sniparaCall("rlm_recall", {
        query: "*",
        scope: "project",
        category: `template-${normalized}`,
        limit: 1,
      });
      const textBlob = JSON.stringify(recalled || "");
      const docCount = (textBlob.match(/---/g) || []).length || (textBlob.length > 10 ? 1 : 0);
      templates.push({
        scope: `template-${normalized}`,
        role: normalized,
        docCount,
        lastUpdated: new Date().toISOString(),
      });
    }
    res.json({ success: true, templates });
  } catch (err) {
    console.error("[Memory] templates error:", err.message);
    res.json({ success: true, templates: [] });
  }
});

// ─── GET /api/v1/memory/search ─────────────────────────────────────────────────
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !SNIPARA_KEY) {
      return res.json({ success: true, results: [] });
    }
    const result = await sniparaCall("rlm_recall", {
      query: q,
      scope: "project",
      limit: 20,
    });
    const text = typeof result === "string" ? result : JSON.stringify(result || "");
    // Parse into result items (best effort)
    const results = text.split("---").filter(s => s.trim()).map((chunk, i) => ({
      id: `search-${i}`,
      content: chunk.trim().substring(0, 500),
      scope: "project",
      importance: 5,
      type: "memory",
      createdAt: new Date().toISOString(),
    }));
    res.json({ success: true, results });
  } catch (err) {
    console.error("[Memory] search error:", err.message);
    res.json({ success: true, results: [] });
  }
});

module.exports = router;
