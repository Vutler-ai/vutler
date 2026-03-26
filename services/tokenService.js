const crypto = require('crypto');

const TOKEN_SECRET = process.env.JWT_SECRET || 'REDACTED_JWT_FALLBACK';
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const ROLE_PATTERNS = {
  'engineering': 'code|review|debug|test|build|deploy|fix|refactor',
  'marketing': 'content|marketing|write|blog|social|seo|campaign',
  'sales': 'lead|prospect|outreach|deal|pipeline|crm',
  'legal': 'contract|legal|compliance|policy|audit',
  'support': 'ticket|support|customer|feedback|issue',
  'finance': 'invoice|payment|budget|accounting|expense',
  'security': 'security|vulnerability|threat|audit|monitor',
  'research': 'research|analyze|report|data|intelligence',
};

/**
 * Auto-generate routing rules from agent role/name.
 * Each rule maps a keyword pattern to an agent_id.
 * @param {Array<{id: string, role?: string, name?: string}>} agents
 * @returns {Array<{pattern: string, agent_id: string}>}
 */
function generateRoutingRules(agents) {
  return agents.map(a => {
    const pattern = ROLE_PATTERNS[a.role?.toLowerCase()] || a.role || a.name;
    return { pattern, agent_id: a.id };
  });
}

/**
 * Generate a deploy token for Nexus-Local mode
 * Clones an existing cloud agent — shared Snipara memory.
 *
 * @param {object} opts
 * @param {string} opts.agentId        - Primary agent UUID (backward-compat, single agent)
 * @param {string} opts.agentName      - Primary agent display name
 * @param {string} opts.workspaceId
 * @param {string} [opts.sniparaInstanceId]
 * @param {object} [opts.permissions]
 * @param {object} [opts.llmConfig]
 * @param {Array<{id:string,role?:string,name?:string}>} [opts.agents]
 *   Full agent objects for multi-agent mode. When omitted the token
 *   contains only the single agentId (backward compatible).
 */
function generateLocalToken({ agentId, agentName, workspaceId, sniparaInstanceId, permissions = {}, llmConfig = {}, agents }) {
  const nodeId = crypto.randomUUID();

  // Multi-agent support: if agents[] provided, use those; otherwise fall back
  // to single-agent behaviour so old callers still work.
  const agentList = Array.isArray(agents) && agents.length > 0 ? agents : null;
  const agentIds = agentList ? agentList.map(a => a.id) : (agentId ? [agentId] : []);
  const primaryAgent = agentIds[0] || agentId;

  const payload = {
    v: 1,
    mode: 'local',
    node_id: nodeId,
    workspace_id: workspaceId,
    snipara_instance_id: sniparaInstanceId || agentId,
    permissions: { shell: true, filesystem: true, env: false, network: false, llm: true, av_control: false, ...permissions },
    clone_source: { agent_id: agentId, agent_name: agentName },
    llm_config: { primary: 'cloud', fallback: null, ...llmConfig },
    // Multi-agent fields (omitted when not supplied to keep old tokens minimal)
    ...(agentList ? {
      agents: agentIds,
      seats: agentIds.length,
      primary_agent: primaryAgent,
      routing_rules: generateRoutingRules(agentList),
    } : {}),
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };
  return { token: sign(payload), nodeId, expiresAt: new Date(payload.exp).toISOString() };
}

/**
 * Generate a deploy token for Nexus-Enterprise mode
 * New agent at client site — own Snipara memory namespace.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.clientName
 * @param {string} opts.workspaceId
 * @param {string} [opts.role]
 * @param {string} [opts.sniparaInstanceId]
 * @param {string} [opts.filesystemRoot]
 * @param {string[]} [opts.allowedDirs]
 * @param {object} [opts.permissions]
 * @param {object} [opts.shellConfig]
 * @param {object} [opts.offlineConfig]
 * @param {number} [opts.seatsCount]             - Total seats licensed
 * @param {string} [opts.primaryAgentId]         - Coordinator/primary agent UUID
 * @param {string[]} [opts.poolAgentIds]         - Pool of agents that CAN be spawned
 * @param {Array<{pattern:string,agent_id:string}>} [opts.autoSpawnRules]
 * @param {boolean} [opts.allowCreate]           - Can create new agents on the node
 */
function generateEnterpriseToken({
  name, clientName, workspaceId, role = 'general', sniparaInstanceId,
  filesystemRoot, allowedDirs = [], permissions = {}, shellConfig = {}, offlineConfig = {},
  seatsCount, primaryAgentId, poolAgentIds, autoSpawnRules, allowCreate,
}) {
  const nodeId = crypto.randomUUID();
  const instanceId = sniparaInstanceId || `nexus-${clientName}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Build routing_rules from pool agents when primaryAgentId is known
  const poolIds = Array.isArray(poolAgentIds) ? poolAgentIds : [];
  const routingRules = Array.isArray(autoSpawnRules) ? autoSpawnRules : [];

  const payload = {
    v: 1,
    mode: 'enterprise',
    node_id: nodeId,
    workspace_id: workspaceId,
    snipara_instance_id: instanceId,
    role,
    permissions: { shell: true, filesystem: true, env: false, network: true, llm: true, av_control: true, ...permissions },
    enterprise: {
      client_name: clientName,
      filesystem_root: filesystemRoot || '/opt/' + clientName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      allowed_dirs: allowedDirs,
      shell_config: { whitelist: [], blacklist: ['rm -rf', 'dd', 'mkfs', 'shutdown'], timeout_ms: 30000, max_concurrent: 3, ...shellConfig },
      offline_config: { enabled: false, cron_tasks: [], ...offlineConfig },
    },
    // Multi-agent enterprise fields (present only when supplied)
    ...(seatsCount !== undefined ? { seats: seatsCount } : {}),
    ...(primaryAgentId ? { agents: [primaryAgentId], primary_agent: primaryAgentId } : {}),
    ...(poolIds.length ? { available_pool: poolIds } : {}),
    ...(routingRules.length ? { routing_rules: routingRules, auto_spawn_rules: routingRules } : {}),
    ...(allowCreate !== undefined ? { allow_create: !!allowCreate } : {}),
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };
  return { token: sign(payload), nodeId, expiresAt: new Date(payload.exp).toISOString() };
}

/**
 * Validate and decode a deploy token
 * Returns decoded payload or null if invalid/expired
 */
function validateToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadB64 = parts[1];
    const signatureB64 = parts[2];
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(parts[0] + '.' + payloadB64).digest('base64url');
    if (signatureB64 !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// Internal: sign payload as header.payload.signature (JWT-like)
function sign(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'NXT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(header + '.' + body).digest('base64url');
  return `${header}.${body}.${sig}`;
}

module.exports = { generateLocalToken, generateEnterpriseToken, validateToken, generateRoutingRules };
