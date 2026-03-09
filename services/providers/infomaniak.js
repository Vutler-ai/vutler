'use strict';

const { VPSProviderInterface } = require('../vpsProvider');

/**
 * Infomaniak Public Cloud Provider
 * OpenStack-based implementation using Keystone v3 auth
 */
class InfomaniakProvider extends VPSProviderInterface {
  constructor(config) {
    super(config);
    this.endpoint = 'https://api.pub1.infomaniak.cloud';
    this.region = config.region || 'dc3-a';
    this.token = null;
    this.tokenExpiry = null;
    this.computeEndpoint = null;
    this.networkEndpoint = null;
  }

  async authenticate() {
    try {
      console.log('[InfomaniakProvider] Starting authentication...');
      
      // Keystone v3 auth with application credentials
      const authPayload = {
        auth: {
          identity: {
            methods: ['application_credential'],
            application_credential: {
              id: this.config.applicationCredentialId,
              secret: this.config.applicationCredentialSecret
            }
          }
        }
      };

      const response = await fetch(`${this.endpoint}/identity/v3/auth/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(authPayload)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Authentication failed: ${response.status} ${error}`);
      }

      // Extract token and service endpoints
      this.token = response.headers.get('X-Subject-Token');
      const authData = await response.json();
      
      this.tokenExpiry = new Date(authData.token.expires_at);
      
      // Find service endpoints
      const catalog = authData.token.catalog;
      const computeService = catalog.find(s => s.type === 'compute');
      const networkService = catalog.find(s => s.type === 'network');
      
      if (computeService) {
        const endpoint = computeService.endpoints.find(e => e.region === this.region);
        this.computeEndpoint = endpoint ? endpoint.url : null;
      }
      
      if (networkService) {
        const endpoint = networkService.endpoints.find(e => e.region === this.region);
        this.networkEndpoint = endpoint ? endpoint.url : null;
      }

      console.log('[InfomaniakProvider] Authentication successful');
      console.log('[InfomaniakProvider] Compute endpoint:', this.computeEndpoint);
      console.log('[InfomaniakProvider] Network endpoint:', this.networkEndpoint);
      
      return true;
    } catch (error) {
      console.error('[InfomaniakProvider] Authentication error:', error);
      throw error;
    }
  }

  async _ensureAuthenticated() {
    if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  async createInstance(opts) {
    this._validateInstanceOpts(opts);
    await this._ensureAuthenticated();

    try {
      console.log('[InfomaniakProvider] Creating instance:', opts.name);

      // Resolve flavor and image UUIDs
      const flavorRef = await this._resolveFlavor(opts.flavor);
      const imageRef = await this._resolveImage(opts.image);

      // Prepare server creation payload
      const serverPayload = {
        server: {
          name: opts.name,
          flavorRef: flavorRef,
          imageRef: imageRef,
          metadata: {
            vutler_managed: 'true',
            workspace_id: opts.workspace_id || 'unknown',
            ...opts.metadata
          }
        }
      };

      // Add user data if provided
      if (opts.userData) {
        serverPayload.server.user_data = Buffer.from(opts.userData).toString('base64');
      }

      const response = await fetch(`${this.computeEndpoint}/servers`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': this.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(serverPayload)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Instance creation failed: ${response.status} ${error}`);
      }

      const result = await response.json();
      const server = result.server;

      console.log('[InfomaniakProvider] Instance creation initiated:', server.id);

      return {
        id: server.id,
        name: server.name,
        status: this._normalizeStatus(server.status),
        flavor: opts.flavor,
        image: opts.image,
        region: this.region,
        provider_instance_id: server.id,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('[InfomaniakProvider] Error creating instance:', error);
      throw error;
    }
  }

  async deleteInstance(instanceId) {
    await this._ensureAuthenticated();

    try {
      console.log('[InfomaniakProvider] Deleting instance:', instanceId);

      const response = await fetch(`${this.computeEndpoint}/servers/${instanceId}`, {
        method: 'DELETE',
        headers: {
          'X-Auth-Token': this.token
        }
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`Instance deletion failed: ${response.status} ${error}`);
      }

      console.log('[InfomaniakProvider] Instance deletion initiated');
      return { success: true };
    } catch (error) {
      console.error('[InfomaniakProvider] Error deleting instance:', error);
      throw error;
    }
  }

  async startInstance(instanceId) {
    await this._ensureAuthenticated();

    try {
      console.log('[InfomaniakProvider] Starting instance:', instanceId);

      const response = await fetch(`${this.computeEndpoint}/servers/${instanceId}/action`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': this.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'os-start': null })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Instance start failed: ${response.status} ${error}`);
      }

      console.log('[InfomaniakProvider] Instance start initiated');
      return { success: true };
    } catch (error) {
      console.error('[InfomaniakProvider] Error starting instance:', error);
      throw error;
    }
  }

  async stopInstance(instanceId) {
    await this._ensureAuthenticated();

    try {
      console.log('[InfomaniakProvider] Stopping instance:', instanceId);

      const response = await fetch(`${this.computeEndpoint}/servers/${instanceId}/action`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': this.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 'os-stop': null })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Instance stop failed: ${response.status} ${error}`);
      }

      console.log('[InfomaniakProvider] Instance stop initiated');
      return { success: true };
    } catch (error) {
      console.error('[InfomaniakProvider] Error stopping instance:', error);
      throw error;
    }
  }

  async getInstanceStatus(instanceId) {
    await this._ensureAuthenticated();

    try {
      const response = await fetch(`${this.computeEndpoint}/servers/${instanceId}`, {
        method: 'GET',
        headers: {
          'X-Auth-Token': this.token
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { status: 'deleted' };
        }
        const error = await response.text();
        throw new Error(`Get instance status failed: ${response.status} ${error}`);
      }

      const result = await response.json();
      const server = result.server;

      return {
        status: this._normalizeStatus(server.status),
        addresses: server.addresses,
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('[InfomaniakProvider] Error getting instance status:', error);
      throw error;
    }
  }

  async listInstances() {
    await this._ensureAuthenticated();

    try {
      const response = await fetch(`${this.computeEndpoint}/servers/detail`, {
        method: 'GET',
        headers: {
          'X-Auth-Token': this.token
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`List instances failed: ${response.status} ${error}`);
      }

      const result = await response.json();
      return result.servers.map(server => ({
        id: server.id,
        name: server.name,
        status: this._normalizeStatus(server.status),
        flavor: server.flavor.id,
        image: server.image.id,
        addresses: server.addresses,
        metadata: server.metadata
      }));
    } catch (error) {
      console.error('[InfomaniakProvider] Error listing instances:', error);
      throw error;
    }
  }

  async listFlavors() {
    await this._ensureAuthenticated();

    try {
      const response = await fetch(`${this.computeEndpoint}/flavors/detail`, {
        method: 'GET',
        headers: {
          'X-Auth-Token': this.token
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`List flavors failed: ${response.status} ${error}`);
      }

      const result = await response.json();
      return result.flavors.map(flavor => ({
        id: flavor.id,
        name: flavor.name,
        vcpus: flavor.vcpus,
        ram: flavor.ram,
        disk: flavor.disk,
        is_public: flavor['os-flavor-access:is_public']
      }));
    } catch (error) {
      console.error('[InfomaniakProvider] Error listing flavors:', error);
      // Return mock data for now if API fails
      return this._getMockFlavors();
    }
  }

  async listImages() {
    await this._ensureAuthenticated();

    try {
      // Use Glance API for images
      const imageEndpoint = this.endpoint.replace('/compute/', '/image/');
      const response = await fetch(`${imageEndpoint}/v2/images`, {
        method: 'GET',
        headers: {
          'X-Auth-Token': this.token
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`List images failed: ${response.status} ${error}`);
      }

      const result = await response.json();
      return result.images.map(image => ({
        id: image.id,
        name: image.name,
        status: image.status,
        visibility: image.visibility,
        size: image.size
      }));
    } catch (error) {
      console.error('[InfomaniakProvider] Error listing images:', error);
      // Return mock data for now if API fails
      return this._getMockImages();
    }
  }

  async _resolveFlavor(flavorName) {
    const flavors = await this.listFlavors();
    const flavor = flavors.find(f => f.name === flavorName || f.id === flavorName);
    if (!flavor) {
      throw new Error(`Flavor not found: ${flavorName}`);
    }
    return flavor.id;
  }

  async _resolveImage(imageName) {
    const images = await this.listImages();
    const image = images.find(i => i.name.includes(imageName) || i.id === imageName);
    if (!image) {
      throw new Error(`Image not found: ${imageName}`);
    }
    return image.id;
  }

  _getMockFlavors() {
    return [
      { id: 'a2-ram4-disk20', name: 'a2-ram4-disk20', vcpus: 2, ram: 4096, disk: 20 },
      { id: 'a4-ram8-disk50', name: 'a4-ram8-disk50', vcpus: 4, ram: 8192, disk: 50 },
      { id: 'a8-ram16-disk100', name: 'a8-ram16-disk100', vcpus: 8, ram: 16384, disk: 100 }
    ];
  }

  _getMockImages() {
    return [
      { id: 'ubuntu-20.04', name: 'Ubuntu 20.04 LTS', status: 'active' },
      { id: 'ubuntu-22.04', name: 'Ubuntu 22.04 LTS', status: 'active' },
      { id: 'debian-11', name: 'Debian 11', status: 'active' }
    ];
  }
}

module.exports = InfomaniakProvider;