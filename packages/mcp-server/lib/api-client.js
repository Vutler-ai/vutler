'use strict';

/**
 * Vutler API HTTP client.
 *
 * Configuration (via environment variables):
 *   VUTLER_API_URL  — Base URL of the Vutler API  (default: https://app.vutler.ai)
 *   VUTLER_API_KEY  — Bearer token sent as Authorization header
 */

const BASE_URL = (process.env.VUTLER_API_URL || 'https://app.vutler.ai').replace(/\/$/, '');
const API_KEY  = process.env.VUTLER_API_KEY || '';

/**
 * Build query string from a plain object, omitting undefined/null values.
 * @param {Record<string, any>} params
 * @returns {string}
 */
function buildQuery(params = {}) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

/**
 * Core fetch wrapper.
 *
 * @param {string} method   — HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param {string} path     — API path, e.g. "/api/v1/email"
 * @param {object} [opts]
 * @param {Record<string, any>} [opts.query]    — Query string parameters
 * @param {any}                 [opts.body]     — Request body (JSON-serialised)
 * @param {string}              [opts.rawBody]  — Pre-serialised body (used for multipart)
 * @param {Record<string,string>} [opts.headers] — Extra headers (overrides defaults)
 * @returns {Promise<any>}
 */
async function request(method, path, opts = {}) {
  const { query, body, rawBody, headers: extraHeaders } = opts;

  const url = `${BASE_URL}${path}${buildQuery(query)}`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  };

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const fetchOpts = { method, headers };

  if (rawBody !== undefined) {
    fetchOpts.body = rawBody;
    // Remove Content-Type so the runtime can set multipart boundary automatically
    delete fetchOpts.headers['Content-Type'];
  } else if (body !== undefined) {
    fetchOpts.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, fetchOpts);
  } catch (networkError) {
    throw new Error(
      `Network error calling Vutler API at ${url}: ${networkError.message}`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const detail =
      typeof data === 'object'
        ? data.message || data.error || JSON.stringify(data)
        : data;
    throw new Error(
      `Vutler API error ${response.status} ${response.statusText}: ${detail}`
    );
  }

  return data;
}

// Convenience helpers
const apiClient = {
  get:       (path, query)             => request('GET',    path, { query }),
  post:      (path, body)              => request('POST',   path, { body }),
  put:       (path, body)              => request('PUT',    path, { body }),
  patch:     (path, body)              => request('PATCH',  path, { body }),
  delete:    (path)                    => request('DELETE', path),
  postForm:  (path, formData)          => request('POST',   path, { rawBody: formData }),
};

module.exports = apiClient;
