'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

class WorkspaceKnowledgeProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async getWorkspaceKnowledge() {
    const result = await this.client.get('/api/v1/memory/workspace-knowledge');
    return {
      content: result.content || '',
      updatedAt: result.updatedAt || null,
      readOnly: result.readOnly !== false,
    };
  }
}

module.exports = { WorkspaceKnowledgeProvider };

