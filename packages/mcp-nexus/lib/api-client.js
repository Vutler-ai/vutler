'use strict';

/**
 * Vutler API HTTP client for Nexus Bridge.
 *
 * Configuration (via environment variables):
 *   VUTLER_API_URL  — Base URL of the Vutler API  (default: https://app.vutler.ai)
 *   VUTLER_API_KEY  — Bearer token sent as Authorization header
 */

const BASE_URL = (process.env.VUTLER_API_URL || 'https://app.vutler.ai').replace(/\/$/, '');
const API_KEY  = process.env.VUTLER_API_KEY || '';

/**
 * Build query string from a plain object, omitting undefined/null values.
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
 */
async function request(method, path, opts = {}) {
  const { query, body, headers: extraHeaders } = opts;

  const url = `${BASE_URL}${path}${buildQuery(query)}`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  };

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
    headers['X-API-Key'] = API_KEY;
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

const apiClient = {
  get:    (path, query) => request('GET',    path, { query }),
  post:   (path, body)  => request('POST',   path, { body }),
  patch:  (path, body)  => request('PATCH',  path, { body }),
  delete: (path)        => request('DELETE', path),
};

module.exports = apiClient;
