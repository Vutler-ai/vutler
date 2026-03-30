const express = require('express');
const pool = require('../lib/vaultbrix');
const router = express.Router();
const {
  DEFAULT_COUNT_LIMIT,
  normalizeRole,
  resolveAgentRecord,
  listAgentMemories,
  listTemplateMemories,
  buildAgentContext,
  loadWorkspaceKnowledge,
  rememberAgentMemory,
  softDeleteAgentMemory,
  promoteAgentMemoryToTemplate,
} = require('../services/sniparaMemoryService');

function getWorkspaceId(req) {
  return req.workspaceId || '00000000-0000-0000-0000-000000000001';
}

function parseLimit(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toTemplateScope(role, count, hasMore) {
  return {
    scope: `template-${role}`,
    role,
    docCount: count,
    lastUpdated: '',
    count_is_estimate: hasMore,
  };
}

router.get('/agents/:agentId/memories', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const { q, include_internal, include_expired, countOnly } = req.query;
    const limit = parseLimit(req.query.limit, countOnly === 'true' ? DEFAULT_COUNT_LIMIT : 50);
    const includeInternal = include_internal === 'true';
    const includeExpired = include_expired === 'true';

    const result = await listAgentMemories({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      query: q,
      limit,
      includeInternal,
      includeExpired,
    });

    return res.json({
      success: true,
      memories: countOnly === 'true' ? [] : result.memories,
      count: result.count,
      total_count: result.total_count,
      visible_count: result.visible_count,
      hidden_count: result.hidden_count,
      expired_count: result.expired_count,
      deleted_count: result.deleted_count,
      has_more: result.has_more,
      count_is_estimate: result.count_is_estimate,
      visibility: includeInternal ? 'all' : 'reviewable',
      include_expired: includeExpired,
      agent: {
        id: result.agent.id,
        username: result.agent.username,
        role: result.agent.role,
      },
    });
  } catch (error) {
    console.error('[Memory API] recall failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents/:agentId/memories/template', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const { include_internal, include_expired } = req.query;
    const role = normalizeRole(req.query.role || 'general');
    const limit = parseLimit(req.query.limit, 50);
    const includeInternal = include_internal === 'true';
    const includeExpired = include_expired === 'true';

    const result = await listTemplateMemories({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      role,
      limit,
      includeInternal,
      includeExpired,
    });

    return res.json({
      success: true,
      memories: result.memories,
      role,
      count: result.count,
      total_count: result.total_count,
      visible_count: result.visible_count,
      hidden_count: result.hidden_count,
      expired_count: result.expired_count,
      deleted_count: result.deleted_count,
      has_more: result.has_more,
      count_is_estimate: result.count_is_estimate,
      visibility: includeInternal ? 'all' : 'reviewable',
      include_expired: includeExpired,
    });
  } catch (error) {
    console.error('[Memory API] template recall failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents/:agentId/memories/context', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const role = normalizeRole(req.query.role || 'general');

    const context = await buildAgentContext({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      role,
      includeInternal: false,
    });

    return res.json({ success: true, ...context });
  } catch (error) {
    console.error('[Memory API] context failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/agents/:agentId/memories', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const { text, type = 'fact', importance = 0.5, visibility = 'reviewable' } = req.body || {};
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });

    const agent = await resolveAgentRecord(pool, workspaceId, agentId);
    await rememberAgentMemory({
      db: pool,
      workspaceId,
      agent,
      text,
      type,
      importance,
      visibility,
      source: 'vutler-dashboard',
    });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('[Memory API] remember failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/agents/:agentId/memories/:memoryId', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId, memoryId } = req.params;
    const agent = await resolveAgentRecord(pool, workspaceId, agentId);

    await softDeleteAgentMemory({ db: pool, workspaceId, agent, memoryId });
    return res.json({ success: true, data: { id: memoryId, deleted: true } });
  } catch (error) {
    console.error('[Memory API] delete failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/promote', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { memory_id, role, agent_id } = req.body || {};
    if (!memory_id) return res.status(400).json({ success: false, error: 'memory_id is required' });

    const agent = await resolveAgentRecord(pool, workspaceId, agent_id || 'unknown-agent');
    const promotedTo = await promoteAgentMemoryToTemplate({
      db: pool,
      workspaceId,
      agent,
      memoryId: memory_id,
      role: role || agent.role || 'general',
    });

    return res.json({ success: true, data: { memory_id, promoted_to: promotedTo } });
  } catch (error) {
    console.error('[Memory API] promote failed:', error.message);
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post('/agents/:agentId/memories/:memoryId/promote', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId, memoryId } = req.params;
    const role = normalizeRole(req.body?.role || 'general');
    const agent = await resolveAgentRecord(pool, workspaceId, agentId);

    const promotedTo = await promoteAgentMemoryToTemplate({
      db: pool,
      workspaceId,
      agent,
      memoryId,
      role,
    });

    return res.json({ success: true, data: { memory_id: memoryId, promoted_to: promotedTo } });
  } catch (error) {
    console.error('[Memory API] agent promote failed:', error.message);
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get('/workspace-knowledge', async (req, res) => {
  try {
    const knowledge = await loadWorkspaceKnowledge({ db: pool, workspaceId: getWorkspaceId(req) });
    return res.json(knowledge);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/workspace-knowledge', async (_req, res) => {
  return res.status(501).json({ success: false, error: 'Workspace knowledge editing is not implemented yet' });
});

router.get('/templates', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const rolesResult = await pool.query(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(role), ''), 'general') AS role
       FROM tenant_vutler.agents
       WHERE workspace_id = $1
       ORDER BY 1`,
      [workspaceId]
    );

    const templates = [];
    for (const row of rolesResult.rows) {
      const role = normalizeRole(row.role);
      const result = await listTemplateMemories({
        db: pool,
        workspaceId,
        agentIdOrUsername: null,
        role,
        limit: DEFAULT_COUNT_LIMIT,
      });
      templates.push(toTemplateScope(role, result.count, result.has_more));
    }

    return res.json({ success: true, templates });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const query = String(req.query.q || '').trim();
    if (!query) return res.json({ success: true, results: [] });

    const agentsResult = await pool.query(
      `SELECT id, name, username, role
       FROM tenant_vutler.agents
       WHERE workspace_id = $1
       ORDER BY name
       LIMIT 25`,
      [workspaceId]
    );

    const results = [];
    for (const agent of agentsResult.rows) {
      const recalled = await listAgentMemories({
        db: pool,
        workspaceId,
        agentIdOrUsername: agent.id,
        query,
        limit: 5,
      });
      for (const memory of recalled.memories) {
        results.push({
          id: memory.id,
          content: memory.text,
          scope: memory.scope,
          agentName: agent.name,
          importance: memory.importance,
          type: memory.type,
          createdAt: memory.created_at,
        });
      }
    }

    return res.json({ success: true, results });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
