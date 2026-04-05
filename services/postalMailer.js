const http = require('http');
const https = require('https');

const POSTAL_HOST = process.env.POSTAL_HOST || 'mail.vutler.ai';
const POSTAL_ENDPOINT = process.env.POSTAL_ENDPOINT || process.env.POSTAL_API_URL || '';
const POSTAL_INTERNAL_ENDPOINT = process.env.POSTAL_INTERNAL_API_URL || 'http://postal-web:5000';
const POSTAL_FALLBACK_ENDPOINT = 'http://127.0.0.1:8082';
const POSTAL_API_KEY = process.env.POSTAL_API_KEY || '';
const POSTAL_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.POSTAL_REQUEST_TIMEOUT_MS || '15000', 10);
const RETRYABLE_POSTAL_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT']);

function isLocalPostalEndpoint(endpoint) {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  } catch (_) {
    return false;
  }
}

function buildPostalEndpointCandidates() {
  const candidates = [];
  const pushCandidate = (value) => {
    const endpoint = String(value || '').trim();
    if (!endpoint || candidates.includes(endpoint)) return;
    candidates.push(endpoint);
  };

  pushCandidate(POSTAL_ENDPOINT);
  if (isLocalPostalEndpoint(POSTAL_ENDPOINT)) {
    pushCandidate(POSTAL_INTERNAL_ENDPOINT);
  }
  pushCandidate(POSTAL_INTERNAL_ENDPOINT);
  pushCandidate(POSTAL_FALLBACK_ENDPOINT);

  if (candidates.length === 0) {
    pushCandidate(POSTAL_FALLBACK_ENDPOINT);
  }

  return candidates;
}

function sendPostalRequest(endpoint, payload) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL('/api/v1/send/message', endpoint);
    } catch (error) {
      resolve({
        success: false,
        error: `Invalid Postal endpoint: ${endpoint}`,
        endpoint,
        transport_error: true,
        code: 'ERR_INVALID_URL',
      });
      return;
    }

    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const postData = JSON.stringify(payload);

    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Host': POSTAL_HOST,
        'X-Server-API-Key': POSTAL_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = {};
        if (data) {
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            parsed = { raw: data };
          }
        }

        if (res.statusCode >= 400) {
          resolve({
            success: false,
            statusCode: res.statusCode,
            error: parsed.error || parsed.message || (typeof parsed.raw === 'string' && parsed.raw.trim()) || `HTTP ${res.statusCode}`,
            raw: data || null,
            endpoint,
          });
          return;
        }

        resolve({
          ...parsed,
          endpoint,
        });
      });
    });

    req.setTimeout(POSTAL_REQUEST_TIMEOUT_MS, () => {
      req.destroy(Object.assign(new Error(`Postal request timed out after ${POSTAL_REQUEST_TIMEOUT_MS}ms`), { code: 'ETIMEDOUT' }));
    });
    req.on('error', (error) => resolve({
      success: false,
      error: error.message,
      code: error.code || null,
      endpoint,
      transport_error: true,
    }));
    req.write(postData);
    req.end();
  });
}

async function sendPostalMail({ to, subject, plain_body, html_body, from = 'noreply@vutler.ai' }) {
  if (!POSTAL_API_KEY) return { skipped: true, reason: 'POSTAL_API_KEY missing' };

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) return { skipped: true, reason: 'No recipients' };

  const payload = {
    to: recipients,
    from,
    subject,
    plain_body,
    html_body,
  };

  const endpoints = buildPostalEndpointCandidates();
  let lastFailure = null;

  for (const endpoint of endpoints) {
    const result = await sendPostalRequest(endpoint, payload);
    if (result?.transport_error && RETRYABLE_POSTAL_ERROR_CODES.has(String(result.code || ''))) {
      lastFailure = result;
      continue;
    }
    return result;
  }

  return lastFailure || { success: false, error: 'Unable to reach any Postal endpoint.' };
}

module.exports = {
  sendPostalMail,
};
