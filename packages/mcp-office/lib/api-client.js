'use strict';

/**
 * Vutler API HTTP client.
 * All tool handlers use this module to call the Vutler backend.
 *
 * Configuration (via environment variables):
 *   VUTLER_API_URL  — Base URL of the Vutler API  (default: http://localhost:3001)
 *   VUTLER_API_KEY  — API key sent as X-Api-Key header
 */

const BASE_URL = (process.env.VUTLER_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const API_KEY  = process.env.VUTLER_API_KEY || '';

/**
 * Build query string from a plain object, omitting undefined/null values.
 * @param {Record<string, any>} params
 * @returns {string} — e.g. "?limit=20&folder=inbox"
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
 * @param {string} method  — HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param {string} path    — API path, e.g. "/api/v1/chat/channels"
 * @param {object} [opts]
 * @param {Record<string, any>} [opts.query]  — Query string parameters
 * @param {any}                 [opts.body]   — Request body (will be JSON-serialised)
 * @returns {Promise<any>}  — Parsed JSON response, or plain text on non-JSON responses
 */
async function request(method, path, opts = {}) {
  const { query, body } = opts;

  const url = `${BASE_URL}${path}${buildQuery(query)}`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (API_KEY) {
    headers['X-Api-Key'] = API_KEY;
  }

  const fetchOpts = { method, headers };
  if (body !== undefined) {
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

  // Try to parse as JSON; fall back to text for non-JSON responses.
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
  get:    (path, query)       => request('GET',    path, { query }),
  post:   (path, body)        => request('POST',   path, { body }),
  put:    (path, body)        => request('PUT',    path, { body }),
  patch:  (path, body)        => request('PATCH',  path, { body }),
  delete: (path)              => request('DELETE', path),
};

module.exports = apiClient;
