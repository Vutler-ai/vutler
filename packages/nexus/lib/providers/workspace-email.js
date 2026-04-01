'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

class WorkspaceEmailProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async sendEmail(payload = {}) {
    const response = await this.client.post('/api/v1/email/send', {
      to: payload.to,
      subject: payload.subject,
      body: payload.body || '',
      htmlBody: payload.htmlBody || null,
      from: payload.from || undefined,
    });

    return response.data || response;
  }
}

module.exports = { WorkspaceEmailProvider };

