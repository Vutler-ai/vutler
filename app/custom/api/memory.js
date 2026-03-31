/**
 * Vutler Memory API — workspace-level memory endpoints
 * Agent-specific memory is handled by api/memory.js (mounted at /)
 *
 * Endpoints:
 *   GET    /api/v1/memory          — list memories (optionally filtered by type)
 *   POST   /api/v1/memory          — store a new memory
 *   GET    /api/v1/memory/search   — semantic search via rlm_recall
 *   DELETE /api/v1/memory/:id      — delete (tombstone) a memory
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const router = express.Router();
const { createSniparaGateway } = require('../../../services/snipara/gateway');

function normalizeMemories(raw, fallbackScope) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.memories || raw.results || raw.items || []);
  return arr.map((m, i) => ({
    id: m.id || m.memory_id || `mem-${fallbackScope}-${i}`,
    text: m.text || m.content || m.description || String(m),
    type: m.type || 'fact',
    importance: typeof m.importance === 'number' ? m.importance : 0.5,
    scope: m.scope || fallbackScope,
    category: m.category || undefined,
    created_at: m.created_at || m.createdAt || new Date().toISOString(),
    agent_id: m.agent_id || m.agentId || undefined,
  }));
}

/**
 * GET /api/v1/memory
 * List agent memories from Snipara
 */
router.get('/memory', authenticateAgent, async (req, res) => {
  try {
    const pg = req.app.locals.pg || require('../../../lib/vaultbrix');
    const workspaceId = req.workspaceId || req.agent?.workspace_id;
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type;
    const agentId = req.agent?.id || req.query.agent_id;
    const gateway = createSniparaGateway({ db: pg, workspaceId });

    const config = await gateway.resolveConfig();
    if (!config.configured) {
      return res.json({ success: true, data: [], meta: { total: 0, limit, snipara: false } });
    }

    const query = type ? `type:${type}` : `agent ${agentId || 'workspace'} memories`;
    const recalled = await gateway.memory.recall({
      query,
      agent_id: agentId,
      scope: 'agent',
      category: agentId,
      limit,
    });

    const memories = normalizeMemories(recalled, 'agent');
    return res.json({
      success: true,
      data: memories,
      meta: { total: memories.length, limit, filter: type ? { type } : {} },
    });
  } catch (error) {
    console.error('[Memory API] Error fetching memories:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch memories',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/memory
 * Store a new memory via rlm_remember
 */
router.post('/memory', authenticateAgent, async (req, res) => {
  try {
    const pg = req.app.locals.pg || require('../../../lib/vaultbrix');
    const workspaceId = req.workspaceId || req.agent?.workspace_id;
    const { content, type, tags, importance } = req.body;
    const agentId = req.agent?.id;
    const gateway = createSniparaGateway({ db: pg, workspaceId });

    if (!content) {
      return res.status(400).json({ success: false, error: 'Missing required field: content' });
    }

    const config = await gateway.resolveConfig();
    if (!config.configured) {
      const memory = {
        id: `mem_${Date.now()}`,
        content,
        type: type || 'fact',
        tags: tags || [],
        agent_id: agentId,
        created_at: new Date().toISOString(),
      };
      return res.json({ success: true, data: memory });
    }

    await gateway.memory.remember({
      text: content,
      type: type || 'fact',
      importance: Math.min(1, Math.max(0, Number(importance) || 0.5)),
      scope: 'agent',
      category: agentId,
      tags: tags || [],
      metadata: {
        agent_id: agentId,
        source: 'vutler-agent',
        created_at: new Date().toISOString(),
      },
    });

    const memory = {
      id: `mem_${Date.now()}`,
      content,
      type: type || 'fact',
      tags: tags || [],
      agent_id: agentId,
      created_at: new Date().toISOString(),
    };

    return res.json({ success: true, data: memory });
  } catch (error) {
    console.error('[Memory API] Error storing memory:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to store memory',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/memory/search
 * Semantic search via rlm_recall
 */
router.get('/memory/search', authenticateAgent, async (req, res) => {
  try {
    const pg = req.app.locals.pg || require('../../../lib/vaultbrix');
    const workspaceId = req.workspaceId || req.agent?.workspace_id;
    const { q, limit: limitStr } = req.query;
    const agentId = req.agent?.id;
    const gateway = createSniparaGateway({ db: pg, workspaceId });

    if (!q) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: q (query)' });
    }

    const config = await gateway.resolveConfig();
    if (!config.configured) {
      return res.json({ success: true, data: [], query: q, meta: { snipara: false } });
    }

    const recalled = await gateway.memory.recall({
      query: q,
      agent_id: agentId,
      scope: 'agent',
      category: agentId,
      limit: parseInt(limitStr) || 10,
    });

    const memories = normalizeMemories(recalled, 'agent');
    return res.json({ success: true, data: memories, query: q });
  } catch (error) {
    console.error('[Memory API] Error searching memories:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to search memories',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/v1/memory/:id
 * Delete a memory (tombstone via rlm_remember)
 */
router.delete('/memory/:id', authenticateAgent, async (req, res) => {
  try {
    const pg = req.app.locals.pg || require('../../../lib/vaultbrix');
    const workspaceId = req.workspaceId || req.agent?.workspace_id;
    const { id } = req.params;
    const agentId = req.agent?.id;
    const gateway = createSniparaGateway({ db: pg, workspaceId });

    const config = await gateway.resolveConfig();
    if (config.configured) {
      await gateway.memory.remember({
        text: `[DELETED memory ${id}]`,
        type: 'fact',
        importance: 0,
        scope: 'agent',
        category: agentId,
        metadata: { deleted: true, memory_id: id, deleted_at: new Date().toISOString() },
      }).catch(() => {});
    }

    return res.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    console.error('[Memory API] Error deleting memory:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete memory',
      message: error.message,
    });
  }
});

module.exports = router;
