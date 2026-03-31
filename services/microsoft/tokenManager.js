'use strict';

const https = require('https');
const pool = require('../../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const DEFAULT_TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const DEFAULT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || null;
const DEFAULT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || null;

const tokenCache = new Map();
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(res.headers['content-type']?.includes('application/json') ? JSON.parse(data) : data);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getMicrosoftIntegration(workspaceId) {
  const result = await pool.query(
    `SELECT access_token, refresh_token, token_expires_at, credentials, config
       FROM ${SCHEMA}.workspace_integrations
      WHERE workspace_id = $1
        AND provider = 'microsoft365'
        AND connected = TRUE
      LIMIT 1`,
    [workspaceId]
  );
  return result.rows[0] || null;
}

function resolveOAuthConfig(row = {}) {
  const credentials = row.credentials || {};
  const config = row.config || {};
  return {
    tenantId: credentials.tenant_id || credentials.tenantId || config.tenant_id || config.tenantId || DEFAULT_TENANT,
    clientId: credentials.client_id || credentials.clientId || config.client_id || config.clientId || DEFAULT_CLIENT_ID,
    clientSecret: credentials.client_secret || credentials.clientSecret || config.client_secret || config.clientSecret || DEFAULT_CLIENT_SECRET,
  };
}

async function getMicrosoftToken(workspaceId) {
  const cached = tokenCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return cached.accessToken;
  }

  const row = await getMicrosoftIntegration(workspaceId);
  if (!row) return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (row.access_token && expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    tokenCache.set(workspaceId, { accessToken: row.access_token, expiresAt });
    return row.access_token;
  }

  if (!row.refresh_token) return row.access_token || null;

  const oauth = resolveOAuthConfig(row);
  if (!oauth.clientId || !oauth.clientSecret) {
    throw new Error('Microsoft 365 OAuth client is not configured');
  }

  const postBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: row.refresh_token,
    scope: 'https://graph.microsoft.com/.default offline_access',
  }).toString();

  const tokenResp = await httpsPost({
    hostname: 'login.microsoftonline.com',
    path: `/${encodeURIComponent(oauth.tenantId)}/oauth2/v2.0/token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  }, postBody);

  if (!tokenResp.access_token) {
    await pool.query(
      `UPDATE ${SCHEMA}.workspace_integrations
          SET status = 'token_expired',
              updated_at = NOW()
        WHERE workspace_id = $1
          AND provider = 'microsoft365'`,
      [workspaceId]
    ).catch(() => {});
    tokenCache.delete(workspaceId);
    throw new Error(tokenResp.error_description || tokenResp.error || 'Microsoft token refresh failed');
  }

  const nextExpiresAt = tokenResp.expires_in
    ? new Date(Date.now() + tokenResp.expires_in * 1000)
    : new Date(Date.now() + 3600 * 1000);

  await pool.query(
    `UPDATE ${SCHEMA}.workspace_integrations
        SET access_token = $1,
            refresh_token = COALESCE($2, refresh_token),
            token_expires_at = $3,
            status = 'connected',
            updated_at = NOW()
      WHERE workspace_id = $4
        AND provider = 'microsoft365'`,
    [tokenResp.access_token, tokenResp.refresh_token || null, nextExpiresAt.toISOString(), workspaceId]
  );

  tokenCache.set(workspaceId, {
    accessToken: tokenResp.access_token,
    expiresAt: nextExpiresAt.getTime(),
  });
  return tokenResp.access_token;
}

async function isMicrosoftConnected(workspaceId) {
  const result = await pool.query(
    `SELECT 1
       FROM ${SCHEMA}.workspace_integrations
      WHERE workspace_id = $1
        AND provider = 'microsoft365'
        AND connected = TRUE
      LIMIT 1`,
    [workspaceId]
  );
  return result.rows.length > 0;
}

function clearTokenCache(workspaceId) {
  tokenCache.delete(workspaceId);
}

module.exports = {
  getMicrosoftToken,
  isMicrosoftConnected,
  clearTokenCache,
};
