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
  getAgentMemoryById,
  attachMemorySource,
  verifyAgentMemory,
  invalidateAgentMemory,
  supersedeAgentMemory,
  softDeleteAgentMemory,
  promoteAgentMemoryToTemplate,
} = require('../services/sniparaMemoryService');
const {
  normalizeSharedMemoryPolicy,
  canReadSharedMemory,
  canWriteSharedMemory,
  getWorkspaceKnowledgeState,
  saveWorkspaceKnowledge,
  saveSharedMemoryPolicy,
} = require('../services/workspaceKnowledgeService');
const {
  AGENT_PROFILE_KIND,
  AGENT_SESSION_KIND,
  getWorkspaceSessionBrief,
  saveWorkspaceSessionBrief,
  getAgentContinuityBrief,
  saveAgentContinuityBrief,
} = require('../services/sessionContinuityService');
const {
  WORKSPACE_SCOPE,
  AGENT_SCOPE,
  JOURNAL_AUTOMATION_MODE_MANUAL,
  JOURNAL_AUTOMATION_MODE_ON_SAVE,
  normalizeJournalDate,
  normalizeJournalAutomationScope,
  getWorkspaceJournal,
  saveWorkspaceJournal,
  summarizeWorkspaceJournalToBrief,
  getAgentJournal,
  saveAgentJournal,
  summarizeAgentJournalToBrief,
  listJournalAutomationPolicies,
  getJournalAutomationSweepStatus,
  getJournalAutomationRuntimeStatus,
  saveJournalAutomationPolicy,
  runJournalAutomationSweep,
} = require('../services/journalCompactionService');
const {
  listGroupMemorySpaces,
  createGroupMemorySpace,
  updateGroupMemorySpace,
  deleteGroupMemorySpace,
  listAgentGroupMemories,
  autoPromoteVerifiedMemoryToGroupSpaces,
} = require('../services/groupMemoryService');

function getWorkspaceId(req) {
  return req.workspaceId || '00000000-0000-0000-0000-000000000001';
}

function parseLimit(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isWorkspaceAdmin(user) {
  return String(user?.role || '').trim().toLowerCase() === 'admin';
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
    const { q, include_internal, include_expired, countOnly, view } = req.query;
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
      view,
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
      graveyard_count: result.graveyard_count,
      active_count: result.active_count,
      has_more: result.has_more,
      count_is_estimate: result.count_is_estimate,
      visibility: includeInternal ? 'all' : 'reviewable',
      include_expired: includeExpired,
      view: result.view,
      snipara_error: result.snipara_error || null,
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
    const { include_internal, include_expired, view } = req.query;
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
      view,
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
      graveyard_count: result.graveyard_count,
      active_count: result.active_count,
      has_more: result.has_more,
      count_is_estimate: result.count_is_estimate,
      visibility: includeInternal ? 'all' : 'reviewable',
      include_expired: includeExpired,
      view: result.view,
      snipara_error: result.snipara_error || null,
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

    return res.json({ success: true, ...context, snipara_errors: context.snipara_errors || null });
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
      metadata: {
        needs_verification: true,
        created_via: 'dashboard',
      },
    });

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('[Memory API] remember failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/agents/:agentId/memories/:memoryId/attach-source', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId, memoryId } = req.params;
    const sourceRef = String(req.body?.source_ref || req.body?.source || '').trim();
    const evidenceNote = String(req.body?.evidence_note || req.body?.note || '').trim();
    if (!sourceRef) {
      return res.status(400).json({ success: false, error: 'source_ref is required' });
    }

    const agent = await resolveAgentRecord(pool, workspaceId, agentId);
    const data = await attachMemorySource({
      db: pool,
      workspaceId,
      agent,
      memoryId,
      sourceRef,
      evidenceNote,
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[Memory API] attach source failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/agents/:agentId/memories/:memoryId/verify', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId, memoryId } = req.params;
    const evidenceNote = String(req.body?.evidence_note || req.body?.note || '').trim();
    const probe = req.body?.probe && typeof req.body.probe === 'object' ? req.body.probe : null;
    const agent = await resolveAgentRecord(pool, workspaceId, agentId);

    const data = await verifyAgentMemory({
      db: pool,
      workspaceId,
      agent,
      memoryId,
      evidenceNote,
      probe,
    });

    let groupPromotions = [];
    try {
      const memory = await getAgentMemoryById({
        db: pool,
        workspaceId,
        agentIdOrUsername: agentId,
        memoryId,
        role: agent.role,
        fallbackAgent: agent,
      });

      if (memory) {
        groupPromotions = await autoPromoteVerifiedMemoryToGroupSpaces({
          db: pool,
          workspaceId,
          agent,
          memory: {
            ...memory,
            verified_at: data.verified_at || memory.verified_at || memory?.metadata?.verified_at || null,
            verification_note: evidenceNote || memory.verification_note || memory?.metadata?.verification_note || null,
          },
          verificationNote: evidenceNote,
        });
      }
    } catch (promotionError) {
      console.warn('[Memory API] group promotion after verify failed:', promotionError.message);
    }

    return res.json({
      success: true,
      data: {
        ...data,
        group_promotions: groupPromotions.map((promotion) => ({
          id: promotion.id,
          name: promotion.name,
          path: promotion.path,
        })),
      },
    });
  } catch (error) {
    console.error('[Memory API] verify failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/agents/:agentId/memories/:memoryId/invalidate', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId, memoryId } = req.params;
    const reason = String(req.body?.reason || '').trim();
    const replacementHint = String(req.body?.replacement_hint || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, error: 'reason is required' });
    }

    const agent = await resolveAgentRecord(pool, workspaceId, agentId);
    const data = await invalidateAgentMemory({
      db: pool,
      workspaceId,
      agent,
      memoryId,
      reason,
      replacementHint,
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[Memory API] invalidate failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/agents/:agentId/memories/:memoryId/supersede', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId, memoryId } = req.params;
    const newText = String(req.body?.new_text || req.body?.text || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const type = String(req.body?.type || 'fact').trim() || 'fact';
    const importance = req.body?.importance;
    if (!newText) {
      return res.status(400).json({ success: false, error: 'new_text is required' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, error: 'reason is required' });
    }

    const agent = await resolveAgentRecord(pool, workspaceId, agentId);
    const data = await supersedeAgentMemory({
      db: pool,
      workspaceId,
      agent,
      memoryId,
      newText,
      reason,
      type,
      importance,
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[Memory API] supersede failed:', error.message);
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
    const workspaceId = getWorkspaceId(req);
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    const canRead = canReadSharedMemory(state.policy, req.user || {});
    const canWrite = canWriteSharedMemory(state.policy, req.user || {});
    if (!canRead) {
      return res.status(403).json({ success: false, error: 'Shared workspace knowledge is restricted to admins' });
    }

    const knowledge = await loadWorkspaceKnowledge({ db: pool, workspaceId });
    return res.json({
      content: knowledge.content || state.content || '',
      updatedAt: state.metadata.updatedAt || '',
      updatedByEmail: state.metadata.updatedByEmail || null,
      readOnly: !canWrite,
      canRead,
      canWrite,
      policy: normalizeSharedMemoryPolicy(state.policy),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/workspace-knowledge', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    if (!canWriteSharedMemory(state.policy, req.user || {})) {
      return res.status(403).json({ success: false, error: 'Shared workspace knowledge is read-only for your role' });
    }

    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const metadata = await saveWorkspaceKnowledge({
      db: pool,
      workspaceId,
      content,
      user: req.user || {},
    });

    return res.json({
      content,
      updatedAt: metadata.updatedAt || '',
      updatedByEmail: metadata.updatedByEmail || null,
      readOnly: false,
      canRead: true,
      canWrite: true,
      policy: normalizeSharedMemoryPolicy(state.policy),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/workspace-knowledge/policy', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required to change shared memory policy' });
    }

    const policy = await saveSharedMemoryPolicy({
      db: pool,
      workspaceId,
      policy: req.body || {},
    });
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    const knowledge = await loadWorkspaceKnowledge({ db: pool, workspaceId });

    return res.json({
      content: knowledge.content || state.content || '',
      updatedAt: state.metadata.updatedAt || '',
      updatedByEmail: state.metadata.updatedByEmail || null,
      readOnly: !canWriteSharedMemory(policy, req.user || {}),
      canRead: canReadSharedMemory(policy, req.user || {}),
      canWrite: canWriteSharedMemory(policy, req.user || {}),
      policy,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/group-memory', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const spaces = await listGroupMemorySpaces({
      db: pool,
      workspaceId,
      user: req.user || {},
    });
    return res.json({
      success: true,
      spaces,
      count: spaces.length,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post('/group-memory', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const space = await createGroupMemorySpace({
      db: pool,
      workspaceId,
      input: req.body || {},
      user: req.user || {},
    });
    return res.status(201).json({ success: true, data: space });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.put('/group-memory/:spaceId', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { spaceId } = req.params;
    const space = await updateGroupMemorySpace({
      db: pool,
      workspaceId,
      spaceId,
      input: req.body || {},
      user: req.user || {},
    });
    return res.json({ success: true, data: space });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.delete('/group-memory/:spaceId', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { spaceId } = req.params;
    const result = await deleteGroupMemorySpace({
      db: pool,
      workspaceId,
      spaceId,
      user: req.user || {},
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get('/session-brief', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    const canRead = canReadSharedMemory(state.policy, req.user || {});
    const canWrite = canWriteSharedMemory(state.policy, req.user || {});
    if (!canRead) {
      return res.status(403).json({ success: false, error: 'Workspace session brief is restricted to admins' });
    }

    const brief = await getWorkspaceSessionBrief({ db: pool, workspaceId });
    return res.json({
      ...brief,
      readOnly: !canWrite,
      canRead,
      canWrite,
      policy: normalizeSharedMemoryPolicy(state.policy),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/session-brief', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    if (!canWriteSharedMemory(state.policy, req.user || {})) {
      return res.status(403).json({ success: false, error: 'Workspace session brief is read-only for your role' });
    }

    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const brief = await saveWorkspaceSessionBrief({
      db: pool,
      workspaceId,
      content,
      user: req.user || {},
    });

    return res.json({
      ...brief,
      readOnly: false,
      canRead: true,
      canWrite: true,
      policy: normalizeSharedMemoryPolicy(state.policy),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/journal/workspace', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    const canRead = canReadSharedMemory(state.policy, req.user || {});
    const canWrite = canWriteSharedMemory(state.policy, req.user || {});
    if (!canRead) {
      return res.status(403).json({ success: false, error: 'Workspace journal is restricted to admins' });
    }

    const journal = await getWorkspaceJournal({
      db: pool,
      workspaceId,
      date: normalizeJournalDate(req.query.date),
    });

    return res.json({
      ...journal,
      readOnly: !canWrite,
      canRead,
      canWrite,
      policy: normalizeSharedMemoryPolicy(state.policy),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/journal/workspace', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    if (!canWriteSharedMemory(state.policy, req.user || {})) {
      return res.status(403).json({ success: false, error: 'Workspace journal is read-only for your role' });
    }

    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const journal = await saveWorkspaceJournal({
      db: pool,
      workspaceId,
      date: normalizeJournalDate(req.body?.date || req.query.date),
      content,
      user: req.user || {},
    });

    return res.json({
      ...journal,
      readOnly: false,
      canRead: true,
      canWrite: true,
      policy: normalizeSharedMemoryPolicy(state.policy),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/journal/workspace/summarize', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const state = await getWorkspaceKnowledgeState({ db: pool, workspaceId });
    if (!canWriteSharedMemory(state.policy, req.user || {})) {
      return res.status(403).json({ success: false, error: 'Workspace journal is read-only for your role' });
    }

    const result = await summarizeWorkspaceJournalToBrief({
      db: pool,
      workspaceId,
      date: normalizeJournalDate(req.body?.date || req.query.date),
      user: req.user || {},
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/journal-automation', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const policies = await listJournalAutomationPolicies({ db: pool, workspaceId });
    return res.json({ success: true, data: policies });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/journal-automation/sweep-status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const status = await getJournalAutomationSweepStatus({ db: pool, workspaceId });
    return res.json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/journal-automation/runtime-status', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const status = await getJournalAutomationRuntimeStatus({ db: pool, workspaceId });
    return res.json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/journal-automation/sweep', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!isWorkspaceAdmin(req.user || {})) {
      return res.status(403).json({ success: false, error: 'Journal automation sweep is restricted to admins' });
    }

    const scope = String(req.body?.scope || req.query.scope || 'all').trim().toLowerCase();
    if (!['all', WORKSPACE_SCOPE, AGENT_SCOPE].includes(scope)) {
      return res.status(400).json({ success: false, error: 'scope must be all, workspace, or agent' });
    }

    const status = await runJournalAutomationSweep({
      db: pool,
      workspaceId,
      scope,
      date: normalizeJournalDate(req.body?.date || req.query.date),
      force: req.body?.force === true || req.query.force === 'true',
      user: req.user || {},
    });

    return res.json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/journal-automation/:scope', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!isWorkspaceAdmin(req.user || {})) {
      return res.status(403).json({ success: false, error: 'Journal automation policy is restricted to admins' });
    }

    const scope = normalizeJournalAutomationScope(req.params.scope);
    const mode = String(req.body?.mode || '').trim();
    const minimumLength = req.body?.minimum_length;
    const sweepEnabled = req.body?.sweep_enabled === true;
    if (![JOURNAL_AUTOMATION_MODE_MANUAL, JOURNAL_AUTOMATION_MODE_ON_SAVE].includes(mode)) {
      return res.status(400).json({ success: false, error: 'mode must be manual or on_save' });
    }

    const policy = await saveJournalAutomationPolicy({
      db: pool,
      workspaceId,
      scope,
      policy: {
        mode,
        minimum_length: minimumLength,
        sweep_enabled: sweepEnabled,
      },
      user: req.user || {},
    });

    return res.json({ success: true, data: policy });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents/:agentId/profile-brief', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const brief = await getAgentContinuityBrief({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      kind: AGENT_PROFILE_KIND,
    });
    return res.json({ ...brief, readOnly: false, canWrite: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/agents/:agentId/profile-brief', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const brief = await saveAgentContinuityBrief({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      kind: AGENT_PROFILE_KIND,
      content,
      user: req.user || {},
    });

    return res.json({ ...brief, readOnly: false, canWrite: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents/:agentId/group-memory', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const result = await listAgentGroupMemories({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
    });
    return res.json({ success: true, ...result, count: result.spaces.length });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get('/agents/:agentId/journal', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const journal = await getAgentJournal({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      date: normalizeJournalDate(req.query.date),
    });
    return res.json({ ...journal, readOnly: false, canWrite: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/agents/:agentId/journal', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const journal = await saveAgentJournal({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      date: normalizeJournalDate(req.body?.date || req.query.date),
      content,
      user: req.user || {},
    });

    return res.json({ ...journal, readOnly: false, canWrite: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/agents/:agentId/journal/summarize', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const result = await summarizeAgentJournalToBrief({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      date: normalizeJournalDate(req.body?.date || req.query.date),
      user: req.user || {},
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents/:agentId/session-brief', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const brief = await getAgentContinuityBrief({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      kind: AGENT_SESSION_KIND,
    });
    return res.json({ ...brief, readOnly: false, canWrite: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/agents/:agentId/session-brief', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;
    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const brief = await saveAgentContinuityBrief({
      db: pool,
      workspaceId,
      agentIdOrUsername: agentId,
      kind: AGENT_SESSION_KIND,
      content,
      user: req.user || {},
    });

    return res.json({ ...brief, readOnly: false, canWrite: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
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
