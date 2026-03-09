'use strict';

/**
 * VPS Provider Interface
 * Abstract base class that all VPS providers must implement
 */
class VPSProviderInterface {
  constructor(config) {
    this.config = config;
    if (this.constructor === VPSProviderInterface) {
      throw new Error('VPSProviderInterface is abstract and cannot be instantiated directly');
    }
  }

  // Authentication
  async authenticate() {
    throw new Error('authenticate() method must be implemented');
  }

  // Core lifecycle methods
  async createInstance(opts) {
    throw new Error('createInstance() method must be implemented');
  }

  async deleteInstance(id) {
    throw new Error('deleteInstance() method must be implemented');
  }

  async startInstance(id) {
    throw new Error('startInstance() method must be implemented');
  }

  async stopInstance(id) {
    throw new Error('stopInstance() method must be implemented');
  }

  async getInstanceStatus(id) {
    throw new Error('getInstanceStatus() method must be implemented');
  }

  // Discovery methods
  async listInstances() {
    throw new Error('listInstances() method must be implemented');
  }

  async listFlavors() {
    throw new Error('listFlavors() method must be implemented');
  }

  async listImages() {
    throw new Error('listImages() method must be implemented');
  }

  // Helper method to validate required options
  _validateInstanceOpts(opts) {
    const required = ['name', 'flavor', 'image'];
    for (const field of required) {
      if (!opts[field]) {
        throw new Error(`Missing required option: ${field}`);
      }
    }
  }

  // Normalize instance status across providers
  _normalizeStatus(providerStatus) {
    const statusMap = {
      // OpenStack statuses
      'BUILD': 'creating',
      'ACTIVE': 'active',
      'SHUTOFF': 'stopped',
      'ERROR': 'error',
      'DELETED': 'deleted',
      
      // Hetzner statuses
      'running': 'active',
      'off': 'stopped',
      'starting': 'creating',
      'stopping': 'stopping',
      
      // Vultr statuses
      'pending': 'creating',
      'installing': 'creating',
      'ok': 'active',
      'power_off': 'stopped',
      'missing': 'error'
    };

    return statusMap[providerStatus] || 'unknown';
  }
}

/**
 * VPS Provider Factory
 * Creates appropriate provider instance based on provider name
 */
class VPSProviderFactory {
  static create(providerName, config) {
    switch (providerName) {
      case 'infomaniak':
        const InfomaniakProvider = require('./providers/infomaniak');
        return new InfomaniakProvider(config);
      
      case 'hetzner':
        const HetznerProvider = require('./providers/hetzner');
        return new HetznerProvider(config);
      
      case 'vultr':
        const VultrProvider = require('./providers/vultr');
        return new VultrProvider(config);
      
      default:
        throw new Error(`Unsupported VPS provider: ${providerName}`);
    }
  }

  static getSupportedProviders() {
    return ['infomaniak', 'hetzner', 'vultr'];
  }
}

module.exports = {
  VPSProviderInterface,
  VPSProviderFactory
};