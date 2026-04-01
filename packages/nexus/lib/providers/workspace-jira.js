'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

class WorkspaceJiraProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async createIssue(payload = {}) {
    const response = await this.client.post('/api/v1/jira/issues', payload);
    return response.data || response;
  }

  async updateIssue(issueKey, fields = {}) {
    const response = await this.client._request(
      'PATCH',
      `/api/v1/jira/issues/${encodeURIComponent(issueKey)}`,
      { fields }
    );
    return response.data || response;
  }

  async addComment(issueKey, body) {
    const response = await this.client.post(`/api/v1/jira/issues/${encodeURIComponent(issueKey)}/comment`, {
      body,
    });
    return response.data || response;
  }
}

module.exports = { WorkspaceJiraProvider };

