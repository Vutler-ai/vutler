'use strict';

const { fetchWithTimeout } = require('./fetchWithTimeout');

const DEFAULT_POSTFORME_API_URL = 'https://api.postforme.dev/v1';
const DEFAULT_POSTFORME_TIMEOUT_MS = 8000;

function normalizePostForMeBaseUrl(rawUrl) {
  const candidate = String(rawUrl || '').trim();
  if (!candidate) return DEFAULT_POSTFORME_API_URL;

  try {
    const url = new URL(candidate);
    if (url.hostname === 'app.postforme.dev') {
      url.hostname = 'api.postforme.dev';
    }
    if (url.hostname === 'api.postforme.dev' && (url.pathname === '/api/v1' || url.pathname === '/api/v1/')) {
      url.pathname = '/v1';
    }
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1';
    }
    return url.toString().replace(/\/$/, '');
  } catch (_) {
    return DEFAULT_POSTFORME_API_URL;
  }
}

const POSTFORME_API_URL = normalizePostForMeBaseUrl(process.env.POSTFORME_API_URL);
const POSTFORME_API_KEY = process.env.POSTFORME_API_KEY || '';
const POSTFORME_TIMEOUT_MS = Number.parseInt(process.env.POSTFORME_TIMEOUT_MS || '', 10) > 0
  ? Number.parseInt(process.env.POSTFORME_TIMEOUT_MS, 10)
  : DEFAULT_POSTFORME_TIMEOUT_MS;

function toExternalPlatform(platform) {
  const normalized = String(platform || '').trim().toLowerCase();
  if (normalized === 'twitter') return 'x';
  return normalized;
}

function toInternalPlatform(platform) {
  const normalized = String(platform || '').trim().toLowerCase();
  if (normalized === 'x') return 'twitter';
  return normalized;
}

async function postForMeFetchJson(path, options = {}) {
  const url = `${POSTFORME_API_URL}${path}`;
  let response;
  try {
    response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${POSTFORME_API_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }, POSTFORME_TIMEOUT_MS);
  } catch (err) {
    if (err && (err.code === 'ETIMEDOUT' || err.name === 'AbortError')) {
      throw new Error(`Post for Me timed out after ${POSTFORME_TIMEOUT_MS}ms`);
    }
    throw err;
  }

  const rawText = await response.text();
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  let payload = null;
  if (rawText) {
    if (isJson) {
      try {
        payload = JSON.parse(rawText);
      } catch (err) {
        throw new Error(`Post for Me returned invalid JSON (${response.status})`);
      }
    } else if (!response.ok) {
      const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 180);
      throw new Error(`Post for Me returned ${response.status} ${contentType || 'non-JSON'}: ${snippet || 'empty response'}`);
    }
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Post for Me API error: ${response.status}`;
    throw new Error(message);
  }

  if (!isJson) {
    const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(`Post for Me returned non-JSON success payload (${response.status}): ${snippet || 'empty response'}`);
  }

  return payload || {};
}

async function listSocialAccounts({ externalId, status = 'connected' } = {}) {
  const search = new URLSearchParams();
  if (externalId) search.append('external_id', externalId);
  if (status) search.append('status', status);
  const payload = await postForMeFetchJson(`/social-accounts?${search.toString()}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function createSocialAccountAuthUrl({ platform, externalId, redirectUrlOverride, permissions } = {}) {
  return postForMeFetchJson('/social-accounts/auth-url', {
    method: 'POST',
    body: JSON.stringify({
      platform: toExternalPlatform(platform),
      external_id: externalId,
      redirect_url_override: redirectUrlOverride,
      permissions,
    }),
  });
}

async function createSocialPost({ caption, socialAccounts, scheduledAt, externalId } = {}) {
  return postForMeFetchJson('/social-posts', {
    method: 'POST',
    body: JSON.stringify({
      caption,
      social_accounts: socialAccounts,
      scheduled_at: scheduledAt,
      external_id: externalId,
    }),
  });
}

async function disconnectSocialAccount(accountId) {
  return postForMeFetchJson(`/social-accounts/${accountId}/disconnect`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

module.exports = {
  POSTFORME_API_URL,
  POSTFORME_API_KEY,
  POSTFORME_TIMEOUT_MS,
  normalizePostForMeBaseUrl,
  toExternalPlatform,
  toInternalPlatform,
  postForMeFetchJson,
  listSocialAccounts,
  createSocialAccountAuthUrl,
  createSocialPost,
  disconnectSocialAccount,
};
