'use strict';

const https = require('https');
const pool = require('../../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// In-memory token cache: workspaceId → { accessToken, expiresAt }
const tokenCache = new Map();
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

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

/**
 * Get a valid Google access_token for the workspace. Auto-refreshes if expired.
 * @param {string} workspaceId
 * @returns {Promise<string|null>} access_token or null if not connected
 */
async function getGoogleToken(workspaceId) {
  // Check cache first
  const cached = tokenCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return cached.accessToken;
  }

  const result = await pool.query(
    `SELECT access_token, refresh_token, token_expires_at
     FROM ${SCHEMA}.workspace_integrations
     WHERE workspace_id = $1 AND provider = 'google' AND connected = TRUE
     LIMIT 1`,
    [workspaceId]
  );

  const row = result.rows?.[0];
  if (!row) return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;

  // Token still valid — cache and return
  if (expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    tokenCache.set(workspaceId, { accessToken: row.access_token, expiresAt });
    return row.access_token;
  }

  // Need refresh
  if (!row.refresh_token) return null;

  const postBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: row.refresh_token,
  }).toString();

  const tokenResp = await httpsPost({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  }, postBody);

  if (!tokenResp.access_token) {
    console.warn('[GOOGLE] Token refresh failed:', tokenResp);
    // Mark as expired in DB
    await pool.query(
      `UPDATE ${SCHEMA}.workspace_integrations SET status = 'token_expired', updated_at = NOW()
       WHERE workspace_id = $1 AND provider = 'google'`,
      [workspaceId]
    );
    tokenCache.delete(workspaceId);
    return null;
  }

  const newExpiresAt = tokenResp.expires_in
    ? new Date(Date.now() + tokenResp.expires_in * 1000)
    : new Date(Date.now() + 3600 * 1000); // default 1h

  await pool.query(
    `UPDATE ${SCHEMA}.workspace_integrations
     SET access_token = $1,
         refresh_token = COALESCE($2, refresh_token),
         token_expires_at = $3,
         status = 'connected',
         updated_at = NOW()
     WHERE workspace_id = $4 AND provider = 'google'`,
    [tokenResp.access_token, tokenResp.refresh_token || null, newExpiresAt.toISOString(), workspaceId]
  );

  tokenCache.set(workspaceId, { accessToken: tokenResp.access_token, expiresAt: newExpiresAt.getTime() });
  return tokenResp.access_token;
}

/**
 * Check if Google integration is connected for the workspace.
 */
async function isGoogleConnected(workspaceId) {
  const result = await pool.query(
    `SELECT 1 FROM ${SCHEMA}.workspace_integrations
     WHERE workspace_id = $1 AND provider = 'google' AND connected = TRUE LIMIT 1`,
    [workspaceId]
  );
  return result.rows.length > 0;
}

/**
 * Check if a specific agent has been granted Google access.
 */
async function agentHasGoogleAccess(workspaceId, agentId) {
  if (!agentId) return false;
  const result = await pool.query(
    `SELECT 1 FROM ${SCHEMA}.workspace_integration_agents
     WHERE workspace_id = $1 AND provider = 'google' AND agent_id = $2::uuid AND has_access = TRUE LIMIT 1`,
    [workspaceId, agentId]
  );
  return result.rows.length > 0;
}

/**
 * Clear cached token (call after disconnect).
 */
function clearTokenCache(workspaceId) {
  tokenCache.delete(workspaceId);
}

module.exports = {
  getGoogleToken,
  isGoogleConnected,
  agentHasGoogleAccess,
  clearTokenCache,
};
