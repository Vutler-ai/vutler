'use strict';

/**
 * Integrations API
 * Supports internal catalog mode + real OAuth for Google, GitHub, and Microsoft 365.
 */

const express = require('express');
const https = require('https');
const crypto = require('crypto');
const pool = require('../lib/vaultbrix');
const { encryptProviderSecret } = require('../services/providerSecrets');
const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');
const { resolveAgentCapabilityMatrix } = require('../services/agentCapabilityMatrixService');
const googleApi = require('../services/google/googleApi');
const microsoftGraphApi = require('../services/microsoft/graphApi');

const router = express.Router();

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

// OAuth config — reuse the same client IDs used for login auth
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

// Callback base — the backend's public URL, e.g. https://app.vutler.ai
const APP_BASE = process.env.APP_BASE_URL || process.env.GOOGLE_REDIRECT_URI?.replace('/api/v1/auth/google/callback', '') || 'https://app.vutler.ai';

const GOOGLE_INTEGRATION_REDIRECT = `${APP_BASE}/api/v1/integrations/google/callback`;
const GITHUB_INTEGRATION_REDIRECT = `${APP_BASE}/api/v1/integrations/github/callback`;
const MICROSOFT_INTEGRATION_REDIRECT = `${APP_BASE}/api/v1/integrations/microsoft365/callback`;
const SETTINGS_INTEGRATIONS_PATH = '/settings/integrations';

// ChatGPT / Codex OAuth — Device Auth Flow (no redirect URI needed)
const CHATGPT_CLIENT_ID = process.env.CHATGPT_CLIENT_ID || '';
const CHATGPT_API_BASE = 'https://auth.openai.com/api/accounts';
const CHATGPT_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CHATGPT_DEVICE_CALLBACK = 'https://auth.openai.com/deviceauth/callback';
const CONNECTOR_READINESS_BY_PROVIDER = {
  chatgpt: { readiness: 'operational', label: 'Operational', description: 'Device auth is wired and usable today.' },
  google: { readiness: 'operational', label: 'Operational', description: 'OAuth, health checks, and runtime adapters are wired.' },
  github: { readiness: 'operational', label: 'Operational', description: 'OAuth is wired for workspace connection.' },
  jira: { readiness: 'operational', label: 'Operational', description: 'API-token connection and runtime actions are wired.' },
  microsoft365: { readiness: 'partial', label: 'Partial', description: 'Outlook mail, calendar, and contacts are wired. Teams, OneDrive, and SharePoint are not.' },
  social_media: { readiness: 'partial', label: 'Partial', description: 'Publishing and account sync are wired. Full analytics and engagement workflows are not.' },
  slack: { readiness: 'coming_soon', label: 'Coming soon', description: 'Catalog only. No runtime connector is wired yet.' },
  telegram: { readiness: 'coming_soon', label: 'Coming soon', description: 'Catalog only. No runtime connector is wired yet.' },
  discord: { readiness: 'coming_soon', label: 'Coming soon', description: 'Catalog only. No runtime connector is wired yet.' },
  notion: { readiness: 'coming_soon', label: 'Coming soon', description: 'Catalog only. No runtime connector is wired yet.' },
  linear: { readiness: 'coming_soon', label: 'Coming soon', description: 'Catalog only. No runtime connector is wired yet.' },
  n8n: { readiness: 'coming_soon', label: 'Coming soon', description: 'Workflow list and trigger routes are still stubs.' },
};
const CONNECTOR_ACCESS_MODEL_BY_PROVIDER = {
  google: {
    access_model: 'local-first',
    label: 'Local-first',
    description: 'Nexus Local can cover part of the mail, calendar, and document path on the customer workstation.',
  },
  microsoft365: {
    access_model: 'local-first',
    label: 'Local-first',
    description: 'Nexus Local can cover part of the Outlook, calendar, and contacts path on the customer workstation.',
  },
};
const CONNECTOR_SCOPE_VALIDATION_RULES = {
  google: {
    calendar: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    gmail: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    contacts: [
      'https://www.googleapis.com/auth/contacts.readonly',
    ],
  },
  microsoft365: {
    mail: ['Mail.Read'],
    calendar: ['Calendars.Read'],
    contacts: ['Contacts.Read'],
  },
};
const CONNECTOR_CAPABILITIES_BY_PROVIDER = {
  chatgpt: [
    { key: 'responses_api', label: 'Codex responses runtime', description: 'Use the connected ChatGPT identity through the Codex provider path.' },
    { key: 'provider_refresh', label: 'OAuth token refresh', description: 'Keep the workspace provider token refreshed when Codex is invoked.' },
  ],
  google: [
    { key: 'gmail', label: 'Gmail mailbox access', description: 'Read, search, and act on Gmail content through Google APIs.', validationKey: 'gmail' },
    { key: 'calendar', label: 'Google Calendar access', description: 'Read and create calendar events when the required scopes remain valid.', validationKey: 'calendar' },
    { key: 'drive', label: 'Google Drive access', description: 'Use Drive files through the workspace connector. This page does not run a dedicated Drive probe yet.' },
    { key: 'contacts', label: 'Google contacts access', description: 'Read Google contacts for workspace-assisted actions.', validationKey: 'contacts' },
    { key: 'desktop_fallback', label: 'Desktop fallback via Nexus Local', description: 'If Nexus Local is deployed, part of the file, mail, and calendar path can stay on the customer machine.', status: 'local_fallback' },
  ],
  github: [
    { key: 'repos', label: 'Repository context', description: 'Read repositories and pull request context through GitHub OAuth.' },
    { key: 'issues', label: 'Issue workflows', description: 'Use the workspace GitHub identity for issue and development workflows.' },
  ],
  jira: [
    { key: 'projects', label: 'Project visibility', description: 'Project listing is validated during Jira API token connection.', validatedWhenConnected: true },
    { key: 'issues', label: 'Issue workflows', description: 'Search, create, and comment on Jira issues through the saved API token.', validatedWhenConnected: true },
    { key: 'transitions', label: 'Workflow transitions', description: 'Use Jira transition endpoints for ticket progression.', validatedWhenConnected: true },
  ],
  microsoft365: [
    { key: 'mail', label: 'Outlook mail access', description: 'Read mailbox content through Microsoft Graph.', validationKey: 'mail' },
    { key: 'calendar', label: 'Calendar access', description: 'Read calendar events through Microsoft Graph.', validationKey: 'calendar' },
    { key: 'contacts', label: 'Contacts access', description: 'Read personal contacts through Microsoft Graph.', validationKey: 'contacts' },
    { key: 'desktop_fallback', label: 'Desktop fallback via Nexus Local', description: 'If Nexus Local is deployed, part of the Outlook, calendar, and contacts path can stay on the customer machine.', status: 'local_fallback' },
    { key: 'teams', label: 'Teams', description: 'Teams runtime is not wired yet.', status: 'unsupported' },
    { key: 'onedrive', label: 'OneDrive', description: 'OneDrive runtime is not wired yet.', status: 'unsupported' },
    { key: 'sharepoint', label: 'SharePoint', description: 'SharePoint runtime is not wired yet.', status: 'unsupported' },
  ],
  social_media: [
    { key: 'publishing', label: 'Publishing', description: 'Publishing and account sync are wired through the Post for Me path.' },
    { key: 'analytics', label: 'Analytics', description: 'Detailed analytics and engagement workflows are not wired yet.', status: 'unsupported' },
  ],
};
const CONNECTOR_AGENT_CAPABILITY_MAP = {
  google: ['email', 'calendar', 'drive'],
  jira: ['tasks'],
  microsoft365: ['email', 'calendar'],
  social_media: ['social'],
};

// In-memory store for pending device auth sessions: workspaceId → { device_auth_id, user_code, interval, expires_at }
const deviceAuthSessions = new Map();

// OAuth scopes for workspace integrations (broader than login scopes)
const GOOGLE_INTEGRATION_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts.readonly',
].join(' ');

const GITHUB_INTEGRATION_SCOPES = 'repo read:user';
const MICROSOFT_INTEGRATION_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Calendars.Read',
  'Contacts.Read',
].join(' ');

// Simple HTTPS request helper (mirrors auth.js pattern)
function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve(res.headers['content-type']?.includes('application/json') ? JSON.parse(data) : data);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// PKCE helpers for ChatGPT OAuth
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// In-memory state store for CSRF protection (keyed by state param)
// In production this should be Redis or DB-backed
const oauthStateStore = new Map();
const DEDICATED_GET_CALLBACK_PROVIDERS = ['google', 'github', 'microsoft365'];

let initPromise = null;

const INTERNAL_CATALOG = [
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Team messaging and channel automations (catalog only, connector not yet wired)',
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
    actions: ['send_email', 'list_files', 'create_event', 'list_events', 'read_email', 'search_drive'],
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
    description: 'Pages, databases, and knowledge base sync (catalog only, connector not yet wired)',
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
    description: 'Issue tracking, cycles, and product roadmaps (catalog only, connector not yet wired)',
    icon: '🟣',
    category: 'project-management',
    actions: ['list_issues', 'create_issue'],
    scopes: ['read', 'write'],
  },
  {
    provider: 'n8n',
    name: 'n8n',
    description: 'Workflow automation and custom integrations (workflow endpoints are still stubs)',
    icon: '⚡',
    category: 'automation',
    actions: ['trigger_workflow', 'list_workflows'],
    scopes: ['workflow:read', 'workflow:execute'],
  },
  {
    provider: 'microsoft365',
    name: 'Microsoft 365',
    description: 'Outlook mail, calendar, and contacts via Microsoft Graph. Teams, OneDrive, and SharePoint stay disabled until their dedicated runtime ships.',
    icon: '🟦',
    category: 'productivity',
    actions: ['read_mail', 'list_events', 'list_contacts'],
    scopes: ['mail.read', 'calendars.read'],
  },
  {
    provider: 'social_media',
    name: 'Social Media',
    description: 'Post to LinkedIn, X, Instagram, TikTok, and more via Post for Me (publishing wired, analytics still partial)',
    icon: '📱',
    category: 'marketing',
    actions: ['post_content', 'schedule_post', 'list_accounts'],
    scopes: [],
  },
  {
    provider: 'chatgpt',
    name: 'ChatGPT',
    description: 'Use your ChatGPT subscription to power agents with GPT-5.4, o3, and Codex models',
    icon: '🤖',
    category: 'ai',
    actions: ['llm_chat', 'code_generation'],
    scopes: ['model.request.all'],
  },
];

const INTEGRATIONS_CATALOG_COLUMNS = [
  'provider',
  'name',
  'description',
  'icon',
  'category',
  'source',
  'actions',
  'default_scopes',
  'is_enabled',
  'updated_at',
];

const WORKSPACE_INTEGRATIONS_COLUMNS = [
  'access_token',
  'refresh_token',
  'token_expires_at',
  'metadata',
];

async function ensureReady() {
  if (!initPromise) {
    initPromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(pool, SCHEMA, 'integrations_catalog', {
          label: 'Integrations catalog table',
        });
        await assertColumnsExist(pool, SCHEMA, 'integrations_catalog', INTEGRATIONS_CATALOG_COLUMNS, {
          label: 'Integrations catalog table',
        });
        await assertTableExists(pool, SCHEMA, 'workspace_integrations', {
          label: 'Workspace integrations table',
        });
        await assertColumnsExist(pool, SCHEMA, 'workspace_integrations', WORKSPACE_INTEGRATIONS_COLUMNS, {
          label: 'Workspace integrations table',
        });
        await assertTableExists(pool, SCHEMA, 'workspace_integration_logs', {
          label: 'Workspace integration logs table',
        });
        await assertTableExists(pool, SCHEMA, 'workspace_integration_agents', {
          label: 'Workspace integration agent access table',
        });
      } else {
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
                access_token TEXT,
                refresh_token TEXT,
                token_expires_at TIMESTAMPTZ,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
                credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
                metadata JSONB DEFAULT '{}'::jsonb,
                connected_at TIMESTAMPTZ,
                disconnected_at TIMESTAMPTZ,
                connected_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(workspace_id, provider)
              );
            `);
          } else {
            await pool.query(`
              ALTER TABLE ${SCHEMA}.workspace_integrations
                ADD COLUMN IF NOT EXISTS access_token TEXT,
                ADD COLUMN IF NOT EXISTS refresh_token TEXT,
                ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
            `).catch(() => {});
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

async function runWorkspaceIntegrationHealthCheck({ workspaceId, provider }) {
  try {
    if (provider === 'google') {
      return await googleApi.probeGoogleIntegration(workspaceId);
    }

    if (provider === 'microsoft365') {
      return await microsoftGraphApi.probeMicrosoftIntegration(workspaceId);
    }

    return {
      provider,
      status: 'connected',
      summary: `No post-connect health checks configured for ${provider}`,
      checks: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown integration health check error');
    return {
      provider,
      status: 'failed',
      summary: `${provider} health check failed`,
      checks: [
        {
          key: 'runtime',
          label: 'Health check runtime',
          status: 'error',
          code: 'runtime_error',
          error: message,
        },
      ],
    };
  }
}

async function persistWorkspaceIntegrationHealth({ workspaceId, provider, health }) {
  const checkedAt = new Date().toISOString();
  const connected = health.status !== 'failed';
  const metadata = {
    health: {
      ...health,
      checked_at: checkedAt,
    },
  };

  await pool.query(
    `UPDATE ${SCHEMA}.workspace_integrations
        SET connected = $3,
            status = $4,
            metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
            disconnected_at = CASE WHEN $3 THEN NULL ELSE NOW() END,
            updated_at = NOW()
      WHERE workspace_id = $1
        AND provider = $2`,
    [workspaceId, provider, connected, health.status, JSON.stringify(metadata)]
  );

  return {
    ...health,
    checked_at: checkedAt,
    connected,
  };
}

async function finalizeWorkspaceIntegrationHealth({ workspaceId, provider }) {
  const startedAt = Date.now();
  const health = await runWorkspaceIntegrationHealthCheck({ workspaceId, provider });
  const persisted = await persistWorkspaceIntegrationHealth({ workspaceId, provider, health });
  await addLog({
    workspaceId,
    provider,
    action: 'health_check',
    status: persisted.status === 'connected' ? 'success' : persisted.status,
    durationMs: Date.now() - startedAt,
    payload: { health: persisted },
    errorMessage: persisted.status === 'connected' ? null : persisted.summary,
  });
  return persisted;
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
      constReadiness: getConnectorReadiness(row.provider),
      row,
    })).map(({ row, constReadiness }) => ({
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
      readiness: constReadiness.readiness,
      readiness_label: constReadiness.label,
      readiness_description: constReadiness.description,
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
      constReadiness: getConnectorReadiness(row.provider),
      row,
    })).map(({ row, constReadiness }) => ({
      provider: row.provider,
      id: row.provider,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category,
      source: row.source,
      actions: row.actions || [],
      readiness: constReadiness.readiness,
      readiness_label: constReadiness.label,
      readiness_description: constReadiness.description,
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

// ─── Real OAuth Flows ─────────────────────────────────────────────────────────

// GET /api/v1/integrations/google/connect — initiate Google OAuth
router.get('/google/connect', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ success: false, error: 'Google OAuth not configured (GOOGLE_CLIENT_ID missing)' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
  // Store state → workspaceId mapping for callback verification
  oauthStateStore.set(state, { workspaceId, provider: 'google', createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_INTEGRATION_REDIRECT,
    response_type: 'code',
    scope: GOOGLE_INTEGRATION_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  res.json({ success: true, authUrl, provider: 'google' });
});

// GET /api/v1/integrations/google/callback — exchange code, store tokens
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[INTEGRATIONS] Google OAuth error:', error);
    return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_cancelled&provider=google`);
  }

  if (!code || !state || !oauthStateStore.has(state)) {
    return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_invalid&provider=google`);
  }

  const stateData = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  const workspaceId = stateData.workspaceId;

  try {
    const postBody = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_INTEGRATION_REDIRECT,
      grant_type: 'authorization_code',
    }).toString();

    const tokenResp = await httpsPost({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    }, postBody);

    if (!tokenResp.access_token) {
      console.error('[INTEGRATIONS] Google token exchange failed:', tokenResp);
      return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_token_failed&provider=google`);
    }

    const expiresAt = tokenResp.expires_in
      ? new Date(Date.now() + tokenResp.expires_in * 1000).toISOString()
      : null;

    await ensureReady();
    await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_integrations
        (workspace_id, provider, source, connected, status, access_token, refresh_token, token_expires_at,
         scopes, connected_at, disconnected_at, connected_by, updated_at)
       VALUES ($1, 'google', 'oauth', TRUE, 'connected', $2, $3, $4,
         $5::jsonb, NOW(), NULL, $6, NOW())
       ON CONFLICT (workspace_id, provider) DO UPDATE SET
         source = 'oauth',
         connected = TRUE,
         status = 'connected',
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, ${SCHEMA}.workspace_integrations.refresh_token),
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         connected_at = NOW(),
         disconnected_at = NULL,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()`,
      [
        workspaceId,
        tokenResp.access_token,
        tokenResp.refresh_token || null,
        expiresAt,
        JSON.stringify(GOOGLE_INTEGRATION_SCOPES.split(' ')),
        req.user?.email || 'oauth',
      ]
    );

    const health = await finalizeWorkspaceIntegrationHealth({ workspaceId, provider: 'google' });
    await addLog({
      workspaceId,
      provider: 'google',
      action: 'oauth_connect',
      status: health.status === 'connected' ? 'success' : health.status,
      payload: { health },
      errorMessage: health.status === 'connected' ? null : health.summary,
    });
    console.log(`[INTEGRATIONS] Google connected for workspace ${workspaceId} (${health.status})`);
    if (health.status === 'failed') {
      return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_token_failed&provider=google`);
    }
    res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?connected=google${health.status === 'degraded' ? '&status=degraded' : ''}`);
  } catch (err) {
    console.error('[INTEGRATIONS] Google callback error:', err.message);
    res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_server_error&provider=google`);
  }
});

// GET /api/v1/integrations/github/connect — initiate GitHub OAuth
router.get('/github/connect', (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ success: false, error: 'GitHub OAuth not configured (GITHUB_CLIENT_ID missing)' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
  oauthStateStore.set(state, { workspaceId, provider: 'github', createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_INTEGRATION_REDIRECT,
    scope: GITHUB_INTEGRATION_SCOPES,
    state,
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params}`;
  res.json({ success: true, authUrl, provider: 'github' });
});

// GET /api/v1/integrations/github/callback — exchange code, store tokens
router.get('/github/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[INTEGRATIONS] GitHub OAuth error:', error);
    return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_cancelled&provider=github`);
  }

  if (!code || !state || !oauthStateStore.has(state)) {
    return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_invalid&provider=github`);
  }

  const stateData = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  const workspaceId = stateData.workspaceId;

  try {
    const postBody = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: GITHUB_INTEGRATION_REDIRECT,
    }).toString();

    const tokenResp = await httpsPost({
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'Vutler-App',
      },
    }, postBody);

    if (!tokenResp.access_token) {
      console.error('[INTEGRATIONS] GitHub token exchange failed:', tokenResp);
      return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_token_failed&provider=github`);
    }

    await ensureReady();
    await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_integrations
        (workspace_id, provider, source, connected, status, access_token, refresh_token,
         scopes, connected_at, disconnected_at, connected_by, updated_at)
       VALUES ($1, 'github', 'oauth', TRUE, 'connected', $2, NULL,
         $3::jsonb, NOW(), NULL, $4, NOW())
       ON CONFLICT (workspace_id, provider) DO UPDATE SET
         source = 'oauth',
         connected = TRUE,
         status = 'connected',
         access_token = EXCLUDED.access_token,
         scopes = EXCLUDED.scopes,
         connected_at = NOW(),
         disconnected_at = NULL,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()`,
      [
        workspaceId,
        tokenResp.access_token,
        JSON.stringify(GITHUB_INTEGRATION_SCOPES.split(' ')),
        req.user?.email || 'oauth',
      ]
    );

    await addLog({ workspaceId, provider: 'github', action: 'oauth_connect' });
    console.log(`[INTEGRATIONS] GitHub connected for workspace ${workspaceId}`);
    res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?connected=github`);
  } catch (err) {
    console.error('[INTEGRATIONS] GitHub callback error:', err.message);
    res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_server_error&provider=github`);
  }
});

// GET /api/v1/integrations/microsoft365/connect — initiate Microsoft OAuth
router.get('/microsoft365/connect', (req, res) => {
  if (!MICROSOFT_CLIENT_ID) {
    return res.status(500).json({ success: false, error: 'Microsoft OAuth not configured (MICROSOFT_CLIENT_ID missing)' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const workspaceId = req.workspaceId || DEFAULT_WORKSPACE;
  oauthStateStore.set(state, { workspaceId, provider: 'microsoft365', createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    redirect_uri: MICROSOFT_INTEGRATION_REDIRECT,
    response_type: 'code',
    response_mode: 'query',
    scope: MICROSOFT_INTEGRATION_SCOPES,
    state,
    prompt: 'select_account',
  });

  const authUrl = `https://login.microsoftonline.com/${encodeURIComponent(MICROSOFT_TENANT_ID)}/oauth2/v2.0/authorize?${params.toString()}`;
  res.json({ success: true, authUrl, provider: 'microsoft365' });
});

// GET /api/v1/integrations/microsoft365/callback — exchange code, store tokens
router.get('/microsoft365/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[INTEGRATIONS] Microsoft OAuth error:', error);
    return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_cancelled&provider=microsoft365`);
  }

  if (!code || !state || !oauthStateStore.has(state)) {
    return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_invalid&provider=microsoft365`);
  }

  const stateData = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  const workspaceId = stateData.workspaceId;

  try {
    const postBody = new URLSearchParams({
      code,
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET || '',
      redirect_uri: MICROSOFT_INTEGRATION_REDIRECT,
      grant_type: 'authorization_code',
      scope: MICROSOFT_INTEGRATION_SCOPES,
    }).toString();

    const tokenResp = await httpsPost({
      hostname: 'login.microsoftonline.com',
      path: `/${encodeURIComponent(MICROSOFT_TENANT_ID)}/oauth2/v2.0/token`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    }, postBody);

    if (!tokenResp.access_token) {
      console.error('[INTEGRATIONS] Microsoft token exchange failed:', tokenResp);
      return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_token_failed&provider=microsoft365`);
    }

    const expiresAt = tokenResp.expires_in
      ? new Date(Date.now() + tokenResp.expires_in * 1000).toISOString()
      : null;

    await ensureReady();
    await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_integrations
        (workspace_id, provider, source, connected, status, access_token, refresh_token, token_expires_at,
         scopes, credentials, connected_at, disconnected_at, connected_by, updated_at)
       VALUES ($1, 'microsoft365', 'oauth', TRUE, 'connected', $2, $3, $4,
         $5::jsonb, $6::jsonb, NOW(), NULL, $7, NOW())
       ON CONFLICT (workspace_id, provider) DO UPDATE SET
         source = 'oauth',
         connected = TRUE,
         status = 'connected',
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, ${SCHEMA}.workspace_integrations.refresh_token),
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         credentials = COALESCE(${SCHEMA}.workspace_integrations.credentials, '{}'::jsonb) || EXCLUDED.credentials,
         connected_at = NOW(),
         disconnected_at = NULL,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()`,
      [
        workspaceId,
        tokenResp.access_token,
        tokenResp.refresh_token || null,
        expiresAt,
        JSON.stringify(MICROSOFT_INTEGRATION_SCOPES.split(' ')),
        JSON.stringify({
          tenant_id: MICROSOFT_TENANT_ID,
          client_id: MICROSOFT_CLIENT_ID,
        }),
        req.user?.email || 'oauth',
      ]
    );

    const health = await finalizeWorkspaceIntegrationHealth({ workspaceId, provider: 'microsoft365' });
    await addLog({
      workspaceId,
      provider: 'microsoft365',
      action: 'oauth_connect',
      status: health.status === 'connected' ? 'success' : health.status,
      payload: { health },
      errorMessage: health.status === 'connected' ? null : health.summary,
    });
    console.log(`[INTEGRATIONS] Microsoft 365 connected for workspace ${workspaceId} (${health.status})`);
    if (health.status === 'failed') {
      return res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_token_failed&provider=microsoft365`);
    }
    res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?connected=microsoft365${health.status === 'degraded' ? '&status=degraded' : ''}`);
  } catch (err) {
    console.error('[INTEGRATIONS] Microsoft callback error:', err.message);
    res.redirect(`${SETTINGS_INTEGRATIONS_PATH}?error=oauth_server_error&provider=microsoft365`);
  }
});

// ── ChatGPT Device Auth Flow ────────────────────────────────────────────────

// Helper: JSON POST to auth.openai.com
function httpsPostJson(urlStr, body) {
  const u = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Vutler/1.0',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch (_) { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// POST /api/v1/integrations/chatgpt/connect — start Device Auth flow
router.post('/chatgpt/connect', async (req, res) => {
  if (!CHATGPT_CLIENT_ID) {
    return res.status(500).json({ success: false, error: 'ChatGPT OAuth not configured (CHATGPT_CLIENT_ID missing)' });
  }

  const workspaceId = getWorkspaceId(req);

  try {
    // Step 1: Request a device code from OpenAI
    const resp = await httpsPostJson(`${CHATGPT_API_BASE}/deviceauth/usercode`, {
      client_id: CHATGPT_CLIENT_ID,
    });

    if (resp.status !== 200 || !resp.data?.user_code) {
      console.error('[INTEGRATIONS] ChatGPT device code request failed:', resp.status, resp.data);
      return res.status(502).json({ success: false, error: 'Failed to get device code from OpenAI' });
    }

    const { device_auth_id, user_code, interval } = resp.data;

    // Store the session so we can poll for it
    deviceAuthSessions.set(workspaceId, {
      device_auth_id,
      user_code,
      interval: interval || 5,
      created_at: Date.now(),
      expires_at: Date.now() + 15 * 60 * 1000, // 15 min expiry
    });

    res.json({
      success: true,
      provider: 'chatgpt',
      mode: 'device_auth',
      user_code,
      verification_url: 'https://auth.openai.com/codex/device',
      expires_in: 900,
      poll_interval: interval || 5,
    });
  } catch (err) {
    console.error('[INTEGRATIONS] ChatGPT device auth error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/chatgpt/connect — compatibility redirect (shows instructions)
router.get('/chatgpt/connect', (req, res) => {
  res.redirect('/integrations?action=device_auth&provider=chatgpt');
});

// POST /api/v1/integrations/chatgpt/poll — poll for device auth completion
router.post('/chatgpt/poll', async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  const session = deviceAuthSessions.get(workspaceId);

  if (!session) {
    // No pending session — check if already connected (previous poll succeeded)
    try {
      await ensureReady();
      const check = await pool.query(
        `SELECT connected FROM ${SCHEMA}.workspace_integrations
         WHERE workspace_id = $1 AND provider = 'chatgpt' AND connected = TRUE LIMIT 1`,
        [workspaceId]
      );
      if (check.rows[0]) {
        return res.json({ success: true, status: 'connected', message: 'ChatGPT already connected!' });
      }
    } catch (_) {}
    return res.status(404).json({ success: false, error: 'No pending device auth session. Start with POST /chatgpt/connect.' });
  }

  if (Date.now() > session.expires_at) {
    deviceAuthSessions.delete(workspaceId);
    return res.status(410).json({ success: false, error: 'Device auth session expired. Please start again.' });
  }

  try {
    // Step 2: Poll for token
    const pollResp = await httpsPostJson(`${CHATGPT_API_BASE}/deviceauth/token`, {
      device_auth_id: session.device_auth_id,
      user_code: session.user_code,
    });

    console.log(`[INTEGRATIONS] ChatGPT poll response: status=${pollResp.status} keys=${typeof pollResp.data === 'object' ? Object.keys(pollResp.data).join(',') : 'n/a'}`);

    // 403/404 = user hasn't confirmed yet
    if (pollResp.status === 403 || pollResp.status === 404) {
      return res.json({ success: true, status: 'pending', message: 'Waiting for user to confirm...' });
    }

    if (pollResp.status !== 200 || !pollResp.data) {
      return res.json({ success: true, status: 'pending', message: 'Waiting...' });
    }

    // Step 3: We got an auth response — exchange for tokens
    // Response fields: authorization_code, code_verifier, code_challenge
    const authCode = pollResp.data.authorization_code || pollResp.data.code;
    const codeVerifier = pollResp.data.code_verifier || '';

    if (!authCode) {
      // Maybe we got tokens directly
      if (pollResp.data.access_token) {
        await storeChatGPTTokens(workspaceId, pollResp.data, req.user?.email);
        deviceAuthSessions.delete(workspaceId);
        return res.json({ success: true, status: 'connected', message: 'ChatGPT connected!' });
      }
      return res.json({ success: true, status: 'pending', message: 'Waiting...' });
    }

    console.log('[INTEGRATIONS] ChatGPT device auth authorized, exchanging code for tokens...');

    // Exchange authorization_code for tokens
    const tokenUrl = new URL(CHATGPT_OAUTH_TOKEN_URL);
    const postBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CHATGPT_CLIENT_ID,
      code: authCode,
      code_verifier: codeVerifier,
      redirect_uri: CHATGPT_DEVICE_CALLBACK,
    }).toString();

    const tokenResp = await httpsPost({
      hostname: tokenUrl.hostname,
      path: tokenUrl.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    }, postBody);

    if (!tokenResp.access_token) {
      console.error('[INTEGRATIONS] ChatGPT token exchange failed:', tokenResp);
      deviceAuthSessions.delete(workspaceId);
      return res.status(502).json({ success: false, error: 'Token exchange failed' });
    }

    await storeChatGPTTokens(workspaceId, tokenResp, req.user?.email);
    deviceAuthSessions.delete(workspaceId);
    res.json({ success: true, status: 'connected', message: 'ChatGPT connected!' });
  } catch (err) {
    console.error('[INTEGRATIONS] ChatGPT poll error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Shared: store tokens + auto-provision codex provider
async function storeChatGPTTokens(workspaceId, tokenResp, userEmail) {
  const expiresAt = tokenResp.expires_in
    ? new Date(Date.now() + tokenResp.expires_in * 1000).toISOString()
    : null;

  await ensureReady();
  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_integrations
      (workspace_id, provider, source, connected, status, access_token, refresh_token, token_expires_at,
       scopes, metadata, connected_at, disconnected_at, connected_by, updated_at)
     VALUES ($1, 'chatgpt', 'oauth', TRUE, 'connected', $2, $3, $4,
       $5::jsonb, $6::jsonb, NOW(), NULL, $7, NOW())
     ON CONFLICT (workspace_id, provider) DO UPDATE SET
       source = 'oauth',
       connected = TRUE,
       status = 'connected',
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, ${SCHEMA}.workspace_integrations.refresh_token),
       token_expires_at = EXCLUDED.token_expires_at,
       scopes = EXCLUDED.scopes,
       metadata = EXCLUDED.metadata,
       connected_at = NOW(),
       disconnected_at = NULL,
       connected_by = EXCLUDED.connected_by,
       updated_at = NOW()`,
    [
      workspaceId,
      tokenResp.access_token,
      tokenResp.refresh_token || null,
      expiresAt,
      JSON.stringify(['openid', 'profile', 'email', 'offline_access']),
      JSON.stringify({ id_token: tokenResp.id_token || null }),
      userEmail || 'oauth',
    ]
  );

  // Auto-provision a "codex" LLM provider
  try {
    await pool.query(
      `INSERT INTO ${SCHEMA}.llm_providers (workspace_id, provider, api_key, base_url, is_enabled, is_default, config)
       VALUES ($1, 'codex', $2, 'https://api.openai.com/v1', TRUE, FALSE, '{"source":"chatgpt_oauth"}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [workspaceId, encryptProviderSecret('oauth:chatgpt')]
    );
  } catch (_) {}

  await addLog({ workspaceId, provider: 'chatgpt', action: 'device_auth_connect' });
  console.log(`[INTEGRATIONS] ChatGPT connected via device auth for workspace ${workspaceId}`);
}

// ── Codex model mapping by agent role ───────────────────────────────────────

const CODEX_MODEL_MAP = {
  // Reasoning-heavy roles → o3
  reasoning: 'codex/o3',
  // Coding roles → gpt-5.3-codex
  coding: 'codex/gpt-5.3-codex',
  // Premium conversational → gpt-5.4
  premium: 'codex/gpt-5.4',
  // Budget / simple tasks → gpt-5.4-mini
  budget: 'codex/gpt-5.4-mini',
};

const ROLE_TO_TIER = {
  // Reasoning tier — complex analysis, code, data, legal
  'code-review': 'reasoning', devops: 'reasoning', engineering: 'reasoning',
  'data-analysis': 'reasoning', analytics: 'reasoning', finance: 'reasoning',
  legal: 'reasoning', compliance: 'reasoning', security: 'reasoning',
  qa: 'reasoning', architecture: 'reasoning',
  // Premium tier — conversational, creative, strategic
  coordinator: 'premium', assistant: 'premium', sales: 'premium',
  marketing: 'premium', content: 'premium', product: 'premium',
  hr: 'premium', community: 'premium', recruiter: 'premium',
  // Budget tier — simple, high-volume, routine
  support: 'budget', 'customer-support': 'budget', 'customer_support': 'budget',
  operations: 'budget', admin: 'budget', automation: 'budget',
  monitoring: 'budget', helpdesk: 'budget',
};

function codexModelForRole(role) {
  const tier = ROLE_TO_TIER[String(role || '').toLowerCase()] || 'premium';
  return CODEX_MODEL_MAP[tier];
}

// POST /api/v1/integrations/chatgpt/provision-agents — switch all agents to Codex
router.post('/chatgpt/provision-agents', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);

    // Verify ChatGPT is connected
    const conn = await pool.query(
      `SELECT connected FROM ${SCHEMA}.workspace_integrations
       WHERE workspace_id = $1 AND provider = 'chatgpt' AND connected = TRUE LIMIT 1`,
      [workspaceId]
    );
    if (!conn.rows[0]) {
      return res.status(400).json({ success: false, error: 'ChatGPT not connected' });
    }

    // Get all agents for this workspace
    const agents = await pool.query(
      `SELECT id, name, role, type, provider, model FROM ${SCHEMA}.agents WHERE workspace_id = $1`,
      [workspaceId]
    );

    const updates = [];
    for (const agent of agents.rows) {
      const newModel = codexModelForRole(agent.role || agent.type);
      updates.push({
        id: agent.id,
        name: agent.name,
        old_provider: agent.provider,
        old_model: agent.model,
        new_provider: 'codex',
        new_model: newModel,
        role: agent.role || agent.type,
      });

      await pool.query(
        `UPDATE ${SCHEMA}.agents SET provider = 'codex', model = $1, updated_at = NOW()
         WHERE id = $2 AND workspace_id = $3`,
        [newModel, agent.id, workspaceId]
      );
    }

    await addLog({ workspaceId, provider: 'chatgpt', action: 'provision_agents', payload: { count: updates.length } });
    console.log(`[INTEGRATIONS] Provisioned ${updates.length} agents with Codex for workspace ${workspaceId}`);

    res.json({ success: true, provisioned: updates.length, agents: updates });
  } catch (err) {
    console.error('[INTEGRATIONS] Provision agents error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/chatgpt/provision-preview — preview what would change
router.get('/chatgpt/provision-preview', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);

    const agents = await pool.query(
      `SELECT id, name, role, type, provider, model FROM ${SCHEMA}.agents WHERE workspace_id = $1`,
      [workspaceId]
    );

    const preview = agents.rows.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role || a.type,
      current: `${a.provider || 'none'}/${a.model || 'none'}`,
      proposed: `codex/${codexModelForRole(a.role || a.type)}`,
      changed: a.provider !== 'codex',
    }));

    res.json({ success: true, agents: preview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/chatgpt/token-status — check if ChatGPT is connected
router.get('/chatgpt/token-status', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const result = await pool.query(
      `SELECT connected, status, token_expires_at, connected_at
       FROM ${SCHEMA}.workspace_integrations
       WHERE workspace_id = $1 AND provider = 'chatgpt'
       LIMIT 1`,
      [workspaceId]
    );
    const row = result.rows?.[0];
    const connected = row?.connected === true;
    const expired = row?.token_expires_at
      ? new Date(row.token_expires_at).getTime() < Date.now()
      : false;

    res.json({ success: true, connected, expired, connected_at: row?.connected_at || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Refresh a ChatGPT OAuth token (exported for use by llmRouter)
async function refreshChatGPTToken(workspaceId) {
  const result = await pool.query(
    `SELECT id, access_token, refresh_token, token_expires_at
     FROM ${SCHEMA}.workspace_integrations
     WHERE workspace_id = $1 AND provider = 'chatgpt' AND connected = TRUE
     LIMIT 1`,
    [workspaceId]
  );

  const row = result.rows?.[0];
  if (!row || !row.refresh_token) return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
  if (expiresAt && expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return null; // Still valid
  }

  const tokenUrl = new URL(CHATGPT_OAUTH_TOKEN_URL);
  const postBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CHATGPT_CLIENT_ID,
    refresh_token: row.refresh_token,
  }).toString();

  const tokenResp = await httpsPost({
    hostname: tokenUrl.hostname,
    path: tokenUrl.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  }, postBody);

  if (!tokenResp.access_token) {
    console.warn('[INTEGRATIONS] ChatGPT token refresh failed:', tokenResp);
    return null;
  }

  const newExpiresAt = tokenResp.expires_in
    ? new Date(Date.now() + tokenResp.expires_in * 1000).toISOString()
    : null;

  await pool.query(
    `UPDATE ${SCHEMA}.workspace_integrations
     SET access_token = $1,
         refresh_token = COALESCE($2, refresh_token),
         token_expires_at = $3,
         updated_at = NOW()
     WHERE workspace_id = $4 AND provider = 'chatgpt'`,
    [tokenResp.access_token, tokenResp.refresh_token || null, newExpiresAt, workspaceId]
  );

  return tokenResp.access_token;
}

// Clean up expired state entries and device auth sessions every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of oauthStateStore.entries()) {
    if (val.createdAt < cutoff) oauthStateStore.delete(key);
  }
  for (const [key, val] of deviceAuthSessions.entries()) {
    if (Date.now() > val.expires_at) deviceAuthSessions.delete(key);
  }
}, 10 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────

// ── Jira — API Token (Basic Auth) Connect/Disconnect ─────────────────────────

async function validateJiraCredentials({ baseUrl, email, apiToken }) {
  const normalizedUrl = String(baseUrl || '').replace(/\/+$/, '');

  if (!normalizedUrl || !email || !apiToken) {
    throw new Error('baseUrl, email and apiToken are required');
  }
  if (!/^https:\/\/.+/.test(normalizedUrl)) {
    throw new Error('baseUrl must start with https://');
  }

  const { JiraAdapter } = require('../services/integrations/jira');
  const adapter = new JiraAdapter(normalizedUrl, email, apiToken);
  const projects = await adapter.listProjects();
  const projectList = Array.isArray(projects) ? projects : [];

  return {
    normalizedUrl,
    projects: projectList,
    projectCount: projectList.length,
    sampleProjects: projectList.slice(0, 5).map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
    })),
  };
}

function getConnectorReadiness(provider) {
  return CONNECTOR_READINESS_BY_PROVIDER[provider] || {
    readiness: 'coming_soon',
    label: 'Coming soon',
    description: 'Connector readiness has not been classified yet.',
  };
}

function getConnectorAccessModel(provider) {
  return CONNECTOR_ACCESS_MODEL_BY_PROVIDER[provider] || {
    access_model: 'cloud-required',
    label: 'Cloud-required',
    description: 'This connector depends on the remote provider API path.',
  };
}

function getRequestedScopes(provider, defaultScopes) {
  if (provider === 'google') return GOOGLE_INTEGRATION_SCOPES.split(' ');
  if (provider === 'github') return GITHUB_INTEGRATION_SCOPES.split(' ');
  if (provider === 'microsoft365') return MICROSOFT_INTEGRATION_SCOPES.split(' ');
  return Array.isArray(defaultScopes) ? defaultScopes : [];
}

function getValidatedScopes(provider, grantedScopes, health, connected) {
  if (!connected) return [];

  if (provider === 'jira') {
    return Array.isArray(grantedScopes) ? grantedScopes : [];
  }

  const checks = Array.isArray(health?.checks) ? health.checks : [];
  const okKeys = new Set(
    checks
      .filter((check) => check && check.status === 'ok')
      .map((check) => check.key)
  );

  const rules = CONNECTOR_SCOPE_VALIDATION_RULES[provider] || {};
  const validated = new Set();
  for (const [key, scopes] of Object.entries(rules)) {
    if (okKeys.has(key)) {
      for (const scope of scopes) validated.add(scope);
    }
  }

  return Array.from(validated);
}

function buildIntegrationCapabilities(provider, health, connected) {
  const checks = Array.isArray(health?.checks) ? health.checks : [];
  const okKeys = new Set(
    checks
      .filter((check) => check && check.status === 'ok')
      .map((check) => check.key)
  );

  return (CONNECTOR_CAPABILITIES_BY_PROVIDER[provider] || []).map((capability) => {
    if (capability.status === 'unsupported' || capability.status === 'local_fallback') {
      return {
        key: capability.key,
        label: capability.label,
        status: capability.status,
        description: capability.description,
      };
    }

    let status = 'supported';
    if (connected) {
      if (capability.validatedWhenConnected) {
        status = 'validated';
      } else if (capability.validationKey && okKeys.has(capability.validationKey)) {
        status = 'validated';
      } else {
        status = 'consented';
      }
    }

    return {
      key: capability.key,
      label: capability.label,
      status,
      description: capability.description,
    };
  });
}

function buildRuntimeState({ row, readiness, health, capabilities }) {
  const workspaceAvailable = Boolean(row.connected);
  const provisioned = workspaceAvailable && (
    Boolean(row.connected_at)
    || Boolean((row.config && Object.keys(row.config).length))
    || Boolean((row.credentials && Object.keys(row.credentials).length))
    || (Array.isArray(row.scopes) && row.scopes.length > 0)
  );
  const validatedCount = capabilities.filter((capability) => capability.status === 'validated').length;
  const consentedCount = capabilities.filter((capability) => capability.status === 'consented').length;

  if (readiness.readiness === 'coming_soon') {
    return {
      workspace_available: workspaceAvailable,
      provisioned,
      effective: false,
      reason: 'This connector is still catalog-only and should not be treated as runtime-ready.',
    };
  }

  if (!workspaceAvailable) {
    return {
      workspace_available: false,
      provisioned: false,
      effective: false,
      reason: 'The workspace has not connected this connector yet.',
    };
  }

  if (!provisioned) {
    return {
      workspace_available: true,
      provisioned: false,
      effective: false,
      reason: 'The connector is visible but lacks enough saved credentials or configuration.',
    };
  }

  if (row.status === 'failed') {
    return {
      workspace_available: true,
      provisioned: true,
      effective: false,
      reason: 'The latest post-connect validation failed. Reconnect or review scopes before routing work here.',
    };
  }

  if (row.status === 'degraded') {
    return {
      workspace_available: true,
      provisioned: true,
      effective: true,
      reason: validatedCount > 0
        ? `The connector is partially effective. ${validatedCount} capability probe(s) passed, but some requested scope paths are still failing.`
        : 'The connector is partially effective, but the validated capability set is incomplete.',
    };
  }

  return {
    workspace_available: true,
    provisioned: true,
    effective: true,
    reason: validatedCount > 0
      ? `${validatedCount} capability probe(s) passed and the connector is effective for supported runtime paths.`
      : consentedCount > 0
        ? 'The connector is connected, but no dedicated post-connect capability probe is configured yet.'
        : 'The connector is connected and ready for its supported runtime path.',
  };
}

function buildProviderOverrideMap(rows = []) {
  const providersWithOverrides = new Set();
  const allowedProviders = new Set();

  for (const row of rows) {
    if (!row?.provider) continue;
    providersWithOverrides.add(row.provider);
    if (row.has_access) {
      allowedProviders.add(row.provider);
    }
  }

  return { providersWithOverrides, allowedProviders };
}

function buildAgentConnectorState({
  integration,
  relatedCapabilities = [],
  providerAllowed = true,
  hasProviderOverride = false,
  matrix,
}) {
  const capabilityStates = relatedCapabilities
    .map((key) => matrix?.capabilities?.[key])
    .filter(Boolean);

  const workspaceAvailable = Boolean(integration.connected);
  const agentAllowed = capabilityStates.length > 0
    ? capabilityStates.some((state) => state.agent_allowed) && providerAllowed
    : providerAllowed;
  const provisioned = capabilityStates.length > 0
    ? capabilityStates.some((state) => state.provisioned)
    : workspaceAvailable;
  const effective = workspaceAvailable
    && agentAllowed
    && provisioned
    && integration.readiness !== 'coming_soon'
    && integration.status !== 'failed';

  let reason = null;
  if (!workspaceAvailable) {
    reason = 'This workspace has not connected the provider yet.';
  } else if (hasProviderOverride && !providerAllowed) {
    reason = 'This provider is explicitly disabled for this agent through the legacy provider override list.';
  } else if (capabilityStates.length > 0 && !capabilityStates.some((state) => state.agent_allowed)) {
    reason = capabilityStates.find((state) => !state.agent_allowed)?.reason || 'Agent access policy blocks the related runtime capability.';
  } else if (capabilityStates.length > 0 && !capabilityStates.some((state) => state.provisioned)) {
    reason = capabilityStates.find((state) => !state.provisioned)?.reason || 'The related runtime capability is not provisioned for this agent.';
  } else if (integration.readiness === 'coming_soon') {
    reason = integration.readiness_description;
  } else if (integration.status === 'failed') {
    reason = 'The latest validation for this connector failed.';
  } else if (integration.status === 'degraded') {
    reason = 'The connector is available, but only a subset of its runtime paths validated successfully.';
  } else if (capabilityStates.length > 0) {
    const effectiveCapabilities = relatedCapabilities.filter((key) => matrix?.capabilities?.[key]?.effective);
    reason = effectiveCapabilities.length > 0
      ? `Effective through ${effectiveCapabilities.join(', ')}.`
      : 'The connector is connected, but no linked runtime capability is effective yet.';
  } else {
    reason = 'No dedicated agent capability gate is modeled for this connector yet; treat it as a workspace-scoped tool path.';
  }

  return {
    workspace_available: workspaceAvailable,
    agent_allowed: agentAllowed,
    provisioned,
    effective,
    reason,
    scope: relatedCapabilities.length > 0 ? { capabilities: relatedCapabilities } : null,
  };
}

async function persistJiraIntegrationConnection({
  workspaceId,
  normalizedUrl,
  email,
  apiToken,
  connectedBy,
}) {
  const { CryptoService } = require('../services/crypto');
  const cryptoSvc = new CryptoService();
  const encryptedToken = cryptoSvc.encrypt(apiToken);

  const credentials = {
    baseUrl: normalizedUrl,
    email,
    apiToken: encryptedToken,
  };

  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_integrations
      (workspace_id, provider, source, connected, status, credentials, scopes,
       connected_at, disconnected_at, connected_by, updated_at)
     VALUES ($1, 'jira', 'apitoken', TRUE, 'connected', $2::jsonb,
       '["read:jira-user","read:jira-work","write:jira-work"]'::jsonb,
       NOW(), NULL, $3, NOW())
     ON CONFLICT (workspace_id, provider) DO UPDATE SET
       source = 'apitoken',
       connected = TRUE,
       status = 'connected',
       credentials = EXCLUDED.credentials,
       scopes = EXCLUDED.scopes,
       connected_at = NOW(),
       disconnected_at = NULL,
       connected_by = EXCLUDED.connected_by,
       updated_at = NOW()`,
    [
      workspaceId,
      JSON.stringify(credentials),
      connectedBy,
    ]
  );
}

function buildIntegrationDetailPayload(row) {
  const readiness = getConnectorReadiness(row?.provider);
  const accessModel = getConnectorAccessModel(row?.provider);
  const config = row?.config && typeof row.config === 'object' ? { ...row.config } : {};
  const credentials = row?.credentials && typeof row.credentials === 'object' ? row.credentials : {};
  const health = row?.metadata && typeof row.metadata === 'object' && row.metadata.health
    ? row.metadata.health
    : null;
  const requestedScopes = getRequestedScopes(row?.provider, row?.default_scopes);
  const grantedScopes = Array.isArray(row?.scopes) ? row.scopes : [];
  const validatedScopes = getValidatedScopes(row?.provider, grantedScopes, health, row?.connected);
  const capabilities = buildIntegrationCapabilities(row?.provider, health, row?.connected);
  const unsupportedCapabilities = capabilities.filter((capability) => capability.status === 'unsupported');
  const runtimeState = buildRuntimeState({
    row,
    readiness,
    health,
    capabilities,
  });
  const missingScopes = requestedScopes.filter((scope) => !grantedScopes.includes(scope));

  if (row?.provider === 'jira') {
    if (typeof credentials.baseUrl === 'string' && credentials.baseUrl) {
      config.baseUrl = credentials.baseUrl;
    }
    if (typeof credentials.email === 'string' && credentials.email) {
      config.email = credentials.email;
    }
    config.connectMode = 'api_token';
  }

  return {
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
    config,
    readiness: readiness.readiness,
    readiness_label: readiness.label,
    readiness_description: readiness.description,
    access_model: accessModel.access_model,
    access_model_label: accessModel.label,
    access_model_description: accessModel.description,
    runtime_state: runtimeState,
    consent: {
      requested_scopes: requestedScopes,
      granted_scopes: grantedScopes,
      validated_scopes: validatedScopes,
      missing_scopes: missingScopes,
    },
    capabilities,
    unsupported_capabilities: unsupportedCapabilities,
    health,
    usage: { api_calls_today: 0, rate_limit_remaining: 1000 },
    webhook_url: `/api/v1/webhooks/${row.provider}`,
  };
}

// POST /api/v1/integrations/jira/connect
// Body: { baseUrl, email, apiToken }
router.post('/jira/connect', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { baseUrl, email, apiToken, validateOnly } = req.body || {};

    if (!baseUrl || !email || !apiToken) {
      return res.status(400).json({ success: false, error: 'baseUrl, email and apiToken are required' });
    }
    try {
      const validation = await validateJiraCredentials({ baseUrl, email, apiToken });

      if (validateOnly) {
        return res.json({
          success: true,
          provider: 'jira',
          validated: true,
          baseUrl: validation.normalizedUrl,
          email,
          projectCount: validation.projectCount,
          sampleProjects: validation.sampleProjects,
        });
      }

      const normalizedUrl = validation.normalizedUrl;
      const projects = validation.projects;

      await persistJiraIntegrationConnection({
        workspaceId,
        normalizedUrl,
        email,
        apiToken,
        connectedBy: req.user?.email || req.user?.name || req.userId || 'system',
      });

      await addLog({ workspaceId, provider: 'jira', action: 'apitoken_connect' });
      console.log(`[INTEGRATIONS] Jira connected for workspace ${workspaceId}`);

      return res.json({
        success: true,
        provider: 'jira',
        status: 'connected',
        baseUrl: normalizedUrl,
        email,
        projectCount: Array.isArray(projects) ? projects.length : undefined,
        sampleProjects: validation.sampleProjects,
      });
    } catch (connErr) {
      console.error('[INTEGRATIONS] Jira connection test failed:', connErr.message);
      return res.status(400).json({ success: false, error: `Connection test failed: ${connErr.message}` });
    }
  } catch (err) {
    console.error('[INTEGRATIONS] Jira connect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/integrations/jira/disconnect
router.delete('/jira/disconnect', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);

    await pool.query(
      `UPDATE ${SCHEMA}.workspace_integrations
       SET connected = FALSE,
           status = 'disconnected',
           credentials = '{}'::jsonb,
           disconnected_at = NOW(),
           updated_at = NOW()
       WHERE workspace_id = $1 AND provider = 'jira'`,
      [workspaceId]
    );

    await addLog({ workspaceId, provider: 'jira', action: 'disconnect' });
    console.log(`[INTEGRATIONS] Jira disconnected for workspace ${workspaceId}`);

    res.json({ success: true, provider: 'jira', status: 'disconnected' });
  } catch (err) {
    console.error('[INTEGRATIONS] Jira disconnect error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

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

// GET /api/v1/integrations/agent/:agentId/readiness
router.get('/agent/:agentId/readiness', async (req, res) => {
  try {
    await ensureReady();
    const workspaceId = getWorkspaceId(req);
    const { agentId } = req.params;

    const agentResult = await pool.query(
      `SELECT id, name, type, capabilities, config
       FROM ${SCHEMA}.agents
       WHERE workspace_id = $1 AND id = $2::uuid
       LIMIT 1`,
      [workspaceId, agentId]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const matrix = await resolveAgentCapabilityMatrix({
      workspaceId,
      agent: agentResult.rows[0],
      db: pool,
    });

    const integrationsResult = await pool.query(
      `SELECT
        c.provider,
        c.name,
        c.description,
        c.icon,
        COALESCE(wi.connected, FALSE) AS connected,
        COALESCE(wi.status, 'disconnected') AS status,
        wi.connected_at
      FROM ${SCHEMA}.integrations_catalog c
      LEFT JOIN ${SCHEMA}.workspace_integrations wi
        ON wi.provider = c.provider AND wi.workspace_id = $1
      WHERE c.is_enabled = TRUE
        AND c.source = 'internal'
      ORDER BY c.name ASC`,
      [workspaceId]
    );

    const overridesResult = await pool.query(
      `SELECT provider, has_access
       FROM ${SCHEMA}.workspace_integration_agents
       WHERE workspace_id = $1
         AND agent_id = $2::uuid`,
      [workspaceId, agentId]
    );
    const { providersWithOverrides, allowedProviders } = buildProviderOverrideMap(overridesResult.rows);

    const connectors = integrationsResult.rows.map((row) => {
      const readiness = getConnectorReadiness(row.provider);
      const accessModel = getConnectorAccessModel(row.provider);
      const relatedCapabilities = CONNECTOR_AGENT_CAPABILITY_MAP[row.provider] || [];
      const providerAllowed = providersWithOverrides.has(row.provider)
        ? allowedProviders.has(row.provider)
        : true;

      return {
        provider: row.provider,
        name: row.name,
        icon: row.icon,
        description: row.description,
        connected: row.connected,
        status: row.status,
        connected_at: row.connected_at,
        readiness: readiness.readiness,
        readiness_label: readiness.label,
        readiness_description: readiness.description,
        access_model: accessModel.access_model,
        access_model_label: accessModel.label,
        access_model_description: accessModel.description,
        related_capabilities: relatedCapabilities,
        state: buildAgentConnectorState({
          integration: {
            connected: row.connected,
            status: row.status,
            readiness: readiness.readiness,
            readiness_description: readiness.description,
          },
          relatedCapabilities,
          providerAllowed,
          hasProviderOverride: providersWithOverrides.has(row.provider),
          matrix,
        }),
      };
    });

    res.json({
      success: true,
      data: {
        agent_id: agentId,
        connectors,
      },
    });
  } catch (err) {
    console.error('[INTEGRATIONS] Agent readiness error:', err.message);
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
        c.actions,
        c.default_scopes,
        COALESCE(wi.connected, FALSE) AS connected,
        COALESCE(wi.status, 'disconnected') AS status,
        COALESCE(wi.scopes, c.default_scopes, '[]'::jsonb) AS scopes,
        COALESCE(wi.credentials, '{}'::jsonb) AS credentials,
        COALESCE(wi.config, '{}'::jsonb) AS config,
        COALESCE(wi.metadata, '{}'::jsonb) AS metadata,
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
      integration: buildIntegrationDetailPayload(row),
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

// POST /api/v1/integrations/:provider/callback (fallback for other providers)
router.post('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  // OAuth workspace providers use dedicated GET callback routes; chatgpt uses device auth (no callback)
  if (DEDICATED_GET_CALLBACK_PROVIDERS.includes(provider) || provider === 'chatgpt') {
    return res.status(405).json({ success: false, error: `Use GET /api/v1/integrations/${provider}/callback` });
  }
  return res.status(409).json({
    success: false,
    error: `OAuth callback for ${provider} is not yet supported`,
    code: 'NOT_SUPPORTED',
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

// ─── Google Data Proxy Endpoints ────────────────────────────────────────────

// GET /api/v1/integrations/google/calendar/events
router.get('/google/calendar/events', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { timeMin, timeMax, maxResults } = req.query;
    const events = await googleApi.listCalendarEvents(workspaceId, {
      timeMin: timeMin || new Date().toISOString(),
      timeMax,
      maxResults: maxResults ? parseInt(maxResults, 10) : 50,
    });
    res.json({ success: true, events });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/google/drive/files
router.get('/google/drive/files', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { q, pageSize, pageToken } = req.query;
    const result = await googleApi.listDriveFiles(workspaceId, {
      query: q,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      pageToken,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/google/gmail/messages
router.get('/google/gmail/messages', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { q, maxResults, pageToken } = req.query;
    const result = await googleApi.listGmailMessages(workspaceId, {
      query: q,
      maxResults: maxResults ? parseInt(maxResults, 10) : 20,
      pageToken,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/google/gmail/messages/:id
router.get('/google/gmail/messages/:messageId', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const msg = await googleApi.getGmailMessage(workspaceId, { messageId: req.params.messageId });
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/google/people/connections
router.get('/google/people/connections', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { pageSize, pageToken, personFields } = req.query;
    const result = await googleApi.listPeopleConnections(workspaceId, {
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
      pageToken,
      personFields,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/microsoft365/outlook/messages
router.get('/microsoft365/outlook/messages', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { search, top } = req.query;
    const result = await microsoftGraphApi.listMailMessages(workspaceId, {
      search,
      top: top ? parseInt(top, 10) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/microsoft365/calendar/events
router.get('/microsoft365/calendar/events', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { startDateTime, endDateTime, top } = req.query;
    const result = await microsoftGraphApi.listCalendarEvents(workspaceId, {
      startDateTime,
      endDateTime,
      top: top ? parseInt(top, 10) : 50,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/microsoft365/contacts
router.get('/microsoft365/contacts', async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { search, top } = req.query;
    const result = await microsoftGraphApi.listContacts(workspaceId, {
      search,
      top: top ? parseInt(top, 10) : 50,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message.includes('not connected') ? 400 : 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
router._private = {
  runWorkspaceIntegrationHealthCheck,
  persistWorkspaceIntegrationHealth,
  finalizeWorkspaceIntegrationHealth,
  validateJiraCredentials,
  persistJiraIntegrationConnection,
  buildIntegrationDetailPayload,
};
module.exports.refreshChatGPTToken = refreshChatGPTToken;
