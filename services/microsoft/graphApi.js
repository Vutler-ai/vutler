'use strict';

const https = require('https');
const { getMicrosoftToken, clearTokenCache } = require('./tokenManager');

function httpsRequest(options) {
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
    req.end();
  });
}

async function graphRequest(workspaceId, { path, query }) {
  const token = await getMicrosoftToken(workspaceId);
  if (!token) throw new Error('Microsoft 365 integration not connected or token unavailable');

  const requestPath = query
    ? `${path}?${new URLSearchParams(query).toString()}`
    : path;

  const doRequest = async (accessToken) => httpsRequest({
    hostname: 'graph.microsoft.com',
    path: `/v1.0${requestPath}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: 'outlook.body-content-type="text"',
    },
  });

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

module.exports = {
  listMailMessages,
  listCalendarEvents,
  listContacts,
};
