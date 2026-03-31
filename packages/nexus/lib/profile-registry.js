class ProfileRegistry {
  constructor({ server, apiKey }) {
    this.server = server;
    this.apiKey = apiKey;
    this.cache = new Map();
  }

  _cacheKey(kind, key, version) {
    return `${kind}:${key || 'active'}:${version || 'latest'}`;
  }

  async _getJson(pathname) {
    const response = await fetch(`${this.server}${pathname}`, {
      headers: { 'X-API-Key': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Profile registry request failed: ${response.status}`);
    }

    return response.json();
  }

  async _load(kind, key, version, resolver) {
    const cacheKey = this._cacheKey(kind, key, version);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const value = await resolver();
    this.cache.set(cacheKey, value);
    return value;
  }

  async getProfile(profileKey, version) {
    return this._load('profile', profileKey, version, async () => {
      const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await this._getJson(`/api/v1/nexus-enterprise/profiles/${encodeURIComponent(profileKey)}${suffix}`);
      return response?.data?.profile || null;
    });
  }

  async getMatrix(version) {
    return this._load('matrix', 'default', version, async () => {
      const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await this._getJson(`/api/v1/nexus-enterprise/agent-level-matrix${suffix}`);
      return response?.data?.matrix || null;
    });
  }

  async listCapabilities() {
    return this._load('capabilities', 'all', 'active', async () => {
      const response = await this._getJson('/api/v1/nexus-enterprise/capabilities');
      return response?.data?.capabilities || [];
    });
  }

  async getLocalIntegrations(profileKey, version) {
    return this._load('local-integrations', profileKey, version, async () => {
      const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await this._getJson(`/api/v1/nexus-enterprise/local-integrations/${encodeURIComponent(profileKey)}${suffix}`);
      return response?.data?.localIntegrationRegistry || null;
    });
  }

  async getHelperRules(profileKey, version) {
    return this._load('helper-rules', profileKey, version, async () => {
      const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await this._getJson(`/api/v1/nexus-enterprise/helper-rules/${encodeURIComponent(profileKey)}${suffix}`);
      return response?.data?.helperRules || null;
    });
  }

  async getActionCatalog(profileKey, version) {
    return this._load('action-catalog', profileKey, version, async () => {
      const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await this._getJson(`/api/v1/nexus-enterprise/action-catalogs/${encodeURIComponent(profileKey)}${suffix}`);
      return response?.data?.actionCatalog || null;
    });
  }

  async getPolicyBundle(profileKey, version) {
    return this._load('policy-bundle', profileKey, version, async () => {
      const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
      const response = await this._getJson(`/api/v1/nexus-enterprise/policy-bundles/${encodeURIComponent(profileKey)}${suffix}`);
      return response?.data?.policyBundle || null;
    });
  }
}

module.exports = { ProfileRegistry };
