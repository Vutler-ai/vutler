const crypto = require('crypto');

const TOKEN_SECRET = process.env.JWT_SECRET || 'REDACTED_JWT_FALLBACK';
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a deploy token for Nexus-Local mode
 * Clones an existing cloud agent — shared Snipara memory
 */
function generateLocalToken({ agentId, agentName, workspaceId, sniparaInstanceId, permissions = {}, llmConfig = {} }) {
  const nodeId = crypto.randomUUID();
  const payload = {
    v: 1,
    mode: 'local',
    node_id: nodeId,
    workspace_id: workspaceId,
    snipara_instance_id: sniparaInstanceId || agentId,
    permissions: { shell: true, filesystem: true, env: false, network: false, llm: true, av_control: false, ...permissions },
    clone_source: { agent_id: agentId, agent_name: agentName },
    llm_config: { primary: 'cloud', fallback: null, ...llmConfig },
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY_MS
  };
  return { token: sign(payload), nodeId, expiresAt: new Date(payload.exp).toISOString() };
}

/**
 * Generate a deploy token for Nexus-Enterprise mode
 * New agent at client site — own Snipara memory namespace
 */
function generateEnterpriseToken({ name, clientName, workspaceId, role = 'general', sniparaInstanceId, filesystemRoot, allowedDirs = [], permissions = {}, shellConfig = {}, offlineConfig = {} }) {
  const nodeId = crypto.randomUUID();
  const instanceId = sniparaInstanceId || `nexus-${clientName}-${name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
      offline_config: { enabled: false, cron_tasks: [], ...offlineConfig }
    },
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY_MS
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

module.exports = { generateLocalToken, generateEnterpriseToken, validateToken };
