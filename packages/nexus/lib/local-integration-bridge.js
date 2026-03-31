'use strict';

class LocalIntegrationBridge {
  constructor(providers = {}) {
    this.providers = providers;
  }

  async invoke(request = {}) {
    const network = this.providers.network;
    if (!network) {
      throw new Error('Network provider is unavailable for local integration execution');
    }

    const url = request.url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Local integration request requires an absolute http(s) url');
    }

    const method = String(request.method || 'GET').toUpperCase();
    const body = request.body === undefined ? null : request.body;
    const headers = request.headers && typeof request.headers === 'object' ? request.headers : {};

    if (method === 'GET') {
      return {
        transport: 'http',
        method,
        url,
        response: await network.httpGet(url),
      };
    }

    if (method === 'POST') {
      return {
        transport: 'http',
        method,
        url,
        response: await network.httpPost(url, body || {}, headers),
      };
    }

    throw new Error(`Unsupported local integration method: ${method}`);
  }
}

module.exports = { LocalIntegrationBridge };
