'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

class WorkspaceEventSubscriptionsProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async listSubscriptions(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.set(key, String(value));
    });

    const query = params.toString();
    const response = await this.client.get(`/api/v1/nexus-enterprise/event-subscriptions${query ? `?${query}` : ''}`);
    return response.data?.subscriptions || [];
  }

  async createSubscription(payload = {}) {
    const response = await this.client.post('/api/v1/nexus-enterprise/event-subscriptions', payload);
    return response.data?.subscription || response.subscription || response;
  }
}

module.exports = { WorkspaceEventSubscriptionsProvider };
