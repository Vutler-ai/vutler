'use strict';

const BASE_URL = (process.env.VUTLER_API_URL || 'https://app.vutler.ai').replace(/\/$/, '');
const API_KEY = process.env.VUTLER_API_KEY || '';

function buildQuery(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

function buildHeaders(extraHeaders = {}, useJson = true) {
  const headers = {
    Accept: 'application/json',
    ...extraHeaders,
  };

  if (useJson) {
    headers['Content-Type'] = 'application/json';
  }

  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
    headers['X-API-Key'] = API_KEY;
  }

  return headers;
}

async function requestRaw(method, path, opts = {}) {
  const { query, body, headers, useJson = true } = opts;
  const url = `${BASE_URL}${path}${buildQuery(query)}`;
  const fetchOpts = {
    method,
    headers: buildHeaders(headers, useJson),
  };

  if (body !== undefined) {
    fetchOpts.body = useJson ? JSON.stringify(body) : body;
  }

  let response;
  try {
    response = await fetch(url, fetchOpts);
  } catch (networkError) {
    throw new Error(`Network error calling Vutler API at ${url}: ${networkError.message}`);
  }

  return response;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function request(method, path, opts = {}) {
  const response = await requestRaw(method, path, opts);
  const data = await parseResponse(response);

  if (!response.ok) {
    const detail = typeof data === 'object'
      ? data.message || data.error || JSON.stringify(data)
      : data;
    throw new Error(`Vutler API error ${response.status} ${response.statusText}: ${detail}`);
  }

  return data;
}

module.exports = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  delete: (path) => request('DELETE', path),
  postForm: (path, formData, query) => request('POST', path, { body: formData, query, useJson: false }),
  requestRaw,
};
