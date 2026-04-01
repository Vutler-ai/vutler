'use strict';

/**
 * Sandbox API — queued job submission + execution history.
 *
 * Compatibility:
 *   - existing `/execute`, `/batch`, `/executions`, `/executions/:id` routes stay in place
 *   - the payloads are now backed by `sandbox_jobs`
 */

const express = require('express');
const router = express.Router();
const {
  ensureSandboxSchema,
  executeInSandbox,
  executeBatch,
  listSandboxJobs,
  getSandboxJob,
} = require('../services/sandbox');

const MAX_TIMEOUT_MS = 60_000;

function clampTimeout(timeoutMs, fallback = 30_000) {
  return Math.min(
    Number.isFinite(timeoutMs) ? Number(timeoutMs) : fallback,
    MAX_TIMEOUT_MS
  );
}

function isPendingJob(result) {
  return result?.status === 'pending' || result?.status === 'running';
}

ensureSandboxSchema().catch((err) => {
  console.warn('[SandboxAPI] ensureSandboxSchema warning:', err.message);
});

router.use((req, res, next) => {
  if (!req.user || !req.userId) {
    return res.status(401).json({ success: false, error: 'Authentication required for sandbox execution' });
  }
  next();
});

router.post('/execute', async (req, res) => {
  const { language, code, timeout_ms, agent_id, wait_for_completion = true } = req.body || {};

  if (!language || !code) {
    return res.status(400).json({ success: false, error: 'language and code are required' });
  }

  const supported = ['javascript', 'python', 'shell'];
  if (!supported.includes(language)) {
    return res.status(400).json({ success: false, error: `language must be one of: ${supported.join(', ')}` });
  }

  try {
    const result = await executeInSandbox(
      language,
      code,
      agent_id || null,
      clampTimeout(timeout_ms),
      {
        workspaceId: req.workspaceId || null,
        source: 'api',
        metadata: {
          requested_by: req.userId || null,
          route: 'sandbox.execute',
        },
        waitForCompletion: wait_for_completion !== false,
        throwOnWaitTimeout: false,
      }
    );

    res.status(isPendingJob(result) ? 202 : 200).json({ success: true, data: result });
  } catch (err) {
    console.error('[Sandbox] Execute error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/executions', async (req, res) => {
  const { agent_id, language, status, limit = '20', offset = '0' } = req.query;

  try {
    const result = await listSandboxJobs({
      workspaceId: req.workspaceId || null,
      agentId: agent_id || null,
      language: language || null,
      status: status || null,
      limit: Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
      topLevelOnly: true,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Sandbox] List executions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/executions/:id', async (req, res) => {
  try {
    const result = await getSandboxJob(req.params.id, req.workspaceId || null);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Sandbox] Get execution error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/batch', async (req, res) => {
  const { scripts, stop_on_error = true, agent_id, wait_for_completion = true } = req.body || {};

  if (!Array.isArray(scripts) || scripts.length === 0) {
    return res.status(400).json({ success: false, error: 'scripts must be a non-empty array' });
  }

  if (scripts.length > 20) {
    return res.status(400).json({ success: false, error: 'Maximum 20 scripts per batch' });
  }

  const supported = ['javascript', 'python', 'shell'];
  for (const [i, script] of scripts.entries()) {
    if (!script.language || !script.code) {
      return res.status(400).json({ success: false, error: `scripts[${i}]: language and code are required` });
    }
    if (!supported.includes(script.language)) {
      return res.status(400).json({ success: false, error: `scripts[${i}]: invalid language "${script.language}"` });
    }
  }

  try {
    const results = await executeBatch(scripts, {
      stopOnError: stop_on_error,
      agentId: agent_id || null,
      workspaceId: req.workspaceId || null,
      source: 'api',
      metadata: {
        requested_by: req.userId || null,
        route: 'sandbox.batch',
      },
      waitForCompletion: wait_for_completion !== false,
    });

    const hasPending = results.some(isPendingJob);
    res.status(hasPending ? 202 : 200).json({ success: true, data: results });
  } catch (err) {
    console.error('[Sandbox] Batch error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
