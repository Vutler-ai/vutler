'use strict';

/**
 * Integrations API (internal catalog mode)
 * Workspace-scoped, PostgreSQL-backed persistence.
 */

const express = require('express');
const pool = require('../lib/vaultbrix');

const router = express.Router();

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

let initPromise = null;

const INTERNAL_CATALOG = [
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Team messaging and channel automations',
    icon: '💬',
    category: 'communication',
    actions: ['send_message', 'list_channels', 'get_user_info'],
    scopes: ['messages:write', 'channels:read'],
  },
  {
    provider: 'google',
    name: 'Google Workspace',
    description: 'Gmail, Calendar, Drive, and Docs integration',
    icon: '🔵',
    category: 'productivity',
    actions: ['send_email', 'list_files', 'create_event'],
    scopes: ['gmail.readonly', 'calendar.readonly', 'drive.readonly'],
  },
  {
    provider: 'github',
    name: 'GitHub',
    description: 'Code repository, issues, and pull requests',
    icon: '🐙',
    category: 'development',
    actions: ['list_repos', 'create_issue', 'list_commits'],
    scopes: ['repo', 'read:user'],
  },
  {
    provider: 'notion',
    name: 'Notion',
    description: 'Pages, databases, and knowledge base sync',
    icon: '📝',
    category: 'knowledge',
    actions: ['search_pages', 'read_database'],
    scopes: ['read', 'write'],
  },
  {
    provider: 'jira',
    name: 'Jira',
    description: 'Project tracking, sprints, and issue management',
    icon: '🔷',
    category: 'project-management',
    actions: ['list_projects', 'create_issue'],
    scopes: ['read:jira-user', 'read:jira-work', 'write:jira-work'],
  },
  {
    provider: 'linear',
    name: 'Linear',
    description: 'Issue tracking, cycles, and product roadmaps',
    icon: '🟣',
    category: 'project-management',
    actions: ['list_issues', 'create_issue'],
    scopes: ['read', 'write'],
  },
  {
    provider: 'n8n',
    name: 'n8n',
    description: 'Workflow automation and custom integrations',
    icon: '⚡',
    category: 'automation',
    actions: ['trigger_workflow', 'list_workflows'],
    scopes: ['workflow:read', 'workflow:execute'],
  },
  {
    provider: 'microsoft365',
    name: 'Microsoft 365',
    description: 'Outlook, Teams, OneDrive, and SharePoint',
    icon: '🟦',
    category: 'productivity',
    actions: ['send_mail', 'list_events'],
    scopes: ['mail.read', 'calendars.read'],
  },
];

async function ensureReady() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const check1 = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='integrations_catalog'`
        );
        if (check1.rows.length === 0) {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS ${SCHEMA}.integrations_catalog (
              provider TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              description TEXT,
              icon TEXT,
              category TEXT,
              source TEXT NOT NULL DEFAULT 'internal',
              actions JSONB NOT NULL DEFAULT '[]'::jsonb,
              default_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
              is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);
        }

        const check2 = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='workspace_integrations'`
        );
        if (check2.rows.length === 0) {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_integrations (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              workspace_id UUID NOT NULL,
              provider TEXT NOT NULL,
              source TEXT NOT NULL DEFAULT 'internal',
              connected BOOLEAN NOT NULL DEFAULT FALSE,
              status TEXT NOT NULL DEFAULT 'disconnected',
              config JSONB NOT NULL DEFAULT '{}'::jsonb,
              scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
              credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
              connected_at TIMESTAMPTZ,
              disconnected_at TIMESTAMPTZ,
              connected_by TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(workspace_id, provider)
            );
          `);
        }

        const check3 = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='workspace_integration_logs'`
        );
        if (check3.rows.length === 0) {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_integration_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              workspace_id UUID NOT NULL,
              provider TEXT NOT NULL,
              action TEXT NOT NULL,
              status TEXT NOT NULL,
              duration_ms INTEGER,
              error_message TEXT,
              payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);
        }

        const check4 = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='workspace_integration_agents'`
        );
        if (check4.rows.length === 0) {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_integration_agents (
              workspace_id UUID NOT NULL,
              provider TEXT NOT NULL,
              agent_id UUID NOT NULL,
              has_access BOOLEAN NOT NULL DEFAULT TRUE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY(workspace_id, provider, agent_id)
            );
          `);
        }
      } catch (err) {
        console.warn('[INTEGRATIONS] ensureReady warning (tables may already exist):', err.message);
      }

      for (const integration of INTERNAL_CATALOG) {
        await pool.query(
          `INSERT INTO ${SCHEMA}.integrations_catalog
            (provider, name, description, icon, category, source, actions, default_scopes, is_enabled)
           VALUES ($1, $2, $3, $4, $5, 'internal', $6::jsonb, $7::jsonb, TRUE)
           ON CONFLICT (provider) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             icon = EXCLUDED.icon,
             category = EXCLUDED.category,
             source = 'internal',
             actions = EXCLUDED.actions,
             default_scopes = EXCLUDED.default_scopes,
             updated_at = NOW()`,
          [
            integration.provider,
            integration.name,
            integration.description,
            integration.icon,
            integration.category,
            JSON.stringify(integration.actions || []),
            JSON.stringify(integration.scopes || []),
          ]
        );
      }
    })();
  }

  await initPromise;
}

function getWorkspaceId(req) {
  return req.workspaceId || DEFAULT_WORKSPACE;
}

async function addLog({ workspaceId, provider, action, status = 'success', durationMs = null, errorMessage = null, payload = {} }) {
  try {
    await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_integration_logs
        (workspace_id, provider, action, status, duration_ms, error_message, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [workspaceId, provider, action, status, durationMs, errorMessage, JSON.stringify(payload || {})]
    );
  } catch (_e) {
    // Best effort logging, never break API response.
  }
}

// GET /api/v1/integrations
router.get('/', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);

    const result = await pool.query(
      `SELECT
        c.provider,
        c.name,
        c.description,
        c.icon,
        c.category,
        c.source,
        COALESCE(wi.connected, FALSE) AS connected,
        COALESCE(wi.status, 'disconnected') AS status,
        wi.connected_at,
        wi.connected_by,
        wi.updated_at
      FROM ${SCHEMA}.integrations_catalog c
      LEFT JOIN ${SCHEMA}.workspace_integrations wi
        ON wi.provider = c.provider AND wi.workspace_id = $1
      WHERE c.is_enabled = TRUE
        AND c.source = 'internal'
      ORDER BY c.name ASC`,
      [workspaceId]
    );

    const integrations = result.rows.map((row) => ({
      provider: row.provider,
      id: row.provider,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category,
      source: row.source,
      connected: row.connected,
      status: row.status,
      connected_at: row.connected_at,
      connected_by: row.connected_by,
      updated_at: row.updated_at,
    }));

    res.json({ success: true, integrations });
  } catch (err) {
    console.error('[INTEGRATIONS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/available
router.get('/available', async (req, res) => {
  try {
    await ensureReady();

    const result = await pool.query(
      `SELECT provider, name, description, icon, category, source, actions
       FROM ${SCHEMA}.integrations_catalog
       WHERE is_enabled = TRUE AND source = 'internal'
       ORDER BY name ASC`
    );

    const providers = result.rows.map((row) => ({
      provider: row.provider,
      id: row.provider,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category,
      source: row.source,
      actions: row.actions || [],
    }));

    res.json({ success: true, providers, integrations: providers });
  } catch (err) {
    console.error('[INTEGRATIONS] Available error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/integrations (create or update workspace integration row)
router.post('/', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider, config = {}, credentials = {}, scopes = [] } = req.body || {};

    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ success: false, error: 'provider is required' });
    }

    const cat = await pool.query(
      `SELECT provider, source FROM ${SCHEMA}.integrations_catalog WHERE provider = $1 AND is_enabled = TRUE LIMIT 1`,
      [provider]
    );

    if (!cat.rows[0]) {
      return res.status(404).json({ success: false, error: 'Unknown integration provider' });
    }

    if (cat.rows[0].source !== 'internal') {
      return res.status(403).json({ success: false, error: 'External integrations are disabled in internal-only mode' });
    }

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_integrations
        (workspace_id, provider, source, connected, status, config, credentials, scopes, connected_at, connected_by, updated_at)
       VALUES ($1, $2, 'internal', TRUE, 'connected', $3::jsonb, $4::jsonb, $5::jsonb, NOW(), $6, NOW())
       ON CONFLICT (workspace_id, provider) DO UPDATE SET
         source = 'internal',
         connected = TRUE,
         status = 'connected',
         config = EXCLUDED.config,
         credentials = CASE
           WHEN EXCLUDED.credentials = '{}'::jsonb THEN ${SCHEMA}.workspace_integrations.credentials
           ELSE EXCLUDED.credentials
         END,
         scopes = EXCLUDED.scopes,
         connected_at = NOW(),
         disconnected_at = NULL,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()
       RETURNING workspace_id, provider, source, connected, status, connected_at, connected_by, updated_at, config, scopes`,
      [workspaceId, provider, JSON.stringify(config), JSON.stringify(credentials), JSON.stringify(scopes), req.user?.email || req.user?.name || req.userId || 'system']
    );

    await addLog({ workspaceId, provider, action: 'connect', payload: { via: 'post_root' } });

    res.json({ success: true, integration: result.rows[0] });
  } catch (err) {
    console.error('[INTEGRATIONS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/:provider/status
router.get('/:provider/status', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    const result = await pool.query(
      `SELECT
        c.provider,
        c.source,
        COALESCE(wi.connected, FALSE) AS connected,
        COALESCE(wi.status, 'disconnected') AS status,
        wi.connected_at,
        wi.connected_by
      FROM ${SCHEMA}.integrations_catalog c
      LEFT JOIN ${SCHEMA}.workspace_integrations wi
        ON wi.provider = c.provider AND wi.workspace_id = $1
      WHERE c.provider = $2 AND c.source = 'internal' AND c.is_enabled = TRUE
      LIMIT 1`,
      [workspaceId, provider]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Integration not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[INTEGRATIONS] Status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/:provider/logs
router.get('/:provider/logs', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    const result = await pool.query(
      `SELECT id::text AS id, action, status, created_at AS timestamp, duration_ms, error_message
       FROM ${SCHEMA}.workspace_integration_logs
       WHERE workspace_id = $1 AND provider = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [workspaceId, provider]
    );

    res.json({ success: true, logs: result.rows });
  } catch (err) {
    console.error('[INTEGRATIONS] Logs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/integrations/:provider/execute
router.post('/:provider/execute', async (req, res) => {
  const startedAt = Date.now();
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;
    const { action, parameters = {} } = req.body || {};

    const statusResult = await pool.query(
      `SELECT connected FROM ${SCHEMA}.workspace_integrations WHERE workspace_id = $1 AND provider = $2 LIMIT 1`,
      [workspaceId, provider]
    );

    if (!statusResult.rows[0]?.connected) {
      return res.status(400).json({ success: false, error: 'Integration is not connected' });
    }

    const responsePayload = {
      success: true,
      provider,
      action: action || 'noop',
      result: {
        ok: true,
        message: 'Execution accepted (internal mode stub)',
        parameters,
      },
    };

    await addLog({
      workspaceId,
      provider,
      action: action || 'execute',
      status: 'success',
      durationMs: Date.now() - startedAt,
      payload: parameters,
    });

    res.json(responsePayload);
  } catch (err) {
    const workspaceId = getWorkspaceId(req);
    await addLog({
      workspaceId,
      provider: req.params.provider,
      action: req.body?.action || 'execute',
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage: err.message,
      payload: req.body?.parameters || {},
    });
    console.error('[INTEGRATIONS] Execute error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/integrations/:provider/connect
router.post('/:provider/connect', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    const cat = await pool.query(
      `SELECT provider, source, default_scopes FROM ${SCHEMA}.integrations_catalog WHERE provider = $1 AND is_enabled = TRUE LIMIT 1`,
      [provider]
    );

    if (!cat.rows[0]) {
      return res.status(404).json({ success: false, error: 'Integration not found' });
    }

    if (cat.rows[0].source !== 'internal') {
      return res.status(403).json({ success: false, error: 'External integrations are disabled in internal-only mode' });
    }

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_integrations
        (workspace_id, provider, source, connected, status, scopes, connected_at, disconnected_at, connected_by, updated_at)
       VALUES ($1, $2, 'internal', TRUE, 'connected', COALESCE($3::jsonb, '[]'::jsonb), NOW(), NULL, $4, NOW())
       ON CONFLICT (workspace_id, provider) DO UPDATE SET
         source = 'internal',
         connected = TRUE,
         status = 'connected',
         connected_at = NOW(),
         disconnected_at = NULL,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()
       RETURNING workspace_id, provider, source, connected, status, connected_at, connected_by`,
      [workspaceId, provider, JSON.stringify(cat.rows[0].default_scopes || []), req.user?.email || req.user?.name || req.userId || 'system']
    );

    await addLog({ workspaceId, provider, action: 'connect' });

    res.json({ success: true, integration: result.rows[0], authUrl: null, mode: 'internal' });
  } catch (err) {
    console.error('[INTEGRATIONS] Connect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/integrations/:provider (update config/scopes)
router.put('/:provider', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;
    const { config = null, scopes = null, status = null } = req.body || {};

    const result = await pool.query(
      `UPDATE ${SCHEMA}.workspace_integrations
       SET
        config = CASE WHEN $3::jsonb IS NULL THEN config ELSE $3::jsonb END,
        scopes = CASE WHEN $4::jsonb IS NULL THEN scopes ELSE $4::jsonb END,
        status = CASE WHEN $5::text IS NULL THEN status ELSE $5::text END,
        updated_at = NOW()
       WHERE workspace_id = $1 AND provider = $2
       RETURNING workspace_id, provider, source, connected, status, connected_at, connected_by, updated_at, config, scopes`,
      [workspaceId, provider, config === null ? null : JSON.stringify(config), scopes === null ? null : JSON.stringify(scopes), status]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Integration not found in workspace' });
    }

    await addLog({ workspaceId, provider, action: 'update_config', payload: { hasConfig: config !== null, hasScopes: scopes !== null, status } });

    res.json({ success: true, integration: result.rows[0] });
  } catch (err) {
    console.error('[INTEGRATIONS] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/integrations/:provider/toggle
router.patch('/:provider/toggle', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    const current = await pool.query(
      `SELECT connected FROM ${SCHEMA}.workspace_integrations WHERE workspace_id = $1 AND provider = $2 LIMIT 1`,
      [workspaceId, provider]
    );

    if (!current.rows[0]) {
      return res.status(404).json({ success: false, error: 'Integration not found in workspace' });
    }

    const nextConnected = !current.rows[0].connected;
    const result = await pool.query(
      `UPDATE ${SCHEMA}.workspace_integrations
       SET
        connected = $3,
        status = CASE WHEN $3 THEN 'connected' ELSE 'disconnected' END,
        connected_at = CASE WHEN $3 THEN NOW() ELSE connected_at END,
        disconnected_at = CASE WHEN $3 THEN NULL ELSE NOW() END,
        updated_at = NOW()
       WHERE workspace_id = $1 AND provider = $2
       RETURNING workspace_id, provider, source, connected, status, connected_at, disconnected_at, updated_at`,
      [workspaceId, provider, nextConnected]
    );

    await addLog({ workspaceId, provider, action: nextConnected ? 'connect' : 'disconnect' });

    res.json({ success: true, integration: result.rows[0] });
  } catch (err) {
    console.error('[INTEGRATIONS] Toggle error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/integrations/:provider/disconnect
router.delete('/:provider/disconnect', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_integrations
        (workspace_id, provider, source, connected, status, connected_at, disconnected_at, updated_at)
       VALUES ($1, $2, 'internal', FALSE, 'disconnected', NULL, NOW(), NOW())
       ON CONFLICT (workspace_id, provider) DO UPDATE SET
         connected = FALSE,
         status = 'disconnected',
         disconnected_at = NOW(),
         updated_at = NOW()
       RETURNING workspace_id, provider, source, connected, status, connected_at, disconnected_at, updated_at`,
      [workspaceId, provider]
    );

    await addLog({ workspaceId, provider, action: 'disconnect' });

    res.json({ success: true, integration: result.rows[0], message: `${provider} disconnected` });
  } catch (err) {
    console.error('[INTEGRATIONS] Disconnect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/integrations/:provider (hard remove from workspace + compatibility)
router.delete('/:provider', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    await pool.query(
      `DELETE FROM ${SCHEMA}.workspace_integrations WHERE workspace_id = $1 AND provider = $2`,
      [workspaceId, provider]
    );

    await pool.query(
      `DELETE FROM ${SCHEMA}.workspace_integration_agents WHERE workspace_id = $1 AND provider = $2`,
      [workspaceId, provider]
    );

    await addLog({ workspaceId, provider, action: 'delete' });

    res.json({ success: true, message: `${provider} removed from workspace` });
  } catch (err) {
    console.error('[INTEGRATIONS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/:provider
router.get('/:provider', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    const result = await pool.query(
      `SELECT
        c.provider,
        c.name,
        c.description,
        c.icon,
        c.category,
        c.source,
        COALESCE(wi.connected, FALSE) AS connected,
        COALESCE(wi.status, 'disconnected') AS status,
        COALESCE(wi.scopes, c.default_scopes, '[]'::jsonb) AS scopes,
        COALESCE(wi.config, '{}'::jsonb) AS config,
        wi.connected_at,
        wi.connected_by,
        wi.updated_at
      FROM ${SCHEMA}.integrations_catalog c
      LEFT JOIN ${SCHEMA}.workspace_integrations wi
        ON wi.provider = c.provider AND wi.workspace_id = $1
      WHERE c.provider = $2
      LIMIT 1`,
      [workspaceId, provider]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: 'Integration not found' });
    }

    if (row.source !== 'internal') {
      return res.status(403).json({ success: false, error: 'External integrations are disabled in internal-only mode' });
    }

    res.json({
      success: true,
      integration: {
        provider: row.provider,
        id: row.provider,
        name: row.name,
        description: row.description,
        icon: row.icon,
        category: row.category,
        source: row.source,
        connected: row.connected,
        status: row.status,
        connected_at: row.connected_at,
        connected_by: row.connected_by,
        scopes: row.scopes || [],
        config: row.config || {},
        usage: { api_calls_today: 0, rate_limit_remaining: 1000 },
        webhook_url: `/api/v1/webhooks/${row.provider}`,
      },
    });
  } catch (err) {
    console.error('[INTEGRATIONS] Get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/:provider/agents
router.get('/:provider/agents', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;

    const result = await pool.query(
      `SELECT a.id::text AS id, a.name,
              COALESCE(wia.has_access, FALSE) AS has_access
       FROM ${SCHEMA}.agents a
       LEFT JOIN ${SCHEMA}.workspace_integration_agents wia
         ON wia.workspace_id = a.workspace_id AND wia.agent_id = a.id AND wia.provider = $2
       WHERE a.workspace_id = $1
       ORDER BY a.name ASC`,
      [workspaceId, provider]
    );

    const agents = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      has_access: row.has_access,
      connected: row.has_access,
    }));

    res.json({ success: true, agents });
  } catch (err) {
    console.error('[INTEGRATIONS] Agents error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/integrations/:provider/agents
router.put('/:provider/agents', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { provider } = req.params;
    const list = (req.body?.agents || []).map((id) => String(id));

    await pool.query(
      `DELETE FROM ${SCHEMA}.workspace_integration_agents WHERE workspace_id = $1 AND provider = $2`,
      [workspaceId, provider]
    );

    for (const agentId of list) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.workspace_integration_agents
          (workspace_id, provider, agent_id, has_access, created_at, updated_at)
         VALUES ($1, $2, $3::uuid, TRUE, NOW(), NOW())
         ON CONFLICT (workspace_id, provider, agent_id) DO UPDATE SET
           has_access = TRUE,
           updated_at = NOW()`,
        [workspaceId, provider, agentId]
      );
    }

    await addLog({ workspaceId, provider, action: 'update_agent_access', payload: { count: list.length } });

    res.json({ success: true, message: 'Agent access updated', agents: list });
  } catch (err) {
    console.error('[INTEGRATIONS] Agents update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/n8n/workflows
router.get('/n8n/workflows', async (_req, res) => {
  res.json({ success: true, workflows: [] });
});

// POST /api/v1/integrations/n8n/workflows/:id/trigger
router.post('/n8n/workflows/:id/trigger', async (req, res) => {
  const { id } = req.params;
  res.json({ success: true, message: `Workflow ${id} trigger accepted`, executionId: `exec-${Date.now()}` });
});

// POST /api/v1/integrations/:provider/callback
router.post('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  return res.status(409).json({
    success: false,
    error: `OAuth callback for ${provider} is disabled in internal-only mode`,
    code: 'INTERNAL_ONLY_MODE',
  });
});

// POST /api/v1/integrations/submissions (blocked external submission path)
router.post('/submissions', async (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Marketplace submissions are disabled (internal-only mode)',
    code: 'INTERNAL_ONLY_MODE',
  });
});

module.exports = router;
