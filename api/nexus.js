/**
 * Nexus API — real deployment/runtime flow (API-key-first cloud)
 */
const express = require('express');
const { requireApiKey } = require('../lib/auth');
const pool = require('../lib/vaultbrix');
const {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
  ensureApiKeysTable,
} = require('../services/apiKeys');

const router = express.Router();
const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const HEARTBEAT_ONLINE_SECONDS = 90;

async function ensureNexusTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_deployments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL,
      created_by_user_id UUID NULL,
      agent_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('local', 'docker')),
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'online', 'offline', 'error')),
      api_key_id UUID NULL,
      client_company TEXT NULL,
      command_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_heartbeat_at TIMESTAMPTZ NULL,
      last_heartbeat_payload JSONB NULL,
      runtime_version TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_runtime_heartbeats (
      id BIGSERIAL PRIMARY KEY,
      deployment_id UUID NOT NULL REFERENCES ${SCHEMA}.nexus_deployments(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL,
      runtime_id TEXT NULL,
      runtime_version TEXT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}


async function ensureNexusNodesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_nodes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'vps',
      status TEXT DEFAULT 'offline',
      host TEXT,
      port INTEGER,
      api_key TEXT,
      config JSONB DEFAULT '{}'::jsonb,
      last_heartbeat TIMESTAMPTZ,
      agents_deployed JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Columns are migrated on Vaultbrix by SQL migration; avoid ALTER here to prevent owner conflicts.

}

function mapNode(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'vps',
    status: row.status || 'offline',
    host: row.host || null,
    port: row.port || null,
    config: row.config || row.metadata || {},
    agentsDeployed: row.agents_deployed || [],
    lastHeartbeat: row.last_heartbeat,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildCommands({ mode, apiKey, deploymentId, apiBaseUrl }) {
  const baseEnv = [
    `export NEXUS_API_BASE="${apiBaseUrl}"`,
    `export NEXUS_API_KEY="${apiKey}"`,
    `export NEXUS_DEPLOYMENT_ID="${deploymentId}"`,
  ];

  if (mode === 'local') {
    return {
      install: [
        'npm i -g vutler-nexus',
      ],
      run: [
        ...baseEnv,
        'vutler-nexus start',
      ],
      heartbeatHint: 'vutler-nexus will call /api/v1/nexus/runtime/heartbeat using NEXUS_API_KEY + NEXUS_DEPLOYMENT_ID.',
    };
  }

  return {
    install: [
      'docker pull starbox/vutler-nexus:latest || true',
    ],
    run: [
      `docker run -d --name vutler-nexus-${deploymentId.slice(0, 8)} \\`,
      `  -e NEXUS_API_BASE="${apiBaseUrl}" \\`,
      `  -e NEXUS_API_KEY="${apiKey}" \\`,
      `  -e NEXUS_DEPLOYMENT_ID="${deploymentId}" \\`,
      '  --restart unless-stopped starbox/vutler-nexus:latest',
    ],
    heartbeatHint: 'Container runtime must post heartbeat to /api/v1/nexus/runtime/heartbeat.',
  };
}


router.get('/', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );
    res.json({ success: true, data: result.rows.map(mapNode) });
  } catch (err) {
    console.error('[NEXUS] List nodes error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { name, type = 'vps', host = null, port = null, api_key = null, config = {} } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const insert = await pool.query(
      `INSERT INTO ${SCHEMA}.nexus_nodes (workspace_id, name, type, status, host, port, api_key, config, agents_deployed)
       VALUES ($1, $2, $3, 'offline', $4, $5, $6, $7::jsonb, '[]'::jsonb)
       RETURNING *`,
      [workspaceId, name, type, host, port, api_key, JSON.stringify(config || {})]
    );

    res.status(201).json({ success: true, data: mapNode(insert.rows[0]) });
  } catch (err) {
    console.error('[NEXUS] Create node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/deployments', async (req, res) => {
  try {
    await ensureNexusTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT id, agent_id, mode, status, runtime_version, last_heartbeat_at, created_at, updated_at
       FROM ${SCHEMA}.nexus_deployments
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[NEXUS] List deployments error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Management endpoints (JWT-auth via global middleware)
router.get('/keys', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const keys = await listApiKeys({ workspaceId: req.workspaceId || DEFAULT_WORKSPACE });
    res.json({ success: true, keys });
  } catch (err) {
    console.error('[NEXUS] List keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/keys', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const created = await createApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      userId: req.userId || req.user?.id || null,
      name: req.body?.name || 'Nexus key',
    });

    res.json({
      success: true,
      key: {
        id: created.id,
        name: created.name,
        key_prefix: created.key_prefix,
        created_at: created.created_at,
      },
      secret: created.secret,
      message: 'Store this secret now. It will not be shown again.',
    });
  } catch (err) {
    console.error('[NEXUS] Create key error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/keys/:id', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const revoked = await revokeApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      id: req.params.id,
    });

    if (!revoked) {
      return res.status(404).json({ success: false, error: 'API key not found or already revoked' });
    }

    res.json({ success: true, revoked });
  } catch (err) {
    console.error('[NEXUS] Revoke key error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/deploy/plan', async (req, res) => {
  try {
    await ensureNexusTables();

    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const createdBy = req.userId || req.user?.id || null;
    const { agentIds, mode, apiKeyId, apiKey, clientCompany } = req.body || {};

    if (!Array.isArray(agentIds) || !agentIds.length) {
      return res.status(400).json({ success: false, error: 'agentIds[] is required' });
    }
    if (mode !== 'local' && mode !== 'docker') {
      return res.status(400).json({ success: false, error: 'mode must be local or docker' });
    }
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'apiKey is required (one-time secret from /nexus/keys)' });
    }

    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
    const deployments = [];

    for (const agentId of agentIds) {
      const inserted = await pool.query(
        `INSERT INTO ${SCHEMA}.nexus_deployments (
          workspace_id,
          created_by_user_id,
          agent_id,
          mode,
          status,
          api_key_id,
          client_company,
          command_context
        ) VALUES ($1, $2, $3, $4, 'planned', $5, $6, $7::jsonb)
        RETURNING id, agent_id, mode, status, created_at`,
        [
          workspaceId,
          createdBy,
          String(agentId),
          mode,
          apiKeyId || null,
          clientCompany || null,
          JSON.stringify({ apiBaseUrl }),
        ]
      );

      const row = inserted.rows[0];
      deployments.push({
        id: row.id,
        agentId: row.agent_id,
        mode: row.mode,
        status: row.status,
        createdAt: row.created_at,
        commands: buildCommands({ mode: row.mode, apiKey, deploymentId: row.id, apiBaseUrl }),
      });
    }

    res.json({ success: true, deployments, apiBaseUrl });
  } catch (err) {
    console.error('[NEXUS] Deploy plan error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Runtime heartbeat requires API key auth (strict)
router.post('/runtime/heartbeat', requireApiKey, async (req, res) => {
  try {
    await ensureNexusTables();

    const { deploymentId, runtimeId, runtimeVersion, status, payload } = req.body || {};
    if (!deploymentId) {
      return res.status(400).json({ success: false, error: 'deploymentId is required' });
    }

    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const safeStatus = status === 'error' ? 'error' : 'online';

    const updateResult = await pool.query(
      `UPDATE ${SCHEMA}.nexus_deployments
       SET status = $3,
           last_heartbeat_at = NOW(),
           last_heartbeat_payload = $4::jsonb,
           runtime_version = $5,
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING id`,
      [deploymentId, workspaceId, safeStatus, JSON.stringify(payload || {}), runtimeVersion || null]
    );

    if (!updateResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Deployment not found for this API key workspace' });
    }

    await pool.query(
      `INSERT INTO ${SCHEMA}.nexus_runtime_heartbeats (
        deployment_id,
        workspace_id,
        runtime_id,
        runtime_version,
        status,
        payload
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
      [deploymentId, workspaceId, runtimeId || null, runtimeVersion || null, safeStatus, JSON.stringify(payload || {})]
    );

    res.json({ success: true, deploymentId, status: safeStatus, receivedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[NEXUS] Heartbeat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/runtime/verify/:deploymentId', async (req, res) => {
  try {
    await ensureNexusTables();

    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT
        id,
        agent_id,
        mode,
        status,
        runtime_version,
        last_heartbeat_at,
        last_heartbeat_payload,
        created_at,
        updated_at,
        CASE
          WHEN last_heartbeat_at IS NULL THEN false
          WHEN last_heartbeat_at >= NOW() - ($3::int * INTERVAL '1 second') THEN true
          ELSE false
        END AS online
      FROM ${SCHEMA}.nexus_deployments
      WHERE id::text = $1 AND workspace_id = $2
      LIMIT 1`,
      [req.params.deploymentId, workspaceId, HEARTBEAT_ONLINE_SECONDS]
    );

    const deployment = result.rows[0];
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }

    res.json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agent_id,
        mode: deployment.mode,
        status: deployment.status,
        runtimeVersion: deployment.runtime_version,
        online: deployment.online,
        lastHeartbeat: deployment.last_heartbeat_at,
        lastHeartbeatPayload: deployment.last_heartbeat_payload || {},
        createdAt: deployment.created_at,
        updatedAt: deployment.updated_at,
      },
    });
  } catch (err) {
    console.error('[NEXUS] Verify runtime error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy CLI token endpoints now backed by workspace API keys
router.get('/cli/tokens', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const keys = await listApiKeys({ workspaceId: req.workspaceId || DEFAULT_WORKSPACE });
    const tokens = keys.map((k) => ({
      id: k.id,
      name: k.name,
      token: `${k.key_prefix}...`,
      createdAt: k.created_at,
      lastUsed: k.last_used_at,
      revokedAt: k.revoked_at,
    }));
    res.json({ success: true, tokens });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/cli/tokens', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const created = await createApiKey({
      workspaceId: req.workspaceId || DEFAULT_WORKSPACE,
      userId: req.userId || req.user?.id || null,
      name: req.body?.name || 'Nexus key',
    });
    res.json({ success: true, token: created.secret, id: created.id, key_prefix: created.key_prefix });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/cli/tokens/:id', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const revoked = await revokeApiKey({ workspaceId: req.workspaceId || DEFAULT_WORKSPACE, id: req.params.id });
    if (!revoked) return res.status(404).json({ success: false, error: 'Token not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Backward-compatibility shims
router.post('/local-token', async (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Deprecated. Use /api/v1/nexus/keys to create an API key for cloud pairing.',
    code: 'LOCAL_TOKEN_DEPRECATED',
  });
});

router.get('/status', async (req, res) => {
  try {
    await ensureNexusTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;

    const stats = await pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE last_heartbeat_at IS NOT NULL
            AND last_heartbeat_at >= NOW() - ($2::int * INTERVAL '1 second')
        )::int AS online,
        MAX(last_heartbeat_at) AS last_heartbeat
      FROM ${SCHEMA}.nexus_deployments
      WHERE workspace_id = $1`,
      [workspaceId, HEARTBEAT_ONLINE_SECONDS]
    );

    const row = stats.rows[0] || { total: 0, online: 0, last_heartbeat: null };
    res.json({
      success: true,
      registered: Number(row.total) > 0,
      connected: Number(row.online) > 0,
      syncState: 'cloud',
      connectedAgents: Number(row.online),
      deploymentsTotal: Number(row.total),
      lastSync: row.last_heartbeat,
      workspaceId,
      auth: req.authType || 'jwt',
    });
  } catch (err) {
    console.error('[NEXUS] Status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    // Extract API key from Authorization header or body
    const authHeader = req.headers['authorization'] || '';
    const secret = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : req.body?.apiKey || req.body?.key || null;

    if (!secret) {
      return res.status(401).json({ success: false, error: 'API key is required' });
    }

    const { name, type = 'local', host = null, port = null, config = {} } = req.body || {};
    const nodeName = name || require('os').hostname();

    let workspaceId = DEFAULT_WORKSPACE;
    let nodeId;
    let authMethod;
    const isDev = process.env.NODE_ENV !== 'production';

    // In dev mode: accept any key prefixed with "vutler_" without DB validation
    if (isDev && secret.startsWith('vutler_')) {
      try {
        await ensureApiKeysTable();
        await ensureNexusNodesTable();
        const keyRecord = await resolveApiKey(secret);
        if (keyRecord) {
          workspaceId = keyRecord.workspace_id;
          authMethod = 'api_key';
        }
      } catch (_) { /* DB down in dev — ignore */ }

      if (!authMethod) {
        console.warn('[NEXUS] Dev mode — accepting key without DB validation');
        authMethod = 'dev_mode';
      }

      nodeId = require('crypto').randomUUID();
      // Try to persist to DB (best effort)
      try {
        const insert = await pool.query(
          `INSERT INTO ${SCHEMA}.nexus_nodes (workspace_id, name, type, status, host, port, config, agents_deployed)
           VALUES ($1, $2, $3, 'online', $4, $5, $6::jsonb, '[]'::jsonb)
           RETURNING id`,
          [workspaceId, nodeName, type, host, port, JSON.stringify(config || {})]
        );
        nodeId = insert.rows[0].id;
      } catch (_) { /* DB down — use random UUID */ }

    } else {
      // Production mode: strict DB validation
      await ensureApiKeysTable();
      await ensureNexusNodesTable();
      const keyRecord = await resolveApiKey(secret);
      if (!keyRecord) {
        return res.status(401).json({ success: false, error: 'Invalid or revoked API key' });
      }
      workspaceId = keyRecord.workspace_id;
      authMethod = 'api_key';

      const insert = await pool.query(
        `INSERT INTO ${SCHEMA}.nexus_nodes (workspace_id, name, type, status, host, port, config, agents_deployed)
         VALUES ($1, $2, $3, 'online', $4, $5, $6::jsonb, '[]'::jsonb)
         RETURNING id`,
        [workspaceId, nodeName, type, host, port, JSON.stringify(config || {})]
      );
      nodeId = insert.rows[0].id;
    }

    console.log(`[NEXUS] Node registered: ${nodeName} (${nodeId}) [${authMethod}]`);

    res.json({
      success: true,
      message: 'Registered',
      nodeId,
      workspaceId,
      auth: authMethod,
    });
  } catch (err) {
    console.error('[NEXUS] Register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// === Nexus UI wiring endpoints ===

async function ensureNexusRoutesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_routes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      task_type TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      model TEXT DEFAULT 'GPT-4o',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

router.get('/routes', async (req, res) => {
  try {
    await ensureNexusRoutesTable();
    const wsId = req.workspaceId || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT id, task_type, agent_name, model, status, created_at FROM ${SCHEMA}.nexus_routes WHERE workspace_id = $1 ORDER BY created_at`, [wsId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/routes', async (req, res) => {
  try {
    await ensureNexusRoutesTable();
    const wsId = req.workspaceId || DEFAULT_WORKSPACE;
    const { task_type, agent_name, model } = req.body || {};
    if (!task_type || !agent_name) return res.status(400).json({ success: false, error: 'task_type and agent_name required' });
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.nexus_routes (workspace_id, task_type, agent_name, model) VALUES ($1, $2, $3, $4) RETURNING *`,
      [wsId, task_type, agent_name, model || 'GPT-4o']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    await ensureNexusTables();
    const wsId = req.workspaceId || DEFAULT_WORKSPACE;
    const deploys = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE last_heartbeat_at >= NOW() - INTERVAL '24 hours')::int AS routed_today, COUNT(*) FILTER (WHERE status = 'error')::int AS fallbacks FROM ${SCHEMA}.nexus_deployments WHERE workspace_id = $1`, [wsId]
    );
    const row = deploys.rows[0] || {};
    res.json({ success: true, data: { routedToday: row.routed_today || 0, avgResponseMs: null, fallbackTriggers: row.fallbacks || 0, totalDeployments: row.total || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/smoke-test', async (req, res) => {
  const checks = []; const t0 = Date.now();
  checks.push({ name: 'API Health', passed: true, ms: Date.now() - t0 });
  try { const t1 = Date.now(); await pool.query('SELECT 1'); checks.push({ name: 'Database', passed: true, ms: Date.now() - t1 }); }
  catch (e) { checks.push({ name: 'Database', passed: false, ms: 0, error: e.message }); }
  try { const t2 = Date.now(); await pool.query(`SELECT COUNT(*)::int FROM ${SCHEMA}.nexus_deployments LIMIT 1`); checks.push({ name: 'Nexus Tables', passed: true, ms: Date.now() - t2 }); }
  catch (e) { checks.push({ name: 'Nexus Tables', passed: false, ms: 0, error: e.message }); }
  try { await ensureNexusRoutesTable(); const t3 = Date.now(); await pool.query(`SELECT COUNT(*)::int FROM ${SCHEMA}.nexus_routes LIMIT 1`); checks.push({ name: 'Routes Table', passed: true, ms: Date.now() - t3 }); }
  catch (e) { checks.push({ name: 'Routes Table', passed: false, ms: 0, error: e.message }); }
  checks.push({ name: 'Response Time', passed: (Date.now() - t0) < 5000, ms: Date.now() - t0 });
  res.json({ success: true, data: { checks, totalMs: Date.now() - t0, allPassed: checks.every(c => c.passed), timestamp: new Date().toISOString() } });
});


// Node runtime operations
router.put('/:id', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { name, type, status, host, port, api_key, config } = req.body || {};
    const update = await pool.query(
      `UPDATE ${SCHEMA}.nexus_nodes
       SET name = COALESCE($3, name),
           type = COALESCE($4, type),
           status = COALESCE($5, status),
           host = COALESCE($6, host),
           port = COALESCE($7, port),
           api_key = COALESCE($8, api_key),
           config = COALESCE($9::jsonb, config),
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, workspaceId, name || null, type || null, status || null, host || null, port || null, api_key || null, config ? JSON.stringify(config) : null]
    );
    if (!update.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, data: mapNode(update.rows[0]) });
  } catch (err) {
    console.error('[NEXUS] Update node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const del = await pool.query(`DELETE FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 RETURNING id`, [req.params.id, workspaceId]);
    if (!del.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, deletedId: del.rows[0].id });
  } catch (err) {
    console.error('[NEXUS] Delete node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/deploy', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { agentId, agentName } = req.body || {};
    if (!agentId && !agentName) return res.status(400).json({ success: false, error: 'agentId or agentName is required' });

    const nodeRes = await pool.query(`SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`, [req.params.id, workspaceId]);
    if (!nodeRes.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });

    const node = nodeRes.rows[0];
    const deployed = Array.isArray(node.agents_deployed) ? node.agents_deployed : [];
    const entry = { id: agentId || null, name: agentName || agentId, deployedAt: new Date().toISOString() };
    deployed.push(entry);

    const updated = await pool.query(
      `UPDATE ${SCHEMA}.nexus_nodes
       SET agents_deployed = $3::jsonb,
           status = 'online',
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, workspaceId, JSON.stringify(deployed)]
    );

    res.json({ success: true, message: 'Agent deployment registered', data: mapNode(updated.rows[0]), deployment: entry });
  } catch (err) {
    console.error('[NEXUS] Deploy node error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/health', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const out = await pool.query(`SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`, [req.params.id, workspaceId]);
    if (!out.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });

    const node = out.rows[0];
    const last = node.last_heartbeat ? new Date(node.last_heartbeat).getTime() : 0;
    const online = !!last && (Date.now() - last <= HEARTBEAT_ONLINE_SECONDS * 1000);
    const health = online ? 'healthy' : 'offline';

    res.json({
      success: true,
      data: {
        nodeId: node.id,
        status: node.status,
        health,
        online,
        lastHeartbeat: node.last_heartbeat,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[NEXUS] Node health error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/connect', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { status, agents, memory, uptime, api_key } = req.body || {};
    const updated = await pool.query(
      `UPDATE ${SCHEMA}.nexus_nodes
       SET status = $3,
           last_heartbeat = NOW(),
           agents_deployed = $4::jsonb,
           config = COALESCE(config, '{}'::jsonb) || $5::jsonb,
           api_key = COALESCE($6, api_key),
           updated_at = NOW()
       WHERE id::text = $1 AND workspace_id = $2
       RETURNING *`,
      [
        req.params.id,
        workspaceId,
        status || 'online',
        JSON.stringify(agents || []),
        JSON.stringify({ memory, uptime }),
        api_key || null,
      ]
    );
    if (!updated.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, message: 'Node connected', data: mapNode(updated.rows[0]) });
  } catch (err) {
    console.error('[NEXUS] Node connect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    await ensureNexusTables();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const node = await pool.query(`SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`, [req.params.id, workspaceId]);
    if (!node.rows.length) return res.status(404).json({ success: false, error: 'Node not found' });

    const logs = await pool.query(
      `SELECT id, deployment_id, status, payload, received_at
       FROM ${SCHEMA}.nexus_runtime_heartbeats
       WHERE workspace_id = $1
       ORDER BY received_at DESC
       LIMIT 100`,
      [workspaceId]
    );

    res.json({ success: true, data: logs.rows, source: 'nexus_runtime_heartbeats', note: 'Workspace-level latest runtime logs' });
  } catch (err) {
    console.error('[NEXUS] Node logs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Task delivery endpoints for Nexus nodes
router.get('/:nodeId/tasks', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId } = req.params;

    const nodeRes = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
      [nodeId, workspaceId]
    );
    if (!nodeRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks
       WHERE status IN ('pending', 'assigned') AND workspace_id = $1
       ORDER BY priority DESC, created_at ASC
       LIMIT 10`,
      [workspaceId]
    );

    res.json({ success: true, tasks: result.rows });
  } catch (err) {
    console.error('[NEXUS] Get node tasks error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:nodeId/tasks/:taskId/status', async (req, res) => {
  try {
    await ensureNexusNodesTable();
    const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
    const { nodeId, taskId } = req.params;
    const { status, output, error: taskError } = req.body || {};

    const ALLOWED_STATUSES = ['in_progress', 'completed', 'failed'];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
      });
    }

    const nodeRes = await pool.query(
      `SELECT * FROM ${SCHEMA}.nexus_nodes WHERE id::text = $1 AND workspace_id = $2 LIMIT 1`,
      [nodeId, workspaceId]
    );
    if (!nodeRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const updateResult = await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET status = $1, updated_at = NOW()
       WHERE id::text = $2 AND workspace_id = $3
       RETURNING *`,
      [status, taskId, workspaceId]
    );

    if (!updateResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = updateResult.rows[0];

    if (status === 'completed' && task.swarm_task_id) {
      try {
        const swarmCoordinator = require('../services/swarmCoordinator');
        await swarmCoordinator.completeTask(task.swarm_task_id, nodeId, output || null);
      } catch (swarmErr) {
        console.error('[NEXUS] swarmCoordinator.completeTask error:', swarmErr.message);
      }
    }

    res.json({ success: true, task });
  } catch (err) {
    console.error('[NEXUS] Update task status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
