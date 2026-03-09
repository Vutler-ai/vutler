/**
 * Agent Memory API
 */
const express = require("express");
const router = express.Router();

const SNIPARA_URL = "https://api.snipara.com/mcp/test-workspace-api-vutler";
const SNIPARA_KEY = process.env.SNIPARA_API_KEY || "";

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
  // native fetch (Node 20+)
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
  return data.result;
}

router.get("/", async (req, res) => {
  res.json({ success: true, memories: [] });
});

/**
 * POST /api/v1/memory/promote
 * Promote one instance memory to template pool (write-gate)
 */
router.post("/promote", async (req, res) => {
  try {
    const { memory_id, role, agent_id } = req.body || {};
    if (!memory_id) {
      return res.status(400).json({ success: false, error: "memory_id is required" });
    }

    const effectiveAgent = agent_id || req.body?.agentId || "unknown-agent";
    const recalled = await sniparaCall("rlm_recall", {
      query: `memory_id:${memory_id}`,
      agent_id: effectiveAgent,
      limit: 1
    });

    const textBlob = JSON.stringify(recalled || "");
    const isRelevant = textBlob.length >= 30 && !/greet|hello|bonjour|salut/i.test(textBlob);
    if (!isRelevant) {
      return res.status(422).json({
        success: false,
        error: "Memory not relevant enough for template promotion"
      });
    }

    const templateScope = getMemoryScope(effectiveAgent, "template", role || req.body?.template_role || "general");
    await sniparaCall("rlm_remember", {
      text: `Promoted memory (${memory_id}): ${textBlob.substring(0, 1200)}`,
      type: "learning",
      importance: 0.7,
      scope: templateScope.scope,
      category: templateScope.category,
      metadata: {
        source_memory_id: memory_id,
        promoted_from: "instance",
        promoted_at: new Date().toISOString()
      }
    });

    return res.json({
      success: true,
      data: {
        memory_id,
        promoted_to: templateScope
      }
    });
  } catch (error) {
    console.error("[Memory API] promote failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
