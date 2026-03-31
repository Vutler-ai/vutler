'use strict';

const https = require('https');
const { getGoogleToken, clearTokenCache } = require('./tokenManager');

/**
 * Low-level Google REST API client.
 * Uses raw HTTPS — no googleapis SDK dependency.
 */

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        const parsed = ct.includes('application/json') ? JSON.parse(raw.toString()) : raw;
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

/**
 * Authenticated Google API request with auto-retry on 401 (token refresh) and 429.
 */
async function googleRequest(workspaceId, { hostname, path, method = 'GET', body, query }) {
  const token = await getGoogleToken(workspaceId);
  if (!token) throw new Error('Google integration not connected or token unavailable');

  if (query) {
    const qs = new URLSearchParams(query).toString();
    path = `${path}?${qs}`;
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body && method !== 'GET') headers['Content-Type'] = 'application/json';

  const doRequest = async (accessToken) => {
    const opts = { hostname, path, method, headers: { ...headers, Authorization: `Bearer ${accessToken}` } };
    return httpsRequest(opts, body && method !== 'GET' ? JSON.stringify(body) : undefined);
  };

  let resp = await doRequest(token);

  // 401 → clear cache, get fresh token, retry once
  if (resp.status === 401) {
    clearTokenCache(workspaceId);
    const freshToken = await getGoogleToken(workspaceId);
    if (!freshToken) throw new Error('Google token refresh failed — user may need to reconnect');
    resp = await doRequest(freshToken);
  }

  // 429 → wait 1s and retry once
  if (resp.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    resp = await doRequest(token);
  }

  if (resp.status >= 400) {
    const msg = resp.data?.error?.message || resp.data?.error || `HTTP ${resp.status}`;
    throw new Error(`Google API error (${method} ${path}): ${msg}`);
  }

  return resp.data;
}

// ─── Calendar API ──────────────────────────────────────────────────────────────

async function listCalendarEvents(workspaceId, { timeMin, timeMax, calendarId = 'primary', maxResults = 50 } = {}) {
  const query = { maxResults: String(maxResults), singleEvents: 'true', orderBy: 'startTime' };
  if (timeMin) query.timeMin = timeMin;
  if (timeMax) query.timeMax = timeMax;
  const resp = await googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    query,
  });
  return resp.items || [];
}

async function createCalendarEvent(workspaceId, { calendarId = 'primary', summary, start, end, description, location, attendees }) {
  const body = { summary, description, location };
  if (start) body.start = typeof start === 'string' ? { dateTime: start } : start;
  if (end) body.end = typeof end === 'string' ? { dateTime: end } : end;
  if (attendees) body.attendees = attendees.map((e) => (typeof e === 'string' ? { email: e } : e));
  return googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    method: 'POST',
    body,
  });
}

async function updateCalendarEvent(workspaceId, { calendarId = 'primary', eventId, ...fields }) {
  return googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    method: 'PATCH',
    body: fields,
  });
}

async function deleteCalendarEvent(workspaceId, { calendarId = 'primary', eventId }) {
  return googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    method: 'DELETE',
  });
}

async function getFreeBusy(workspaceId, { timeMin, timeMax, calendarIds = ['primary'] }) {
  return googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: '/calendar/v3/freeBusy',
    method: 'POST',
    body: {
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    },
  });
}

// ─── Drive API (READ ONLY) ────────────────────────────────────────────────────

async function listDriveFiles(workspaceId, { query, pageSize = 20, pageToken, orderBy = 'modifiedTime desc' } = {}) {
  const params = {
    pageSize: String(pageSize),
    orderBy,
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink)',
  };
  if (query) params.q = query;
  if (pageToken) params.pageToken = pageToken;
  return googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: '/drive/v3/files',
    query: params,
  });
}

async function getDriveFile(workspaceId, { fileId }) {
  return googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: `/drive/v3/files/${encodeURIComponent(fileId)}`,
    query: { fields: '*' },
  });
}

async function downloadDriveFile(workspaceId, { fileId, maxBytes = 5 * 1024 * 1024 }) {
  const meta = await getDriveFile(workspaceId, { fileId });
  const size = parseInt(meta.size || '0', 10);
  if (size > maxBytes) {
    throw new Error(`File too large (${(size / 1024 / 1024).toFixed(1)}MB). Max ${maxBytes / 1024 / 1024}MB. Use webViewLink: ${meta.webViewLink}`);
  }

  // For Google Docs/Sheets/Slides, export as text
  const EXPORT_MAP = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
  };
  const exportMime = EXPORT_MAP[meta.mimeType];

  if (exportMime) {
    return googleRequest(workspaceId, {
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${encodeURIComponent(fileId)}/export`,
      query: { mimeType: exportMime },
    });
  }

  return googleRequest(workspaceId, {
    hostname: 'www.googleapis.com',
    path: `/drive/v3/files/${encodeURIComponent(fileId)}`,
    query: { alt: 'media' },
  });
}

async function searchDriveFiles(workspaceId, { searchQuery, mimeType }) {
  let q = `fullText contains '${searchQuery.replace(/'/g, "\\'")}'`;
  if (mimeType) q += ` and mimeType = '${mimeType}'`;
  q += ' and trashed = false';
  return listDriveFiles(workspaceId, { query: q });
}

// ─── Gmail API ─────────────────────────────────────────────────────────────────

async function listGmailMessages(workspaceId, { query, maxResults = 20, labelIds, pageToken } = {}) {
  const params = { maxResults: String(maxResults) };
  if (query) params.q = query;
  if (labelIds) params.labelIds = labelIds.join(',');
  if (pageToken) params.pageToken = pageToken;

  const listResp = await googleRequest(workspaceId, {
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/messages',
    query: params,
  });

  // Fetch snippet + headers for each message (batch up to maxResults)
  const messages = listResp.messages || [];
  const detailed = await Promise.all(
    messages.slice(0, maxResults).map((m) =>
      googleRequest(workspaceId, {
        hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me/messages/${m.id}`,
        query: { format: 'metadata', metadataHeaders: 'From,To,Subject,Date' },
      })
    )
  );

  return {
    messages: detailed.map((msg) => {
      const headers = {};
      for (const h of msg.payload?.headers || []) headers[h.name.toLowerCase()] = h.value;
      return { id: msg.id, threadId: msg.threadId, snippet: msg.snippet, from: headers.from, to: headers.to, subject: headers.subject, date: headers.date, labelIds: msg.labelIds };
    }),
    nextPageToken: listResp.nextPageToken,
    resultSizeEstimate: listResp.resultSizeEstimate,
  };
}

async function getGmailMessage(workspaceId, { messageId, format = 'full' }) {
  const msg = await googleRequest(workspaceId, {
    hostname: 'gmail.googleapis.com',
    path: `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    query: { format },
  });

  // Extract readable body
  const headers = {};
  for (const h of msg.payload?.headers || []) headers[h.name.toLowerCase()] = h.value;

  let body = '';
  const extractBody = (part) => {
    if (part.body?.data) {
      const decoded = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      if (part.mimeType === 'text/plain') body = decoded;
      else if (part.mimeType === 'text/html' && !body) body = decoded;
    }
    if (part.parts) part.parts.forEach(extractBody);
  };
  if (msg.payload) extractBody(msg.payload);

  return { id: msg.id, threadId: msg.threadId, snippet: msg.snippet, from: headers.from, to: headers.to, subject: headers.subject, date: headers.date, body, labelIds: msg.labelIds };
}

async function sendGmailMessage(workspaceId, { to, subject, body, cc, bcc, from }) {
  const lines = [];
  if (from) lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  if (cc) lines.push(`Cc: ${cc}`);
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('');
  lines.push(body);

  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');

  return googleRequest(workspaceId, {
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/messages/send',
    method: 'POST',
    body: { raw },
  });
}

async function listGmailLabels(workspaceId) {
  const resp = await googleRequest(workspaceId, {
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/labels',
  });
  return resp.labels || [];
}

// ─── People API ───────────────────────────────────────────────────────────────

async function listPeopleConnections(workspaceId, { pageSize = 50, pageToken, personFields } = {}) {
  const query = {
    pageSize: String(pageSize),
    personFields: personFields || 'names,emailAddresses,phoneNumbers,organizations',
  };
  if (pageToken) query.pageToken = pageToken;

  const resp = await googleRequest(workspaceId, {
    hostname: 'people.googleapis.com',
    path: '/v1/people/me/connections',
    query,
  });

  return {
    connections: resp.connections || [],
    nextPageToken: resp.nextPageToken || null,
    totalPeople: resp.totalPeople || 0,
    totalItems: resp.totalItems || 0,
  };
}

module.exports = {
  // Calendar
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getFreeBusy,
  // Drive (read-only)
  listDriveFiles,
  getDriveFile,
  downloadDriveFile,
  searchDriveFiles,
  // Gmail
  listGmailMessages,
  getGmailMessage,
  sendGmailMessage,
  listGmailLabels,
  // People
  listPeopleConnections,
};
