'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

function toSearchParams(input = {}) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  return params.toString();
}

class WorkspaceDriveProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async listFiles(opts = {}) {
    const query = toSearchParams({ path: opts.path || '/' });
    const result = await this.client.get(`/api/v1/drive/files${query ? `?${query}` : ''}`);
    return Array.isArray(result.files) ? result.files : [];
  }

  async searchFiles(opts = {}) {
    const query = toSearchParams({
      q: opts.query || opts.q || '',
      path: opts.path || '/',
      limit: opts.limit || 20,
      includeContent: opts.includeContent ? 'true' : 'false',
    });
    const result = await this.client.get(`/api/v1/drive/search?${query}`);
    return Array.isArray(result.results) ? result.results : [];
  }

  async previewFile(fileId, opts = {}) {
    const query = toSearchParams({ path: opts.path || '/' });
    return this.client.get(`/api/v1/drive/preview/${encodeURIComponent(fileId)}${query ? `?${query}` : ''}`);
  }

  async parseFile(fileId, opts = {}) {
    const query = toSearchParams({ path: opts.path || '/' });
    const result = await this.client.get(`/api/v1/drive/parsed/${encodeURIComponent(fileId)}${query ? `?${query}` : ''}`);
    return result.parsed || result;
  }
}

module.exports = { WorkspaceDriveProvider };
