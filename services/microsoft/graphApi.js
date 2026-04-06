'use strict';

const https = require('https');
const { getMicrosoftToken, clearTokenCache } = require('./tokenManager');

function classifyProbeError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown Microsoft probe error');
  const normalized = message.toLowerCase();

  if (
    normalized.includes('insufficient') ||
    normalized.includes('scope') ||
    normalized.includes('permission') ||
    normalized.includes('forbidden')
  ) {
    return { code: 'scope_missing', message };
  }

  if (
    normalized.includes('token') ||
    normalized.includes('unauthorized') ||
    normalized.includes('401')
  ) {
    return { code: 'auth_failed', message };
  }

  return { code: 'unavailable', message };
}

function summarizeProbeResults(provider, checks) {
  const okCount = checks.filter((check) => check.status === 'ok').length;
  const total = checks.length;
  const status = okCount === total ? 'connected' : okCount === 0 ? 'failed' : 'degraded';

  return {
    provider,
    status,
    summary: `${provider} health check ${status} (${okCount}/${total} checks passed)`,
    checks,
  };
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({
            status: res.statusCode,
            data: raw ? JSON.parse(raw) : {},
            headers: res.headers,
          });
        } catch (_) {
          resolve({
            status: res.statusCode,
            data: raw,
            headers: res.headers,
          });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function graphRequest(workspaceId, { path, query, method = 'GET', body = null, headers = {} }) {
  const token = await getMicrosoftToken(workspaceId);
  if (!token) throw new Error('Microsoft 365 integration not connected or token unavailable');

  const requestPath = query
    ? `${path}?${new URLSearchParams(query).toString()}`
    : path;

  const payload = body == null ? null : JSON.stringify(body);
  const doRequest = async (accessToken) => httpsRequest({
    hostname: 'graph.microsoft.com',
    path: `/v1.0${requestPath}`,
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: 'outlook.body-content-type="text"',
      ...(payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      } : {}),
      ...headers,
    },
  }, payload);

  let response = await doRequest(token);
  if (response.status === 401) {
    clearTokenCache(workspaceId);
    const fresh = await getMicrosoftToken(workspaceId);
    if (!fresh) throw new Error('Microsoft token refresh failed');
    response = await doRequest(fresh);
  }

  if (response.status >= 400) {
    throw new Error(response.data?.error?.message || `Microsoft Graph error (${response.status})`);
  }

  return response.data;
}

async function listMailMessages(workspaceId, { search, top = 20 } = {}) {
  const query = {
    $top: String(top),
    $select: 'id,subject,receivedDateTime,from,toRecipients,bodyPreview',
    $orderby: 'receivedDateTime DESC',
  };
  if (search) query.$search = `"${search}"`;
  return graphRequest(workspaceId, {
    path: '/me/messages',
    query,
  });
}

async function listCalendarEvents(workspaceId, { startDateTime, endDateTime, top = 50 } = {}) {
  return graphRequest(workspaceId, {
    path: '/me/calendarView',
    query: {
      startDateTime: startDateTime || new Date().toISOString(),
      endDateTime: endDateTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      $top: String(top),
      $select: 'id,subject,start,end,location',
      $orderby: 'start/dateTime',
    },
  });
}

async function listContacts(workspaceId, { search, top = 50 } = {}) {
  const query = {
    $top: String(top),
    $select: 'id,displayName,emailAddresses,businessPhones,mobilePhone,companyName',
  };
  if (search) query.$search = `"${search}"`;
  return graphRequest(workspaceId, {
    path: '/me/contacts',
    query,
  });
}

async function sendMailMessage(workspaceId, { to, subject, body, htmlBody = null, cc, bcc, saveToSentItems = true } = {}) {
  const toRecipients = String(to || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  if (!toRecipients.length) {
    throw new Error('Recipient address is required.');
  }

  const ccRecipients = String(cc || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  const bccRecipients = String(bcc || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  return graphRequest(workspaceId, {
    path: '/me/sendMail',
    method: 'POST',
    body: {
      message: {
        subject: subject || '(no subject)',
        body: {
          contentType: htmlBody ? 'HTML' : 'Text',
          content: htmlBody || body || '',
        },
        toRecipients,
        ...(ccRecipients.length ? { ccRecipients } : {}),
        ...(bccRecipients.length ? { bccRecipients } : {}),
      },
      saveToSentItems: Boolean(saveToSentItems),
    },
  });
}

async function createSubscription(workspaceId, payload = {}) {
  return graphRequest(workspaceId, {
    path: '/subscriptions',
    method: 'POST',
    body: payload,
  });
}

async function probeMicrosoftIntegration(workspaceId) {
  const checks = [];

  const probes = [
    {
      key: 'mail',
      label: 'Mail API',
      run: async () => listMailMessages(workspaceId, { top: 1 }),
    },
    {
      key: 'calendar',
      label: 'Calendar API',
      run: async () => listCalendarEvents(workspaceId, { top: 1 }),
    },
    {
      key: 'contacts',
      label: 'Contacts API',
      run: async () => listContacts(workspaceId, { top: 1 }),
    },
  ];

  for (const probe of probes) {
    try {
      await probe.run();
      checks.push({
        key: probe.key,
        label: probe.label,
        status: 'ok',
      });
    } catch (error) {
      const classified = classifyProbeError(error);
      checks.push({
        key: probe.key,
        label: probe.label,
        status: 'error',
        code: classified.code,
        error: classified.message,
      });
    }
  }

  return summarizeProbeResults('microsoft365', checks);
}

module.exports = {
  graphRequest,
  listMailMessages,
  listCalendarEvents,
  listContacts,
  sendMailMessage,
  createSubscription,
  probeMicrosoftIntegration,
};
