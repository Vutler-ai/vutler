# VPS Provider Integration Specification

> **Project**: Vutler Platform VPS Provider Integration  
> **Version**: 1.0  
> **Date**: 2026-03-09  
> **Status**: Specification Phase  

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Provider Abstraction Layer](#2-provider-abstraction-layer)
3. [Infomaniak Implementation Detail](#3-infomaniak-implementation-detail)
4. [Database Schema](#4-database-schema)
5. [API Routes](#5-api-routes)
6. [Security](#6-security)
7. [Billing Integration](#7-billing-integration)
8. [Agent Deployment Flow](#8-agent-deployment-flow)
9. [Monitoring](#9-monitoring)
10. [Migration Path](#10-migration-path)
11. [Implementation Timeline](#11-implementation-timeline)

---

## 1. Architecture Overview

### 1.1 Integration Scope

The VPS Provider Integration extends Vutler's core AI agent management platform to support automatic provisioning of dedicated VPS instances for agent deployment. This enables clients to run their agents on isolated, scalable infrastructure rather than shared resources.

### 1.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vutler Platform                      │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)                                           │
│  ├─ VPS Management Dashboard                                │
│  ├─ Agent Deployment Wizard                                 │
│  └─ Billing & Usage Overview                                │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Express.js)                                     │
│  ├─ /api/v1/vps/*           (VPS Management)                │
│  ├─ /api/v1/agents/*        (Agent Management - Extended)   │
│  └─ /api/v1/billing/*       (Billing Integration)           │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                              │
│  ├─ VPSProviderService      (Abstraction Layer)             │
│  ├─ AgentDeploymentService  (Agent Runtime Deployment)      │
│  ├─ VPSBillingService       (Usage Tracking & Costs)        │
│  ├─ VPSMonitoringService    (Health Checks & Sync)          │
│  └─ VPSSecurityService      (Firewall & Access Control)     │
├─────────────────────────────────────────────────────────────┤
│  Provider Implementations                                   │
│  ├─ InfomaniakProvider      (OpenStack API)                 │
│  ├─ HetznerProvider         (REST API v1)                   │
│  └─ VultrProvider           (REST API v2)                   │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ├─ PostgreSQL              (Primary data)                  │
│  ├─ Redis                   (Cache & pub/sub)               │
│  └─ Encrypted Storage       (Provider credentials)          │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 New Components

#### 1.3.1 API Routes
- **VPS Management API**: `/api/v1/vps/`
- **Agent Deployment API**: `/api/v1/agents/:id/deploy`
- **Billing Integration**: `/api/v1/vps/billing/`

#### 1.3.2 Service Layer
- **VPSProviderService**: Unified interface for all VPS providers
- **AgentDeploymentService**: Handles agent runtime deployment to VPS
- **VPSBillingService**: Tracks usage and manages cost pass-through
- **VPSMonitoringService**: Real-time status monitoring and health checks

#### 1.3.3 Database Extensions
- New tables: `vps_instances`, `vps_providers`, `vps_provider_configs`
- Extended tables: `agents` (add vps_instance_id), `workspaces` (add vps_quota)

---

## 2. Provider Abstraction Layer

### 2.1 Core Interface

```javascript
// services/vpsProviderService.js
'use strict';

/**
 * Abstract VPS Provider Interface
 * Unified API for all VPS providers (Infomaniak, Hetzner, Vultr)
 */
class VPSProviderInterface {
  constructor(providerConfig) {
    this.config = providerConfig;
    this.provider = null;
  }

  // Core lifecycle methods
  async createInstance(spec) { throw new Error('Not implemented'); }
  async startInstance(instanceId) { throw new Error('Not implemented'); }
  async stopInstance(instanceId) { throw new Error('Not implemented'); }
  async deleteInstance(instanceId) { throw new Error('Not implemented'); }
  async getInstanceStatus(instanceId) { throw new Error('Not implemented'); }
  
  // Management methods
  async listInstances() { throw new Error('Not implemented'); }
  async resizeInstance(instanceId, newFlavor) { throw new Error('Not implemented'); }
  async createSnapshot(instanceId, name) { throw new Error('Not implemented'); }
  async restoreSnapshot(instanceId, snapshotId) { throw new Error('Not implemented'); }
  
  // Networking methods
  async assignFloatingIP(instanceId) { throw new Error('Not implemented'); }
  async createSecurityGroup(rules) { throw new Error('Not implemented'); }
  async attachSecurityGroup(instanceId, groupId) { throw new Error('Not implemented'); }
  
  // Billing methods
  async getUsageMetrics(instanceId, timeframe) { throw new Error('Not implemented'); }
  async getBillingInfo(instanceId) { throw new Error('Not implemented'); }
}

/**
 * VPS Provider Factory
 * Creates appropriate provider instance based on type
 */
class VPSProviderFactory {
  static create(providerType, config) {
    switch (providerType) {
      case 'infomaniak':
        return new InfomaniakProvider(config);
      case 'hetzner':
        return new HetznerProvider(config);
      case 'vultr':
        return new VultrProvider(config);
      default:
        throw new Error(`Unsupported provider: ${providerType}`);
    }
  }
}

/**
 * Main VPS Provider Service
 * Handles provider selection, credential management, and operations routing
 */
class VPSProviderService {
  constructor(db, cryptoService) {
    this.db = db;
    this.crypto = cryptoService;
    this.providers = new Map();
  }

  async getProvider(workspaceId, providerId) {
    const cacheKey = `${workspaceId}:${providerId}`;
    
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey);
    }

    // Load provider config from DB
    const result = await this.db.query(
      'SELECT * FROM vps_provider_configs WHERE workspace_id = $1 AND provider_id = $2',
      [workspaceId, providerId]
    );

    if (!result.rows.length) {
      throw new Error('Provider configuration not found');
    }

    const config = result.rows[0];
    const decryptedCredentials = this.crypto.decrypt(config.encrypted_credentials);
    
    const provider = VPSProviderFactory.create(config.provider_type, {
      ...JSON.parse(decryptedCredentials),
      region: config.region,
      endpoint: config.endpoint
    });

    this.providers.set(cacheKey, provider);
    return provider;
  }

  async createInstance(workspaceId, providerId, instanceSpec) {
    const provider = await this.getProvider(workspaceId, providerId);
    
    // Standardize instance specification
    const standardSpec = {
      name: instanceSpec.name,
      flavor: instanceSpec.flavor,
      image: instanceSpec.image,
      userData: instanceSpec.userData,
      securityGroups: instanceSpec.securityGroups || ['default'],
      networks: instanceSpec.networks || ['auto'],
      tags: {
        workspace_id: workspaceId,
        created_by: 'vutler',
        ...instanceSpec.tags
      }
    };

    return await provider.createInstance(standardSpec);
  }
}

module.exports = { VPSProviderService, VPSProviderInterface, VPSProviderFactory };
```

### 2.2 Standardized Response Format

```javascript
// Standard VPS instance object
const VPSInstance = {
  id: 'string',                    // Provider-specific instance ID
  name: 'string',                  // Human-readable name
  status: 'enum',                  // creating|active|stopped|error|deleted
  flavor: 'string',                // Instance size (standardized)
  image: 'string',                 // OS image name
  publicIP: 'string|null',         // Public IP address
  privateIP: 'string',             // Private IP address
  region: 'string',                // Datacenter region
  createdAt: 'datetime',           // Creation timestamp
  updatedAt: 'datetime',           // Last status update
  metadata: {                      // Provider-specific metadata
    providerInstanceId: 'string',
    providerRegion: 'string',
    costPerHour: 'number',
    specs: {
      cpu: 'number',
      ram: 'number',              // GB
      disk: 'number'              // GB
    }
  }
};

// Standard error format
const VPSError = {
  code: 'string',                  // ERROR_CODE
  message: 'string',               // Human-readable message
  details: 'object|null',          // Additional context
  providerError: 'object|null'     // Original provider error
};
```

---

## 3. Infomaniak Implementation Detail

### 3.1 OpenStack Integration

```javascript
// services/providers/infomaniakProvider.js
'use strict';

const { VPSProviderInterface } = require('../vpsProviderService');
const { OpenStackSDK } = require('openstack-sdk'); // Hypothetical SDK

/**
 * Infomaniak Public Cloud Provider
 * OpenStack-based implementation using Keystone v3 auth
 */
class InfomaniakProvider extends VPSProviderInterface {
  constructor(config) {
    super(config);
    this.auth = null;
    this.compute = null;
    this.network = null;
    this.endpoint = 'https://api.pub1.infomaniak.cloud';
    this.region = 'ch-geneva-1';
    
    this._initializeClients();
  }

  async _initializeClients() {
    // Keystone v3 authentication with application credentials
    this.auth = new OpenStackSDK.Auth({
      endpoint: `${this.endpoint}/identity/v3`,
      applicationCredentialId: this.config.applicationCredentialId,
      applicationCredentialSecret: this.config.applicationCredentialSecret,
      region: this.region
    });

    // Initialize service clients
    this.compute = new OpenStackSDK.Nova(this.auth);
    this.network = new OpenStackSDK.Neutron(this.auth);
    this.image = new OpenStackSDK.Glance(this.auth);
    this.volume = new OpenStackSDK.Cinder(this.auth);
  }

  async createInstance(spec) {
    try {
      // Prepare cloud-init user data
      const userData = this._prepareUserData(spec.userData);
      
      // Create security groups if needed
      const securityGroups = await this._ensureSecurityGroups(spec.securityGroups);
      
      // Create instance
      const instance = await this.compute.createServer({
        name: spec.name,
        flavorRef: await this._resolveFlavor(spec.flavor),
        imageRef: await this._resolveImage(spec.image),
        userData: Buffer.from(userData).toString('base64'),
        securityGroups: securityGroups,
        networks: await this._resolveNetworks(spec.networks),
        metadata: {
          vutler_workspace: spec.tags.workspace_id,
          vutler_managed: 'true',
          ...spec.tags
        }
      });

      // Wait for instance to become active
      await this._waitForInstanceActive(instance.id);
      
      // Assign floating IP if requested
      let floatingIP = null;
      if (spec.assignPublicIP !== false) {
        floatingIP = await this.assignFloatingIP(instance.id);
      }

      return {
        id: instance.id,
        name: instance.name,
        status: 'creating',
        flavor: spec.flavor,
        image: spec.image,
        publicIP: floatingIP?.ip || null,
        privateIP: instance.addresses?.private?.[0]?.addr || null,
        region: this.region,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          providerInstanceId: instance.id,
          providerRegion: this.region,
          costPerHour: await this._calculateCostPerHour(spec.flavor),
          specs: await this._getFlavorSpecs(spec.flavor)
        }
      };
    } catch (error) {
      throw this._handleError(error, 'CREATE_INSTANCE_FAILED');
    }
  }

  async getInstanceStatus(instanceId) {
    try {
      const instance = await this.compute.getServer(instanceId);
      
      return {
        status: this._mapInstanceStatus(instance.status),
        publicIP: this._extractPublicIP(instance.addresses),
        privateIP: this._extractPrivateIP(instance.addresses),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw this._handleError(error, 'GET_STATUS_FAILED');
    }
  }

  async startInstance(instanceId) {
    try {
      await this.compute.startServer(instanceId);
      await this._waitForInstanceActive(instanceId);
      return { success: true, message: 'Instance started successfully' };
    } catch (error) {
      throw this._handleError(error, 'START_INSTANCE_FAILED');
    }
  }

  async stopInstance(instanceId) {
    try {
      await this.compute.stopServer(instanceId);
      await this._waitForInstanceStopped(instanceId);
      return { success: true, message: 'Instance stopped successfully' };
    } catch (error) {
      throw this._handleError(error, 'STOP_INSTANCE_FAILED');
    }
  }

  async deleteInstance(instanceId) {
    try {
      // Delete associated floating IPs first
      await this._cleanupFloatingIPs(instanceId);
      
      // Delete the instance
      await this.compute.deleteServer(instanceId);
      
      return { success: true, message: 'Instance deleted successfully' };
    } catch (error) {
      throw this._handleError(error, 'DELETE_INSTANCE_FAILED');
    }
  }

  async assignFloatingIP(instanceId) {
    try {
      // Get or create floating IP
      const floatingIP = await this.network.createFloatingIP({
        floatingNetworkId: await this._getPublicNetworkId()
      });

      // Associate with instance
      await this.compute.associateFloatingIP(instanceId, floatingIP.floatingIpAddress);

      return {
        ip: floatingIP.floatingIpAddress,
        id: floatingIP.id
      };
    } catch (error) {
      throw this._handleError(error, 'ASSIGN_IP_FAILED');
    }
  }

  // Helper methods
  async _resolveFlavor(flavorName) {
    const flavors = await this.compute.listFlavors();
    const flavor = flavors.find(f => f.name === flavorName);
    if (!flavor) {
      throw new Error(`Flavor not found: ${flavorName}`);
    }
    return flavor.id;
  }

  async _resolveImage(imageName) {
    const images = await this.image.listImages();
    const image = images.find(i => i.name.includes(imageName));
    if (!image) {
      throw new Error(`Image not found: ${imageName}`);
    }
    return image.id;
  }

  _prepareUserData(customUserData) {
    const defaultUserData = `#!/bin/bash
# Vutler Agent Bootstrap Script
set -e

# Update system
apt-get update && apt-get upgrade -y

# Install dependencies
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs docker.io curl wget

# Configure Docker
systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu

# Install Vutler Agent Runtime
mkdir -p /opt/vutler
cd /opt/vutler
wget -O agent-runtime.tar.gz "https://releases.vutler.ai/agent-runtime/latest.tar.gz"
tar -xzf agent-runtime.tar.gz
chmod +x install.sh
./install.sh

# Custom user data
${customUserData || '# No custom user data'}
`;

    return defaultUserData;
  }

  _mapInstanceStatus(openstackStatus) {
    const statusMap = {
      'BUILD': 'creating',
      'ACTIVE': 'active',
      'SHUTOFF': 'stopped',
      'ERROR': 'error',
      'DELETED': 'deleted',
      'PAUSED': 'stopped',
      'SUSPENDED': 'stopped'
    };
    return statusMap[openstackStatus] || 'unknown';
  }

  _handleError(error, code) {
    console.error('[InfomaniakProvider] Error:', error);
    return {
      code,
      message: error.message,
      details: null,
      providerError: error
    };
  }
}

module.exports = InfomaniakProvider;
```

### 3.2 Authentication Flow

```javascript
// services/auth/infomaniakAuth.js
'use strict';

/**
 * Infomaniak OpenStack Authentication Service
 * Handles Keystone v3 authentication with application credentials
 */
class InfomaniakAuth {
  constructor(credentials) {
    this.applicationCredentialId = credentials.applicationCredentialId;
    this.applicationCredentialSecret = credentials.applicationCredentialSecret;
    this.endpoint = 'https://api.pub1.infomaniak.cloud';
    this.token = null;
    this.tokenExpiry = null;
  }

  async getToken() {
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    const authData = {
      auth: {
        identity: {
          methods: ['application_credential'],
          application_credential: {
            id: this.applicationCredentialId,
            secret: this.applicationCredentialSecret
          }
        }
      }
    };

    try {
      const response = await fetch(`${this.endpoint}/identity/v3/auth/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(authData)
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const token = response.headers.get('X-Subject-Token');
      const tokenData = await response.json();
      
      this.token = token;
      this.tokenExpiry = new Date(tokenData.token.expires_at);

      return token;
    } catch (error) {
      console.error('[InfomaniakAuth] Authentication error:', error);
      throw error;
    }
  }

  async refreshToken() {
    this.token = null;
    this.tokenExpiry = null;
    return await this.getToken();
  }
}

module.exports = InfomaniakAuth;
```

---

## 4. Database Schema

### 4.1 New Tables

```sql
-- VPS Provider Registry
CREATE TABLE vps_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,              -- 'Infomaniak Public Cloud'
  provider_type VARCHAR(50) NOT NULL,      -- 'infomaniak', 'hetzner', 'vultr'
  regions JSONB NOT NULL,                  -- Available regions/datacenters
  flavors JSONB NOT NULL,                  -- Available instance sizes
  images JSONB NOT NULL,                   -- Available OS images
  pricing JSONB NOT NULL,                  -- Pricing structure
  capabilities JSONB NOT NULL,             -- Supported features
  status VARCHAR(20) DEFAULT 'active',     -- active|maintenance|disabled
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Per-workspace provider configurations
CREATE TABLE vps_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES vps_providers(id),
  display_name VARCHAR(100) NOT NULL,      -- 'Production Infomaniak'
  region VARCHAR(50) NOT NULL,             -- 'ch-geneva-1'
  endpoint VARCHAR(255),                   -- Custom endpoint if needed
  encrypted_credentials TEXT NOT NULL,     -- Encrypted API keys/secrets
  quota_limits JSONB,                      -- Instance limits per workspace
  default_config JSONB,                    -- Default instance settings
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, provider_id, region)
);

-- VPS instances
CREATE TABLE vps_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_config_id UUID NOT NULL REFERENCES vps_provider_configs(id),
  provider_instance_id VARCHAR(255) NOT NULL, -- Provider's internal ID
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,             -- creating|active|stopped|error|deleted
  flavor VARCHAR(50) NOT NULL,             -- Instance size
  image VARCHAR(100) NOT NULL,             -- OS image
  public_ip INET,                          -- Public IP address
  private_ip INET,                         -- Private IP address
  region VARCHAR(50) NOT NULL,
  specifications JSONB NOT NULL,           -- CPU, RAM, disk specs
  cost_per_hour DECIMAL(10,6),             -- Hourly cost in CHF/EUR/USD
  agent_assignments JSONB DEFAULT '[]',    -- Array of assigned agent IDs
  metadata JSONB DEFAULT '{}',             -- Provider-specific metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,                    -- Soft delete
  
  -- Indexes
  INDEX idx_vps_instances_workspace (workspace_id),
  INDEX idx_vps_instances_provider (provider_config_id),
  INDEX idx_vps_instances_status (status),
  INDEX idx_vps_instances_deleted (deleted_at),
  
  -- Constraints
  UNIQUE(provider_config_id, provider_instance_id)
);

-- VPS usage tracking for billing
CREATE TABLE vps_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vps_instance_id UUID NOT NULL REFERENCES vps_instances(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  hours_active DECIMAL(5,2) NOT NULL,      -- Hours the instance was running
  cost_total DECIMAL(10,2) NOT NULL,       -- Total cost for the day
  currency VARCHAR(3) NOT NULL,            -- CHF, EUR, USD
  status VARCHAR(20) DEFAULT 'active',     -- active|invoiced|disputed
  metadata JSONB DEFAULT '{}',             -- Additional usage metrics
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_vps_usage_instance (vps_instance_id),
  INDEX idx_vps_usage_workspace (workspace_id),
  INDEX idx_vps_usage_date (usage_date),
  
  -- Constraints
  UNIQUE(vps_instance_id, usage_date)
);

-- VPS deployment history
CREATE TABLE vps_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vps_instance_id UUID NOT NULL REFERENCES vps_instances(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  deployment_type VARCHAR(50) NOT NULL,    -- 'agent_install', 'agent_update', 'system_update'
  status VARCHAR(20) NOT NULL,             -- 'pending', 'running', 'completed', 'failed'
  script_hash VARCHAR(64),                 -- SHA256 of deployment script
  logs TEXT,                               -- Deployment logs
  error_message TEXT,                      -- Error details if failed
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_vps_deployments_instance (vps_instance_id),
  INDEX idx_vps_deployments_agent (agent_id),
  INDEX idx_vps_deployments_status (status)
);
```

### 4.2 Extended Tables

```sql
-- Extend agents table for VPS integration
ALTER TABLE agents ADD COLUMN vps_instance_id UUID REFERENCES vps_instances(id);
ALTER TABLE agents ADD COLUMN deployment_config JSONB DEFAULT '{}';
ALTER TABLE agents ADD COLUMN vps_status VARCHAR(20) DEFAULT 'local'; -- local|provisioning|deployed|error

-- Add index
CREATE INDEX idx_agents_vps_instance ON agents(vps_instance_id);

-- Extend workspaces table for VPS quotas
ALTER TABLE workspaces ADD COLUMN vps_quota JSONB DEFAULT '{"max_instances": 5, "max_cost_per_month": 500}';

-- VPS-specific workspace settings
ALTER TABLE workspaces ADD COLUMN vps_settings JSONB DEFAULT '{"auto_deploy": false, "default_provider": null, "preferred_region": null}';
```

### 4.3 Row Level Security Policies

```sql
-- VPS provider configs isolation
CREATE POLICY vps_provider_configs_isolation ON vps_provider_configs
  USING (workspace_id = current_setting('app.workspace_id', true)::UUID);

-- VPS instances isolation  
CREATE POLICY vps_instances_isolation ON vps_instances
  USING (workspace_id = current_setting('app.workspace_id', true)::UUID);

-- VPS usage records isolation
CREATE POLICY vps_usage_records_isolation ON vps_usage_records
  USING (workspace_id = current_setting('app.workspace_id', true)::UUID);

-- VPS deployments isolation
CREATE POLICY vps_deployments_isolation ON vps_deployments
  USING (vps_instance_id IN (
    SELECT id FROM vps_instances 
    WHERE workspace_id = current_setting('app.workspace_id', true)::UUID
  ));

-- Enable RLS
ALTER TABLE vps_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vps_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE vps_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vps_deployments ENABLE ROW LEVEL SECURITY;
```

---

## 5. API Routes

### 5.1 VPS Management Routes

```javascript
// api/vps.js
'use strict';

const express = require('express');
const router = express.Router();
const { authenticateAgent } = require('../lib/auth');
const { VPSProviderService } = require('../services/vpsProviderService');
const { VPSBillingService } = require('../services/vpsBillingService');
const { validateVPSRequest } = require('../lib/validators');

// Apply authentication to all routes
router.use(authenticateAgent);

/**
 * GET /api/v1/vps/providers
 * List available VPS providers
 */
router.get('/providers', async (req, res) => {
  try {
    const result = await req.db.query(
      'SELECT * FROM vps_providers WHERE status = $1 ORDER BY name',
      ['active']
    );

    res.json({
      success: true,
      data: result.rows.map(provider => ({
        id: provider.id,
        name: provider.name,
        type: provider.provider_type,
        regions: provider.regions,
        flavors: provider.flavors,
        images: provider.images,
        capabilities: provider.capabilities
      }))
    });
  } catch (err) {
    console.error('[VPS API] Error listing providers:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to list providers'
    });
  }
});

/**
 * POST /api/v1/vps/providers/:providerId/configure
 * Configure a VPS provider for the workspace
 */
router.post('/providers/:providerId/configure', validateVPSRequest('configureProvider'), async (req, res) => {
  const { providerId } = req.params;
  const { displayName, region, credentials, quotaLimits, defaultConfig } = req.body;

  try {
    // Encrypt credentials
    const encryptedCredentials = req.cryptoService.encrypt(JSON.stringify(credentials));

    // Insert provider configuration
    const result = await req.db.query(`
      INSERT INTO vps_provider_configs (
        workspace_id, provider_id, display_name, region, 
        encrypted_credentials, quota_limits, default_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      req.workspaceId, providerId, displayName, region,
      encryptedCredentials, JSON.stringify(quotaLimits), JSON.stringify(defaultConfig)
    ]);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        displayName: result.rows[0].display_name,
        region: result.rows[0].region,
        status: result.rows[0].status
      },
      message: 'Provider configured successfully'
    });
  } catch (err) {
    console.error('[VPS API] Error configuring provider:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to configure provider'
    });
  }
});

/**
 * GET /api/v1/vps/instances
 * List VPS instances for workspace
 */
router.get('/instances', async (req, res) => {
  try {
    const { status, provider } = req.query;
    
    let whereClause = 'WHERE workspace_id = $1 AND deleted_at IS NULL';
    const params = [req.workspaceId];
    
    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }
    
    if (provider) {
      params.push(provider);
      whereClause += ` AND provider_config_id = $${params.length}`;
    }

    const result = await req.db.query(`
      SELECT 
        vi.*,
        vpc.display_name as provider_name,
        vpc.region as provider_region,
        array_length(vi.agent_assignments, 1) as agent_count
      FROM vps_instances vi
      JOIN vps_provider_configs vpc ON vi.provider_config_id = vpc.id
      ${whereClause}
      ORDER BY vi.created_at DESC
    `, params);

    res.json({
      success: true,
      data: result.rows,
      meta: {
        total: result.rows.length,
        filters: { status, provider }
      }
    });
  } catch (err) {
    console.error('[VPS API] Error listing instances:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to list instances'
    });
  }
});

/**
 * POST /api/v1/vps/instances
 * Create new VPS instance
 */
router.post('/instances', validateVPSRequest('createInstance'), async (req, res) => {
  const { providerConfigId, name, flavor, image, userData, tags } = req.body;

  try {
    const vpsService = new VPSProviderService(req.db, req.cryptoService);
    
    // Create instance via provider
    const instance = await vpsService.createInstance(req.workspaceId, providerConfigId, {
      name,
      flavor,
      image,
      userData,
      tags: {
        workspace_id: req.workspaceId,
        created_by: req.userId,
        ...tags
      }
    });

    // Store in database
    const result = await req.db.query(`
      INSERT INTO vps_instances (
        workspace_id, provider_config_id, provider_instance_id,
        name, status, flavor, image, public_ip, private_ip,
        region, specifications, cost_per_hour, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      req.workspaceId, providerConfigId, instance.id,
      instance.name, instance.status, instance.flavor, instance.image,
      instance.publicIP, instance.privateIP, instance.region,
      JSON.stringify(instance.metadata.specs), instance.metadata.costPerHour,
      JSON.stringify(instance.metadata)
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'VPS instance created successfully'
    });
  } catch (err) {
    console.error('[VPS API] Error creating instance:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to create instance'
    });
  }
});

/**
 * GET /api/v1/vps/instances/:instanceId
 * Get VPS instance details
 */
router.get('/instances/:instanceId', async (req, res) => {
  const { instanceId } = req.params;

  try {
    const result = await req.db.query(`
      SELECT 
        vi.*,
        vpc.display_name as provider_name,
        vpc.provider_id,
        vp.name as provider_type
      FROM vps_instances vi
      JOIN vps_provider_configs vpc ON vi.provider_config_id = vpc.id
      JOIN vps_providers vp ON vpc.provider_id = vp.id
      WHERE vi.id = $1 AND vi.workspace_id = $2 AND vi.deleted_at IS NULL
    `, [instanceId, req.workspaceId]);

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'VPS instance not found'
      });
    }

    const instance = result.rows[0];
    
    // Get real-time status from provider
    const vpsService = new VPSProviderService(req.db, req.cryptoService);
    const liveStatus = await vpsService.getInstanceStatus(
      req.workspaceId, 
      instance.provider_config_id, 
      instance.provider_instance_id
    );

    // Update database if status changed
    if (liveStatus.status !== instance.status) {
      await req.db.query(
        'UPDATE vps_instances SET status = $1, updated_at = NOW() WHERE id = $2',
        [liveStatus.status, instanceId]
      );
      instance.status = liveStatus.status;
    }

    res.json({
      success: true,
      data: {
        ...instance,
        liveStatus
      }
    });
  } catch (err) {
    console.error('[VPS API] Error getting instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get instance details'
    });
  }
});

/**
 * POST /api/v1/vps/instances/:instanceId/start
 * Start VPS instance
 */
router.post('/instances/:instanceId/start', async (req, res) => {
  const { instanceId } = req.params;

  try {
    const instance = await _getInstanceWithAuth(req.db, instanceId, req.workspaceId);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }

    const vpsService = new VPSProviderService(req.db, req.cryptoService);
    const result = await vpsService.startInstance(
      req.workspaceId,
      instance.provider_config_id,
      instance.provider_instance_id
    );

    // Update status in database
    await req.db.query(
      'UPDATE vps_instances SET status = $1, updated_at = NOW() WHERE id = $2',
      ['active', instanceId]
    );

    res.json({
      success: true,
      data: result,
      message: 'Instance started successfully'
    });
  } catch (err) {
    console.error('[VPS API] Error starting instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to start instance'
    });
  }
});

/**
 * POST /api/v1/vps/instances/:instanceId/stop
 * Stop VPS instance
 */
router.post('/instances/:instanceId/stop', async (req, res) => {
  const { instanceId } = req.params;

  try {
    const instance = await _getInstanceWithAuth(req.db, instanceId, req.workspaceId);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }

    const vpsService = new VPSProviderService(req.db, req.cryptoService);
    const result = await vpsService.stopInstance(
      req.workspaceId,
      instance.provider_config_id,
      instance.provider_instance_id
    );

    // Update status in database
    await req.db.query(
      'UPDATE vps_instances SET status = $1, updated_at = NOW() WHERE id = $2',
      ['stopped', instanceId]
    );

    res.json({
      success: true,
      data: result,
      message: 'Instance stopped successfully'
    });
  } catch (err) {
    console.error('[VPS API] Error stopping instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to stop instance'
    });
  }
});

/**
 * DELETE /api/v1/vps/instances/:instanceId
 * Delete VPS instance
 */
router.delete('/instances/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  const { force } = req.query;

  try {
    const instance = await _getInstanceWithAuth(req.db, instanceId, req.workspaceId);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }

    // Check if agents are still assigned
    if (instance.agent_assignments && instance.agent_assignments.length > 0 && !force) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete instance with assigned agents',
        details: { 
          assignedAgents: instance.agent_assignments,
          hint: 'Use ?force=true to force deletion'
        }
      });
    }

    const vpsService = new VPSProviderService(req.db, req.cryptoService);
    
    // Delete from provider
    await vpsService.deleteInstance(
      req.workspaceId,
      instance.provider_config_id,
      instance.provider_instance_id
    );

    // Soft delete in database
    await req.db.query(
      'UPDATE vps_instances SET status = $1, deleted_at = NOW() WHERE id = $2',
      ['deleted', instanceId]
    );

    // Unassign agents
    await req.db.query(
      'UPDATE agents SET vps_instance_id = NULL, vps_status = $1 WHERE vps_instance_id = $2',
      ['local', instanceId]
    );

    res.json({
      success: true,
      message: 'Instance deleted successfully'
    });
  } catch (err) {
    console.error('[VPS API] Error deleting instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete instance'
    });
  }
});

// Helper function
async function _getInstanceWithAuth(db, instanceId, workspaceId) {
  const result = await db.query(
    'SELECT * FROM vps_instances WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL',
    [instanceId, workspaceId]
  );
  return result.rows[0] || null;
}

module.exports = router;
```

### 5.2 Agent Deployment Routes

```javascript
// api/agents.js - Extended with VPS deployment
'use strict';

const express = require('express');
const router = express.Router();
const { AgentDeploymentService } = require('../services/agentDeploymentService');

/**
 * POST /api/v1/agents/:agentId/deploy
 * Deploy agent to VPS instance
 */
router.post('/:agentId/deploy', async (req, res) => {
  const { agentId } = req.params;
  const { vpsInstanceId, deploymentConfig } = req.body;

  try {
    // Validate agent ownership
    const agent = await req.db.query(
      'SELECT * FROM agents WHERE id = $1 AND workspace_id = $2',
      [agentId, req.workspaceId]
    );

    if (!agent.rows.length) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    // Validate VPS instance
    const instance = await req.db.query(
      'SELECT * FROM vps_instances WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL',
      [vpsInstanceId, req.workspaceId]
    );

    if (!instance.rows.length) {
      return res.status(404).json({ success: false, error: 'VPS instance not found' });
    }

    // Deploy agent
    const deploymentService = new AgentDeploymentService(req.db, req.cryptoService);
    const deployment = await deploymentService.deployAgent(agentId, vpsInstanceId, deploymentConfig);

    // Update agent record
    await req.db.query(`
      UPDATE agents 
      SET vps_instance_id = $1, vps_status = $2, deployment_config = $3, updated_at = NOW()
      WHERE id = $4
    `, [vpsInstanceId, 'provisioning', JSON.stringify(deploymentConfig), agentId]);

    res.json({
      success: true,
      data: {
        deploymentId: deployment.id,
        status: deployment.status,
        agentId,
        vpsInstanceId
      },
      message: 'Agent deployment started'
    });
  } catch (err) {
    console.error('[Agent Deploy] Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to deploy agent'
    });
  }
});

/**
 * GET /api/v1/agents/:agentId/deployment-status
 * Get agent deployment status
 */
router.get('/:agentId/deployment-status', async (req, res) => {
  const { agentId } = req.params;

  try {
    const result = await req.db.query(`
      SELECT 
        a.vps_status,
        a.deployment_config,
        vi.name as vps_instance_name,
        vi.status as vps_status,
        vi.public_ip,
        vd.status as last_deployment_status,
        vd.completed_at as last_deployment_time,
        vd.error_message
      FROM agents a
      LEFT JOIN vps_instances vi ON a.vps_instance_id = vi.id
      LEFT JOIN vps_deployments vd ON vd.agent_id = a.id
      WHERE a.id = $1 AND a.workspace_id = $2
      ORDER BY vd.created_at DESC
      LIMIT 1
    `, [agentId, req.workspaceId]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[Agent Deploy Status] Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get deployment status'
    });
  }
});

module.exports = router;
```

---

## 6. Security

### 6.1 Credential Encryption

```javascript
// services/vpsSecurityService.js
'use strict';

const { CryptoService } = require('./crypto');

/**
 * VPS Security Service
 * Handles credential encryption, access control, and security groups
 */
class VPSSecurityService {
  constructor(cryptoService) {
    this.crypto = cryptoService;
  }

  /**
   * Encrypt VPS provider credentials
   */
  encryptCredentials(credentials) {
    const credentialString = JSON.stringify(credentials);
    return this.crypto.encrypt(credentialString);
  }

  /**
   * Decrypt VPS provider credentials
   */
  decryptCredentials(encryptedCredentials) {
    const decrypted = this.crypto.decrypt(encryptedCredentials);
    return JSON.parse(decrypted);
  }

  /**
   * Generate secure VPS deployment token
   * Used for agent-to-vps authentication
   */
  generateDeploymentToken(agentId, vpsInstanceId, workspaceId) {
    const payload = {
      agentId,
      vpsInstanceId,
      workspaceId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    return this.crypto.encryptObject(payload);
  }

  /**
   * Validate deployment token
   */
  validateDeploymentToken(token) {
    try {
      const payload = this.crypto.decryptObject(token);
      
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (err) {
      throw new Error('Invalid deployment token');
    }
  }

  /**
   * Generate standard security group rules for Vutler agents
   */
  getStandardSecurityRules() {
    return {
      vutler_agent_default: [
        {
          direction: 'ingress',
          protocol: 'tcp',
          port: 22,
          cidr: '0.0.0.0/0',
          description: 'SSH access'
        },
        {
          direction: 'ingress',
          protocol: 'tcp',
          port: 3001,
          cidr: '0.0.0.0/0',
          description: 'Vutler Agent API'
        },
        {
          direction: 'ingress',
          protocol: 'tcp',
          port: 443,
          cidr: '0.0.0.0/0',
          description: 'HTTPS'
        },
        {
          direction: 'egress',
          protocol: 'all',
          cidr: '0.0.0.0/0',
          description: 'All outbound traffic'
        }
      ],
      
      vutler_agent_restricted: [
        {
          direction: 'ingress',
          protocol: 'tcp',
          port: 22,
          cidr: '83.228.222.180/32',
          description: 'SSH from Vutler platform only'
        },
        {
          direction: 'ingress',
          protocol: 'tcp',
          port: 3001,
          cidr: '83.228.222.180/32',
          description: 'Agent API from Vutler platform only'
        },
        {
          direction: 'egress',
          protocol: 'tcp',
          port: 443,
          cidr: '0.0.0.0/0',
          description: 'HTTPS outbound'
        },
        {
          direction: 'egress',
          protocol: 'tcp',
          port: 80,
          cidr: '0.0.0.0/0',
          description: 'HTTP outbound'
        }
      ]
    };
  }

  /**
   * Validate workspace VPS quota
   */
  async validateQuota(db, workspaceId, requestedAction) {
    const workspace = await db.query(
      'SELECT vps_quota FROM workspaces WHERE id = $1',
      [workspaceId]
    );

    if (!workspace.rows.length) {
      throw new Error('Workspace not found');
    }

    const quota = workspace.rows[0].vps_quota;
    
    if (requestedAction.type === 'create_instance') {
      // Check instance count limit
      const instanceCount = await db.query(
        'SELECT COUNT(*) as count FROM vps_instances WHERE workspace_id = $1 AND deleted_at IS NULL',
        [workspaceId]
      );

      if (parseInt(instanceCount.rows[0].count) >= quota.max_instances) {
        throw new Error(`Instance quota exceeded: ${quota.max_instances} instances maximum`);
      }

      // Check monthly cost limit (simplified)
      const monthlyCost = await this._estimateMonthlyCost(db, workspaceId, requestedAction.flavor);
      if (monthlyCost > quota.max_cost_per_month) {
        throw new Error(`Monthly cost quota exceeded: ${quota.max_cost_per_month} CHF maximum`);
      }
    }

    return true;
  }

  async _estimateMonthlyCost(db, workspaceId, flavor) {
    // Get current month usage
    const currentUsage = await db.query(`
      SELECT SUM(cost_total) as total_cost
      FROM vps_usage_records
      WHERE workspace_id = $1 
        AND usage_date >= date_trunc('month', CURRENT_DATE)
    `, [workspaceId]);

    // Estimate new instance cost (30 days * 24 hours * hourly rate)
    const flavorCost = this._getFlavorCost(flavor); // CHF per hour
    const estimatedNewCost = flavorCost * 24 * 30;

    const currentCost = parseFloat(currentUsage.rows[0].total_cost) || 0;
    return currentCost + estimatedNewCost;
  }

  _getFlavorCost(flavor) {
    // Cost mapping for different flavors
    const costMap = {
      'a2-ram4-disk20': 0.0224, // CHF per hour
      'a4-ram8-disk50': 0.0448,
      'a8-ram16-disk100': 0.0896
    };

    return costMap[flavor] || 0.05; // Default fallback
  }
}

module.exports = VPSSecurityService;
```

### 6.2 Firewall Configuration

```javascript
// services/vpsFirewallService.js
'use strict';

/**
 * VPS Firewall Service
 * Manages security groups and firewall rules across providers
 */
class VPSFirewallService {
  constructor(vpsProviderService) {
    this.providerService = vpsProviderService;
  }

  async setupStandardFirewall(workspaceId, vpsInstanceId, securityProfile = 'default') {
    const instance = await this._getInstance(workspaceId, vpsInstanceId);
    const provider = await this.providerService.getProvider(workspaceId, instance.provider_config_id);

    const rules = this._getSecurityRules(securityProfile);
    
    try {
      // Create security group
      const securityGroup = await provider.createSecurityGroup({
        name: `vutler-${instance.name}-${securityProfile}`,
        description: `Vutler agent security group - ${securityProfile}`,
        rules: rules
      });

      // Attach to instance
      await provider.attachSecurityGroup(instance.provider_instance_id, securityGroup.id);

      // Update database
      await this._updateInstanceSecurity(vpsInstanceId, {
        securityGroupId: securityGroup.id,
        securityProfile,
        firewallRules: rules
      });

      return {
        securityGroupId: securityGroup.id,
        rules: rules,
        status: 'configured'
      };
    } catch (error) {
      console.error('[VPSFirewall] Error setting up firewall:', error);
      throw error;
    }
  }

  _getSecurityRules(profile) {
    const ruleSet = {
      default: [
        { protocol: 'tcp', port: 22, source: '0.0.0.0/0' },      // SSH
        { protocol: 'tcp', port: 3001, source: '0.0.0.0/0' },   // Agent API
        { protocol: 'tcp', port: 443, source: '0.0.0.0/0' },    // HTTPS
      ],
      
      restricted: [
        { protocol: 'tcp', port: 22, source: '83.228.222.180/32' },    // SSH from Vutler only
        { protocol: 'tcp', port: 3001, source: '83.228.222.180/32' },  // Agent API from Vutler only
      ],
      
      development: [
        { protocol: 'tcp', port: 22, source: '0.0.0.0/0' },
        { protocol: 'tcp', port: 3001, source: '0.0.0.0/0' },
        { protocol: 'tcp', port: 8080, source: '0.0.0.0/0' },   // Dev server
        { protocol: 'tcp', port: 9229, source: '0.0.0.0/0' },   // Node.js debug
      ]
    };

    return ruleSet[profile] || ruleSet.default;
  }
}

module.exports = VPSFirewallService;
```

---

## 7. Billing Integration

### 7.1 Usage Tracking Service

```javascript
// services/vpsBillingService.js
'use strict';

/**
 * VPS Billing Service
 * Tracks usage, calculates costs, and manages billing integration
 */
class VPSBillingService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Daily usage tracking job
   * Should run via cron job daily
   */
  async trackDailyUsage(date = new Date()) {
    const targetDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`[VPSBilling] Tracking usage for ${targetDate}`);

    try {
      // Get all active instances for the date
      const instances = await this.db.query(`
        SELECT 
          vi.*,
          vpc.region,
          vp.provider_type
        FROM vps_instances vi
        JOIN vps_provider_configs vpc ON vi.provider_config_id = vpc.id
        JOIN vps_providers vp ON vpc.provider_id = vp.id
        WHERE vi.created_at::date <= $1 
          AND (vi.deleted_at IS NULL OR vi.deleted_at::date > $1)
          AND vi.status != 'deleted'
      `, [targetDate]);

      for (const instance of instances.rows) {
        await this._trackInstanceUsage(instance, targetDate);
      }

      console.log(`[VPSBilling] Completed tracking for ${instances.rows.length} instances`);
    } catch (error) {
      console.error('[VPSBilling] Error tracking daily usage:', error);
      throw error;
    }
  }

  async _trackInstanceUsage(instance, date) {
    try {
      // Check if usage already recorded
      const existing = await this.db.query(
        'SELECT id FROM vps_usage_records WHERE vps_instance_id = $1 AND usage_date = $2',
        [instance.id, date]
      );

      if (existing.rows.length > 0) {
        console.log(`[VPSBilling] Usage already recorded for ${instance.name} on ${date}`);
        return;
      }

      // Calculate hours active for the day
      const hoursActive = await this._calculateHoursActive(instance, date);
      
      // Calculate cost
      const costPerHour = instance.cost_per_hour || 0;
      const totalCost = hoursActive * costPerHour;

      // Determine currency based on provider region
      const currency = this._getCurrency(instance.region);

      // Insert usage record
      await this.db.query(`
        INSERT INTO vps_usage_records (
          vps_instance_id, workspace_id, usage_date, hours_active,
          cost_total, currency, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        instance.id,
        instance.workspace_id,
        date,
        hoursActive,
        totalCost,
        currency,
        JSON.stringify({
          flavor: instance.flavor,
          region: instance.region,
          cost_per_hour: costPerHour
        })
      ]);

      console.log(`[VPSBilling] Recorded usage for ${instance.name}: ${hoursActive}h @ ${costPerHour}/h = ${totalCost} ${currency}`);
    } catch (error) {
      console.error(`[VPSBilling] Error tracking usage for instance ${instance.id}:`, error);
    }
  }

  async _calculateHoursActive(instance, date) {
    // Simple calculation - in production, this would be more sophisticated
    // based on actual start/stop times throughout the day
    
    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd = new Date(`${date}T23:59:59Z`);
    const instanceCreated = new Date(instance.created_at);
    const instanceDeleted = instance.deleted_at ? new Date(instance.deleted_at) : null;

    // Determine active period for this day
    const activeStart = instanceCreated > dayStart ? instanceCreated : dayStart;
    const activeEnd = instanceDeleted && instanceDeleted < dayEnd ? instanceDeleted : dayEnd;

    if (activeStart >= activeEnd) {
      return 0; // Not active on this day
    }

    const activeMs = activeEnd.getTime() - activeStart.getTime();
    const activeHours = activeMs / (1000 * 60 * 60);
    
    return Math.min(24, Math.max(0, activeHours)); // Cap at 24 hours
  }

  _getCurrency(region) {
    // Map regions to currencies
    const currencyMap = {
      'ch-geneva-1': 'CHF',    // Switzerland
      'de-': 'EUR',            // Germany/EU
      'us-': 'USD',            // US
      'eu-': 'EUR'             // EU
    };

    for (const [prefix, currency] of Object.entries(currencyMap)) {
      if (region.startsWith(prefix)) {
        return currency;
      }
    }

    return 'CHF'; // Default fallback
  }

  /**
   * Generate workspace billing summary
   */
  async generateBillingSummary(workspaceId, month, year) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

    const summary = await this.db.query(`
      SELECT 
        vur.currency,
        SUM(vur.cost_total) as total_cost,
        SUM(vur.hours_active) as total_hours,
        COUNT(DISTINCT vur.vps_instance_id) as instance_count,
        array_agg(DISTINCT vi.name) as instance_names
      FROM vps_usage_records vur
      JOIN vps_instances vi ON vur.vps_instance_id = vi.id
      WHERE vur.workspace_id = $1
        AND vur.usage_date >= $2
        AND vur.usage_date <= $3
        AND vur.status = 'active'
      GROUP BY vur.currency
    `, [workspaceId, startDate, endDate]);

    const details = await this.db.query(`
      SELECT 
        vi.name as instance_name,
        vi.flavor,
        vi.region,
        SUM(vur.hours_active) as hours_active,
        SUM(vur.cost_total) as cost_total,
        vur.currency,
        AVG(cast(vur.metadata->>'cost_per_hour' as decimal)) as avg_cost_per_hour
      FROM vps_usage_records vur
      JOIN vps_instances vi ON vur.vps_instance_id = vi.id
      WHERE vur.workspace_id = $1
        AND vur.usage_date >= $2
        AND vur.usage_date <= $3
        AND vur.status = 'active'
      GROUP BY vi.id, vi.name, vi.flavor, vi.region, vur.currency
      ORDER BY cost_total DESC
    `, [workspaceId, startDate, endDate]);

    return {
      period: { month, year, startDate, endDate },
      summary: summary.rows,
      details: details.rows,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Export billing data for external accounting systems
   */
  async exportBillingData(workspaceId, month, year, format = 'json') {
    const billingData = await this.generateBillingSummary(workspaceId, month, year);

    if (format === 'csv') {
      return this._exportToCSV(billingData);
    }

    return billingData;
  }

  _exportToCSV(billingData) {
    const csvHeader = 'Instance,Flavor,Region,Hours Active,Cost Total,Currency,Cost Per Hour\n';
    const csvRows = billingData.details.map(row => 
      `"${row.instance_name}","${row.flavor}","${row.region}",${row.hours_active},${row.cost_total},"${row.currency}",${row.avg_cost_per_hour}`
    ).join('\n');

    return csvHeader + csvRows;
  }
}

module.exports = VPSBillingService;
```

---

## 8. Agent Deployment Flow

### 8.1 Deployment Service

```javascript
// services/agentDeploymentService.js
'use strict';

const { VPSSecurityService } = require('./vpsSecurityService');

/**
 * Agent Deployment Service
 * Handles deployment of Vutler agents to VPS instances
 */
class AgentDeploymentService {
  constructor(db, cryptoService) {
    this.db = db;
    this.crypto = cryptoService;
    this.security = new VPSSecurityService(cryptoService);
  }

  /**
   * Deploy agent to VPS instance
   */
  async deployAgent(agentId, vpsInstanceId, deploymentConfig = {}) {
    console.log(`[AgentDeploy] Starting deployment of agent ${agentId} to VPS ${vpsInstanceId}`);

    try {
      // Get agent details
      const agent = await this._getAgent(agentId);
      const vpsInstance = await this._getVPSInstance(vpsInstanceId);

      // Generate deployment token
      const deploymentToken = this.security.generateDeploymentToken(
        agentId, 
        vpsInstanceId, 
        agent.workspace_id
      );

      // Create deployment record
      const deployment = await this._createDeploymentRecord(agentId, vpsInstanceId, 'agent_install');

      // Generate cloud-init script
      const cloudInitScript = this._generateCloudInitScript(agent, vpsInstance, deploymentToken, deploymentConfig);

      // Execute deployment
      await this._executeDeployment(vpsInstance, cloudInitScript, deployment.id);

      console.log(`[AgentDeploy] Deployment initiated with ID: ${deployment.id}`);
      return deployment;

    } catch (error) {
      console.error('[AgentDeploy] Deployment failed:', error);
      throw error;
    }
  }

  async _getAgent(agentId) {
    const result = await this.db.query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
    
    if (!result.rows.length) {
      throw new Error('Agent not found');
    }
    
    return result.rows[0];
  }

  async _getVPSInstance(vpsInstanceId) {
    const result = await this.db.query(
      'SELECT * FROM vps_instances WHERE id = $1 AND deleted_at IS NULL',
      [vpsInstanceId]
    );
    
    if (!result.rows.length) {
      throw new Error('VPS instance not found');
    }
    
    return result.rows[0];
  }

  async _createDeploymentRecord(agentId, vpsInstanceId, deploymentType) {
    const result = await this.db.query(`
      INSERT INTO vps_deployments (
        vps_instance_id, agent_id, deployment_type, status, started_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [vpsInstanceId, agentId, deploymentType, 'pending']);

    return result.rows[0];
  }

  _generateCloudInitScript(agent, vpsInstance, deploymentToken, config) {
    const script = `#!/bin/bash
# Vutler Agent Deployment Script
# Agent: ${agent.name} (${agent.id})
# VPS: ${vpsInstance.name} (${vpsInstance.id})
# Generated: ${new Date().toISOString()}

set -e
exec > >(tee /var/log/vutler-deployment.log) 2>&1

echo "=== Vutler Agent Deployment Started ==="
echo "Timestamp: $(date)"
echo "Agent ID: ${agent.id}"
echo "VPS Instance: ${vpsInstance.name}"

# System update
echo "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# Install essential packages
echo "Installing dependencies..."
apt-get install -y \\
  curl \\
  wget \\
  unzip \\
  git \\
  htop \\
  ufw \\
  supervisor \\
  nginx \\
  certbot \\
  python3-certbot-nginx

# Install Node.js 20
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Docker
echo "Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu

# Configure firewall
echo "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 3001
ufw --force enable

# Create vutler user
echo "Creating vutler user..."
useradd -m -s /bin/bash vutler
usermod -aG docker vutler
mkdir -p /home/vutler/.ssh
cp /home/ubuntu/.ssh/authorized_keys /home/vutler/.ssh/
chown -R vutler:vutler /home/vutler/.ssh
chmod 700 /home/vutler/.ssh
chmod 600 /home/vutler/.ssh/authorized_keys

# Create application directory
echo "Setting up application directory..."
mkdir -p /opt/vutler
chown vutler:vutler /opt/vutler

# Download and install Vutler Agent Runtime
echo "Downloading Vutler Agent Runtime..."
cd /opt/vutler
sudo -u vutler wget -O agent-runtime.tar.gz "https://releases.vutler.ai/agent-runtime/latest.tar.gz"
sudo -u vutler tar -xzf agent-runtime.tar.gz
rm agent-runtime.tar.gz

# Set up environment configuration
echo "Configuring agent environment..."
sudo -u vutler cat > /opt/vutler/.env << 'ENV_EOF'
# Vutler Agent Runtime Configuration
NODE_ENV=production
PORT=3001
AGENT_ID=${agent.id}
WORKSPACE_ID=${agent.workspace_id}
DEPLOYMENT_TOKEN=${deploymentToken}

# Vutler Platform Connection
VUTLER_API_URL=https://app.vutler.ai/api/v1
VUTLER_WS_URL=wss://app.vutler.ai/ws

# Agent Configuration
AGENT_NAME=${agent.name}
AGENT_DESCRIPTION=${agent.description || 'Deployed agent'}
AGENT_SKILLS=${JSON.stringify(agent.skills || [])}

# Logging
LOG_LEVEL=${config.logLevel || 'info'}
LOG_FILE=/var/log/vutler/agent.log

# Custom Configuration
${config.customEnvVars || ''}
ENV_EOF

# Install agent dependencies
echo "Installing agent dependencies..."
cd /opt/vutler
sudo -u vutler npm install --production

# Set up logging directory
mkdir -p /var/log/vutler
chown vutler:vutler /var/log/vutler

# Configure supervisor for process management
echo "Setting up process management..."
cat > /etc/supervisor/conf.d/vutler-agent.conf << 'SUPERVISOR_EOF'
[program:vutler-agent]
command=/usr/bin/node /opt/vutler/index.js
directory=/opt/vutler
user=vutler
autostart=true
autorestart=true
stdout_logfile=/var/log/vutler/agent-stdout.log
stderr_logfile=/var/log/vutler/agent-stderr.log
environment=NODE_ENV=production
SUPERVISOR_EOF

# Configure nginx reverse proxy
echo "Setting up nginx reverse proxy..."
cat > /etc/nginx/sites-available/vutler-agent << 'NGINX_EOF'
server {
    listen 80;
    server_name ${vpsInstance.public_ip || '_'};

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
    }

    # Agent API (protected)
    location /api {
        proxy_pass http://localhost:3001/api;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        
        # Basic authentication or API key validation
        # This will be implemented in the agent runtime
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
    }

    # Default deny
    location / {
        return 404;
    }
}
NGINX_EOF

# Enable nginx site
ln -sf /etc/nginx/sites-available/vutler-agent /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# Start services
echo "Starting services..."
supervisorctl reread
supervisorctl update
supervisorctl start vutler-agent

# Wait for agent to start
echo "Waiting for agent to start..."
sleep 30

# Health check
echo "Performing health check..."
if curl -f http://localhost:3001/health; then
    echo "✓ Agent health check passed"
else
    echo "✗ Agent health check failed"
    supervisorctl status vutler-agent
    tail -50 /var/log/vutler/agent-stderr.log
fi

# Register agent with Vutler platform
echo "Registering agent with platform..."
curl -X POST "https://app.vutler.ai/api/v1/agents/${agent.id}/vps-deployed" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${deploymentToken}" \\
  -d '{
    "vps_instance_id": "${vpsInstance.id}",
    "public_ip": "${vpsInstance.public_ip}",
    "private_ip": "${vpsInstance.private_ip}",
    "deployment_status": "completed",
    "health_endpoint": "http://${vpsInstance.public_ip}/health"
  }' || echo "⚠ Failed to register with platform (will retry automatically)"

# Set up SSL certificate (if public IP available)
${vpsInstance.public_ip ? `
echo "Setting up SSL certificate..."
certbot --nginx --non-interactive --agree-tos --email admin@vutler.ai -d ${vpsInstance.public_ip}
` : '# Skipping SSL setup - no public IP'}

# Custom deployment steps
${config.customScript || '# No custom deployment steps'}

# Create status file
echo "completed" > /opt/vutler/deployment-status
echo "Deployment completed at: $(date)" >> /opt/vutler/deployment-status

echo "=== Vutler Agent Deployment Completed Successfully ==="
echo "Agent URL: http://${vpsInstance.public_ip || vpsInstance.private_ip}"
echo "Health Check: curl http://${vpsInstance.public_ip || vpsInstance.private_ip}/health"
echo "Logs: tail -f /var/log/vutler/agent.log"
`;

    return script;
  }

  async _executeDeployment(vpsInstance, script, deploymentId) {
    // Update deployment status
    await this.db.query(
      'UPDATE vps_deployments SET status = $1, script_hash = $2 WHERE id = $3',
      ['running', this._hashScript(script), deploymentId]
    );

    try {
      // In a real implementation, this would execute the cloud-init script
      // on the VPS instance via SSH or the provider's API
      
      // For now, we'll simulate the deployment
      console.log('[AgentDeploy] Executing deployment script...');
      
      // Mark as completed (in real implementation, this would be based on actual execution)
      await this.db.query(
        'UPDATE vps_deployments SET status = $1, completed_at = NOW() WHERE id = $2',
        ['completed', deploymentId]
      );

    } catch (error) {
      // Mark as failed
      await this.db.query(
        'UPDATE vps_deployments SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
        ['failed', error.message, deploymentId]
      );
      throw error;
    }
  }

  _hashScript(script) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(script).digest('hex');
  }

  /**
   * Monitor deployment status
   */
  async getDeploymentStatus(deploymentId) {
    const result = await this.db.query(
      'SELECT * FROM vps_deployments WHERE id = $1',
      [deploymentId]
    );

    if (!result.rows.length) {
      throw new Error('Deployment not found');
    }

    return result.rows[0];
  }

  /**
   * Update agent status after successful deployment
   */
  async markAgentDeployed(agentId, vpsInstanceId, healthEndpoint) {
    await this.db.query(`
      UPDATE agents 
      SET vps_status = $1, deployment_config = deployment_config || $2, updated_at = NOW()
      WHERE id = $3
    `, [
      'deployed',
      JSON.stringify({
        deployed_at: new Date().toISOString(),
        health_endpoint: healthEndpoint,
        deployment_version: '1.0'
      }),
      agentId
    ]);

    // Update VPS instance with agent assignment
    await this.db.query(`
      UPDATE vps_instances 
      SET agent_assignments = array_append(
        COALESCE(agent_assignments, '[]'::jsonb), 
        $1::jsonb
      ),
      updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify({ agent_id: agentId, assigned_at: new Date().toISOString() }), vpsInstanceId]);
  }
}

module.exports = AgentDeploymentService;
```

### 8.2 Agent Runtime Bootstrap

```javascript
// Agent Runtime Bootstrap Template
// This gets deployed to VPS instances as part of the agent runtime

// /opt/vutler/index.js (on VPS)
'use strict';

const express = require('express');
const WebSocket = require('ws');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3001;

// Environment validation
const requiredEnvVars = ['AGENT_ID', 'WORKSPACE_ID', 'DEPLOYMENT_TOKEN', 'VUTLER_API_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Required environment variable ${envVar} is missing`);
    process.exit(1);
  }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agent_id: process.env.AGENT_ID,
    workspace_id: process.env.WORKSPACE_ID,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Agent status endpoint
app.get('/api/status', authenticateRequest, (req, res) => {
  res.json({
    agent: {
      id: process.env.AGENT_ID,
      name: process.env.AGENT_NAME,
      status: 'running',
      deployment: {
        version: process.env.DEPLOYMENT_VERSION || '1.0',
        deployed_at: process.env.DEPLOYED_AT,
        environment: process.env.NODE_ENV
      }
    },
    system: {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid,
      platform: process.platform,
      arch: process.arch
    }
  });
});

// Proxy agent API calls to main Vutler platform
app.use('/api/agents', authenticateRequest, createProxyMiddleware({
  target: process.env.VUTLER_API_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api/agents': `/api/v1/agents/${process.env.AGENT_ID}`
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('Authorization', `Bearer ${process.env.DEPLOYMENT_TOKEN}`);
    proxyReq.setHeader('X-VPS-Agent', 'true');
    proxyReq.setHeader('X-Agent-ID', process.env.AGENT_ID);
    proxyReq.setHeader('X-Workspace-ID', process.env.WORKSPACE_ID);
  }
}));

// WebSocket connection to Vutler platform
const wsUrl = process.env.VUTLER_WS_URL + '/agent-ws';
let platformWS = null;

function connectToPlatform() {
  console.log('[VPS Agent] Connecting to Vutler platform...');
  
  platformWS = new WebSocket(wsUrl, {
    headers: {
      'Authorization': `Bearer ${process.env.DEPLOYMENT_TOKEN}`,
      'X-Agent-ID': process.env.AGENT_ID,
      'X-Workspace-ID': process.env.WORKSPACE_ID
    }
  });

  platformWS.on('open', () => {
    console.log('[VPS Agent] Connected to Vutler platform');
    
    // Send initial registration
    platformWS.send(JSON.stringify({
      type: 'agent_register',
      agent_id: process.env.AGENT_ID,
      vps_deployment: true,
      capabilities: ['chat', 'api', 'tools']
    }));
  });

  platformWS.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handlePlatformMessage(message);
    } catch (err) {
      console.error('[VPS Agent] Error parsing platform message:', err);
    }
  });

  platformWS.on('close', () => {
    console.log('[VPS Agent] Disconnected from platform, reconnecting in 5s...');
    setTimeout(connectToPlatform, 5000);
  });

  platformWS.on('error', (err) => {
    console.error('[VPS Agent] WebSocket error:', err);
  });
}

function handlePlatformMessage(message) {
  console.log('[VPS Agent] Received message:', message.type);

  switch (message.type) {
    case 'agent_task':
      // Handle agent task execution
      processAgentTask(message.task);
      break;
      
    case 'health_check':
      // Respond to health check
      platformWS.send(JSON.stringify({
        type: 'health_response',
        agent_id: process.env.AGENT_ID,
        status: 'healthy',
        timestamp: new Date().toISOString()
      }));
      break;
      
    case 'config_update':
      // Handle configuration updates
      updateAgentConfig(message.config);
      break;
      
    default:
      console.warn('[VPS Agent] Unknown message type:', message.type);
  }
}

function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  
  // Simple authentication - in production, this would be more robust
  if (authHeader === `Bearer ${process.env.DEPLOYMENT_TOKEN}` || 
      apiKey === process.env.API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[VPS Agent] Server running on port ${PORT}`);
  console.log(`[VPS Agent] Agent ID: ${process.env.AGENT_ID}`);
  console.log(`[VPS Agent] Health check: http://localhost:${PORT}/health`);
  
  // Connect to platform after server starts
  setTimeout(connectToPlatform, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[VPS Agent] Graceful shutdown initiated');
  if (platformWS) {
    platformWS.close();
  }
  process.exit(0);
});
```

---

## 9. Monitoring

### 9.1 VPS Monitoring Service

```javascript
// services/vpsMonitoringService.js
'use strict';

/**
 * VPS Monitoring Service
 * Handles health checks, status synchronization, and auto-restart functionality
 */
class VPSMonitoringService {
  constructor(db, vpsProviderService) {
    this.db = db;
    this.providerService = vpsProviderService;
    this.monitoring = new Map(); // Active monitoring sessions
  }

  /**
   * Start monitoring all active VPS instances
   */
  async startMonitoring() {
    console.log('[VPSMonitor] Starting VPS monitoring service...');

    try {
      // Get all active VPS instances
      const instances = await this.db.query(`
        SELECT vi.*, vpc.workspace_id
        FROM vps_instances vi
        JOIN vps_provider_configs vpc ON vi.provider_config_id = vpc.id
        WHERE vi.status IN ('active', 'creating') 
          AND vi.deleted_at IS NULL
      `);

      for (const instance of instances.rows) {
        this.startInstanceMonitoring(instance);
      }

      // Set up periodic sync
      this.syncInterval = setInterval(() => {
        this.syncAllInstances();
      }, 60000); // Every minute

      console.log(`[VPSMonitor] Monitoring started for ${instances.rows.length} instances`);
    } catch (error) {
      console.error('[VPSMonitor] Failed to start monitoring:', error);
    }
  }

  /**
   * Start monitoring a specific instance
   */
  startInstanceMonitoring(instance) {
    if (this.monitoring.has(instance.id)) {
      console.log(`[VPSMonitor] Instance ${instance.name} already being monitored`);
      return;
    }

    console.log(`[VPSMonitor] Starting monitoring for instance ${instance.name}`);

    const monitoringConfig = {
      instanceId: instance.id,
      name: instance.name,
      workspaceId: instance.workspace_id,
      providerConfigId: instance.provider_config_id,
      providerInstanceId: instance.provider_instance_id,
      healthEndpoint: this._getHealthEndpoint(instance),
      lastHealthCheck: null,
      lastStatusSync: null,
      healthFailures: 0,
      maxHealthFailures: 3
    };

    // Start health checking interval
    monitoringConfig.healthInterval = setInterval(() => {
      this.performHealthCheck(monitoringConfig);
    }, 30000); // Every 30 seconds

    this.monitoring.set(instance.id, monitoringConfig);
  }

  /**
   * Stop monitoring a specific instance
   */
  stopInstanceMonitoring(instanceId) {
    const config = this.monitoring.get(instanceId);
    if (config) {
      if (config.healthInterval) {
        clearInterval(config.healthInterval);
      }
      this.monitoring.delete(instanceId);
      console.log(`[VPSMonitor] Stopped monitoring instance ${config.name}`);
    }
  }

  /**
   * Perform health check on an instance
   */
  async performHealthCheck(config) {
    try {
      const isHealthy = await this._checkInstanceHealth(config);
      
      if (isHealthy) {
        config.healthFailures = 0;
        config.lastHealthCheck = new Date();
        
        // Update health status in database
        await this.db.query(`
          UPDATE vps_instances 
          SET metadata = metadata || $1
          WHERE id = $2
        `, [
          JSON.stringify({ 
            last_health_check: config.lastHealthCheck.toISOString(),
            health_status: 'healthy'
          }),
          config.instanceId
        ]);
      } else {
        config.healthFailures++;
        console.warn(`[VPSMonitor] Health check failed for ${config.name} (${config.healthFailures}/${config.maxHealthFailures})`);
        
        if (config.healthFailures >= config.maxHealthFailures) {
          await this._handleUnhealthyInstance(config);
        }
      }
    } catch (error) {
      console.error(`[VPSMonitor] Error during health check for ${config.name}:`, error);
      config.healthFailures++;
    }
  }

  async _checkInstanceHealth(config) {
    try {
      // Check provider-level instance status
      const providerStatus = await this.providerService.getInstanceStatus(
        config.workspaceId,
        config.providerConfigId,
        config.providerInstanceId
      );

      if (providerStatus.status !== 'active') {
        console.log(`[VPSMonitor] Provider reports ${config.name} as ${providerStatus.status}`);
        return false;
      }

      // Check agent health endpoint if available
      if (config.healthEndpoint) {
        const response = await fetch(config.healthEndpoint, {
          timeout: 10000,
          method: 'GET'
        });

        if (response.ok) {
          const healthData = await response.json();
          return healthData.status === 'healthy';
        }
      }

      return true; // Provider is healthy, assume agent is ok if no health endpoint
    } catch (error) {
      console.error(`[VPSMonitor] Health check error for ${config.name}:`, error);
      return false;
    }
  }

  async _handleUnhealthyInstance(config) {
    console.error(`[VPSMonitor] Instance ${config.name} is unhealthy, attempting recovery...`);

    try {
      // Log the incident
      await this.db.query(`
        INSERT INTO vps_deployments (
          vps_instance_id, deployment_type, status, error_message, started_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [
        config.instanceId,
        'health_recovery',
        'running',
        `Health check failed ${config.healthFailures} times`
      ]);

      // Attempt to restart the instance
      await this.providerService.startInstance(
        config.workspaceId,
        config.providerConfigId,
        config.providerInstanceId
      );

      // Reset failure counter and wait for recovery
      config.healthFailures = 0;
      console.log(`[VPSMonitor] Recovery initiated for ${config.name}`);

    } catch (error) {
      console.error(`[VPSMonitor] Recovery failed for ${config.name}:`, error);
      
      // Mark instance as error state
      await this.db.query(
        'UPDATE vps_instances SET status = $1 WHERE id = $2',
        ['error', config.instanceId]
      );

      // Notify workspace administrators
      await this._notifyHealthIssue(config, error);
    }
  }

  /**
   * Sync status of all monitored instances with providers
   */
  async syncAllInstances() {
    console.log('[VPSMonitor] Performing status sync for all instances...');

    for (const [instanceId, config] of this.monitoring) {
      try {
        await this._syncInstanceStatus(config);
      } catch (error) {
        console.error(`[VPSMonitor] Failed to sync ${config.name}:`, error);
      }
    }
  }

  async _syncInstanceStatus(config) {
    try {
      // Get current status from provider
      const providerStatus = await this.providerService.getInstanceStatus(
        config.workspaceId,
        config.providerConfigId,
        config.providerInstanceId
      );

      // Get current status from database
      const dbResult = await this.db.query(
        'SELECT status, public_ip, private_ip FROM vps_instances WHERE id = $1',
        [config.instanceId]
      );

      if (!dbResult.rows.length) {
        console.warn(`[VPSMonitor] Instance ${config.name} not found in database`);
        this.stopInstanceMonitoring(config.instanceId);
        return;
      }

      const dbInstance = dbResult.rows[0];

      // Check if status or IPs have changed
      const statusChanged = dbInstance.status !== providerStatus.status;
      const ipChanged = dbInstance.public_ip !== providerStatus.publicIP || 
                       dbInstance.private_ip !== providerStatus.privateIP;

      if (statusChanged || ipChanged) {
        console.log(`[VPSMonitor] Updating ${config.name}: status ${dbInstance.status} → ${providerStatus.status}`);

        await this.db.query(`
          UPDATE vps_instances 
          SET status = $1, public_ip = $2, private_ip = $3, updated_at = NOW()
          WHERE id = $4
        `, [
          providerStatus.status,
          providerStatus.publicIP,
          providerStatus.privateIP,
          config.instanceId
        ]);

        // Update health endpoint if IP changed
        if (ipChanged && providerStatus.publicIP) {
          config.healthEndpoint = `http://${providerStatus.publicIP}/health`;
        }
      }

      config.lastStatusSync = new Date();
    } catch (error) {
      console.error(`[VPSMonitor] Status sync failed for ${config.name}:`, error);
    }
  }

  _getHealthEndpoint(instance) {
    const ip = instance.public_ip || instance.private_ip;
    return ip ? `http://${ip}/health` : null;
  }

  async _notifyHealthIssue(config, error) {
    // In a real implementation, this would send notifications
    // via email, Slack, webhooks, etc.
    console.error(`[VPSMonitor] ALERT: Instance ${config.name} requires attention`);
    console.error(`[VPSMonitor] Error: ${error.message}`);
    
    // Log to database for dashboard display
    await this.db.query(`
      INSERT INTO system_alerts (
        workspace_id, alert_type, severity, message, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      config.workspaceId,
      'vps_health_failure',
      'high',
      `VPS instance ${config.name} health check failed`,
      JSON.stringify({
        instance_id: config.instanceId,
        failure_count: config.healthFailures,
        error: error.message
      })
    ]);
  }

  /**
   * Get monitoring status for all instances
   */
  getMonitoringStatus() {
    const status = [];
    
    for (const [instanceId, config] of this.monitoring) {
      status.push({
        instanceId: config.instanceId,
        name: config.name,
        lastHealthCheck: config.lastHealthCheck,
        lastStatusSync: config.lastStatusSync,
        healthFailures: config.healthFailures,
        isHealthy: config.healthFailures === 0
      });
    }
    
    return status;
  }

  /**
   * Stop all monitoring
   */
  stopMonitoring() {
    console.log('[VPSMonitor] Stopping VPS monitoring service...');
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    for (const [instanceId] of this.monitoring) {
      this.stopInstanceMonitoring(instanceId);
    }

    console.log('[VPSMonitor] Monitoring service stopped');
  }
}

module.exports = VPSMonitoringService;
```

### 9.2 Monitoring Dashboard Integration

```javascript
// api/monitoring.js
'use strict';

const express = require('express');
const router = express.Router();
const { authenticateAgent } = require('../lib/auth');

// Apply authentication to all routes
router.use(authenticateAgent);

/**
 * GET /api/v1/vps/monitoring/dashboard
 * Get VPS monitoring dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get instance health summary
    const healthSummary = await req.db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(CASE WHEN metadata->>'health_status' = 'healthy' THEN 1 ELSE 0 END) as health_ratio
      FROM vps_instances 
      WHERE workspace_id = $1 AND deleted_at IS NULL
      GROUP BY status
    `, [req.workspaceId]);

    // Get recent alerts
    const alerts = await req.db.query(`
      SELECT * FROM system_alerts
      WHERE workspace_id = $1 AND alert_type LIKE 'vps_%'
      ORDER BY created_at DESC
      LIMIT 10
    `, [req.workspaceId]);

    // Get usage trends (last 7 days)
    const usageTrends = await req.db.query(`
      SELECT 
        usage_date,
        COUNT(DISTINCT vps_instance_id) as active_instances,
        SUM(hours_active) as total_hours,
        SUM(cost_total) as total_cost,
        currency
      FROM vps_usage_records
      WHERE workspace_id = $1 
        AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY usage_date, currency
      ORDER BY usage_date DESC
    `, [req.workspaceId]);

    res.json({
      success: true,
      data: {
        healthSummary: healthSummary.rows,
        recentAlerts: alerts.rows,
        usageTrends: usageTrends.rows,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[Monitoring API] Error getting dashboard data:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring data'
    });
  }
});

/**
 * GET /api/v1/vps/monitoring/instance/:instanceId
 * Get detailed monitoring data for a specific instance
 */
router.get('/instance/:instanceId', async (req, res) => {
  const { instanceId } = req.params;

  try {
    // Get instance details with monitoring data
    const instance = await req.db.query(`
      SELECT 
        vi.*,
        vpc.display_name as provider_name
      FROM vps_instances vi
      JOIN vps_provider_configs vpc ON vi.provider_config_id = vpc.id
      WHERE vi.id = $1 AND vi.workspace_id = $2
    `, [instanceId, req.workspaceId]);

    if (!instance.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Instance not found'
      });
    }

    // Get deployment history
    const deployments = await req.db.query(`
      SELECT * FROM vps_deployments
      WHERE vps_instance_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [instanceId]);

    // Get usage data (last 30 days)
    const usage = await req.db.query(`
      SELECT * FROM vps_usage_records
      WHERE vps_instance_id = $1
        AND usage_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY usage_date DESC
    `, [instanceId]);

    res.json({
      success: true,
      data: {
        instance: instance.rows[0],
        deployments: deployments.rows,
        usage: usage.rows
      }
    });
  } catch (err) {
    console.error('[Monitoring API] Error getting instance monitoring data:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get instance monitoring data'
    });
  }
});

module.exports = router;
```

---

## 10. Migration Path

### 10.1 Hetzner Cloud Integration

```javascript
// services/providers/hetznerProvider.js
'use strict';

const { VPSProviderInterface } = require('../vpsProviderService');

/**
 * Hetzner Cloud Provider Implementation
 * REST API v1 integration
 */
class HetznerProvider extends VPSProviderInterface {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.endpoint = 'https://api.hetzner.cloud/v1';
  }

  async createInstance(spec) {
    try {
      const response = await this._makeRequest('POST', '/servers', {
        name: spec.name,
        server_type: this._mapFlavor(spec.flavor),
        image: this._mapImage(spec.image),
        user_data: spec.userData,
        networks: spec.networks || [],
        labels: {
          workspace_id: spec.tags.workspace_id,
          managed_by: 'vutler',
          ...spec.tags
        }
      });

      const server = response.server;

      return {
        id: server.id.toString(),
        name: server.name,
        status: this._mapStatus(server.status),
        flavor: spec.flavor,
        image: spec.image,
        publicIP: server.public_net?.ipv4?.ip || null,
        privateIP: server.private_net?.[0]?.ip || null,
        region: server.datacenter.name,
        createdAt: server.created,
        updatedAt: server.created,
        metadata: {
          providerInstanceId: server.id.toString(),
          providerRegion: server.datacenter.name,
          costPerHour: this._calculateCost(server.server_type.name),
          specs: {
            cpu: server.server_type.cores,
            ram: server.server_type.memory,
            disk: server.server_type.disk
          }
        }
      };
    } catch (error) {
      throw this._handleError(error, 'CREATE_INSTANCE_FAILED');
    }
  }

  async getInstanceStatus(instanceId) {
    try {
      const response = await this._makeRequest('GET', `/servers/${instanceId}`);
      const server = response.server;

      return {
        status: this._mapStatus(server.status),
        publicIP: server.public_net?.ipv4?.ip || null,
        privateIP: server.private_net?.[0]?.ip || null,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw this._handleError(error, 'GET_STATUS_FAILED');
    }
  }

  async startInstance(instanceId) {
    try {
      await this._makeRequest('POST', `/servers/${instanceId}/actions/poweron`);
      return { success: true, message: 'Instance started successfully' };
    } catch (error) {
      throw this._handleError(error, 'START_INSTANCE_FAILED');
    }
  }

  async stopInstance(instanceId) {
    try {
      await this._makeRequest('POST', `/servers/${instanceId}/actions/poweroff`);
      return { success: true, message: 'Instance stopped successfully' };
    } catch (error) {
      throw this._handleError(error, 'STOP_INSTANCE_FAILED');
    }
  }

  async deleteInstance(instanceId) {
    try {
      await this._makeRequest('DELETE', `/servers/${instanceId}`);
      return { success: true, message: 'Instance deleted successfully' };
    } catch (error) {
      throw this._handleError(error, 'DELETE_INSTANCE_FAILED');
    }
  }

  async _makeRequest(method, path, data = null) {
    const url = `${this.endpoint}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Hetzner API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    return await response.json();
  }

  _mapFlavor(vutlerFlavor) {
    // Map Vutler flavor names to Hetzner server types
    const flavorMap = {
      'a2-ram4-disk20': 'cx21',      // 2 vCPU, 4GB RAM, 40GB SSD
      'a4-ram8-disk50': 'cx31',      // 2 vCPU, 8GB RAM, 80GB SSD
      'a8-ram16-disk100': 'cx41'     // 4 vCPU, 16GB RAM, 160GB SSD
    };

    return flavorMap[vutlerFlavor] || 'cx21';
  }

  _mapImage(vutlerImage) {
    const imageMap = {
      'ubuntu-22.04': 'ubuntu-22.04',
      'debian-11': 'debian-11',
      'debian-12': 'debian-12'
    };

    return imageMap[vutlerImage] || 'ubuntu-22.04';
  }

  _mapStatus(hetznerStatus) {
    const statusMap = {
      'initializing': 'creating',
      'starting': 'creating',
      'running': 'active',
      'stopping': 'stopped',
      'off': 'stopped',
      'deleting': 'deleted',
      'migrating': 'active',
      'rebuilding': 'creating',
      'unknown': 'error'
    };

    return statusMap[hetznerStatus] || 'unknown';
  }

  _calculateCost(serverType) {
    // Hetzner pricing (EUR per hour)
    const pricing = {
      'cx11': 0.0052,    // 1 vCPU, 4GB RAM
      'cx21': 0.0095,    // 2 vCPU, 8GB RAM
      'cx31': 0.0190,    // 2 vCPU, 8GB RAM
      'cx41': 0.0380,    // 4 vCPU, 16GB RAM
      'cx51': 0.0760     // 8 vCPU, 32GB RAM
    };

    return pricing[serverType] || 0.02;
  }

  _handleError(error, code) {
    console.error('[HetznerProvider] Error:', error);
    return {
      code,
      message: error.message,
      details: null,
      providerError: error
    };
  }
}

module.exports = HetznerProvider;
```

### 10.2 Vultr Integration

```javascript
// services/providers/vultrProvider.js
'use strict';

const { VPSProviderInterface } = require('../vpsProviderService');

/**
 * Vultr Provider Implementation
 * REST API v2 integration
 */
class VultrProvider extends VPSProviderInterface {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.endpoint = 'https://api.vultr.com/v2';
  }

  async createInstance(spec) {
    try {
      const response = await this._makeRequest('POST', '/instances', {
        label: spec.name,
        hostname: spec.name,
        os_id: await this._resolveImage(spec.image),
        plan: this._mapFlavor(spec.flavor),
        region: this._mapRegion(spec.region || 'us-east'),
        user_data: Buffer.from(spec.userData || '').toString('base64'),
        tags: [
          `workspace:${spec.tags.workspace_id}`,
          'managed-by:vutler',
          ...Object.entries(spec.tags || {}).map(([k, v]) => `${k}:${v}`)
        ]
      });

      const instance = response.instance;

      return {
        id: instance.id,
        name: instance.label,
        status: this._mapStatus(instance.status),
        flavor: spec.flavor,
        image: spec.image,
        publicIP: instance.main_ip || null,
        privateIP: instance.internal_ip || null,
        region: instance.region,
        createdAt: instance.date_created,
        updatedAt: instance.date_created,
        metadata: {
          providerInstanceId: instance.id,
          providerRegion: instance.region,
          costPerHour: this._calculateCost(instance.plan),
          specs: {
            cpu: instance.vcpu_count,
            ram: instance.ram / 1024, // MB to GB
            disk: instance.disk
          }
        }
      };
    } catch (error) {
      throw this._handleError(error, 'CREATE_INSTANCE_FAILED');
    }
  }

  // Similar implementations for other interface methods...
  async getInstanceStatus(instanceId) {
    try {
      const response = await this._makeRequest('GET', `/instances/${instanceId}`);
      const instance = response.instance;

      return {
        status: this._mapStatus(instance.status),
        publicIP: instance.main_ip || null,
        privateIP: instance.internal_ip || null,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw this._handleError(error, 'GET_STATUS_FAILED');
    }
  }

  async _makeRequest(method, path, data = null) {
    const url = `${this.endpoint}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Vultr API error: ${errorData.error || 'Unknown error'}`);
    }

    return await response.json();
  }

  _mapFlavor(vutlerFlavor) {
    // Map to Vultr plan IDs
    const flavorMap = {
      'a2-ram4-disk20': 'vc2-2c-4gb',    // 2 vCPU, 4GB RAM, 80GB SSD
      'a4-ram8-disk50': 'vc2-4c-8gb',    // 4 vCPU, 8GB RAM, 160GB SSD  
      'a8-ram16-disk100': 'vc2-8c-16gb'  // 8 vCPU, 16GB RAM, 320GB SSD
    };

    return flavorMap[vutlerFlavor] || 'vc2-2c-4gb';
  }

  _mapStatus(vultrStatus) {
    const statusMap = {
      'pending': 'creating',
      'installing': 'creating',
      'active': 'active',
      'stopped': 'stopped',
      'suspended': 'stopped',
      'destroyed': 'deleted'
    };

    return statusMap[vultrStatus] || 'unknown';
  }
}

module.exports = VultrProvider;
```

### 10.3 Multi-Provider Configuration

```javascript
// Migration strategy and multi-provider support

/**
 * Provider Selection Strategy
 * Determines which provider to use based on requirements
 */
class ProviderSelector {
  constructor() {
    this.providerCapabilities = {
      infomaniak: {
        regions: ['ch-geneva-1'],
        strengths: ['privacy', 'swiss-data-protection', 'green-energy'],
        limitations: ['limited-regions'],
        cost_efficiency: 'medium',
        reliability: 'high'
      },
      
      hetzner: {
        regions: ['fsn1', 'nbg1', 'hel1', 'ash', 'hil'],
        strengths: ['cost-effective', 'eu-based', 'good-performance'],
        limitations: ['no-partner-program', 'limited-global-presence'],
        cost_efficiency: 'high',
        reliability: 'high'
      },
      
      vultr: {
        regions: ['ewr', 'ord', 'dfw', 'sea', 'lax', 'fra', 'ams', 'lon', 'sgp', 'nrt'],
        strengths: ['global-presence', 'partner-program', 'good-api'],
        limitations: ['higher-cost', 'us-based'],
        cost_efficiency: 'medium',
        reliability: 'medium'
      }
    };
  }

  selectProvider(requirements) {
    const {
      region_preference,
      budget_priority,
      data_sovereignty,
      global_deployment
    } = requirements;

    // Data sovereignty requirements
    if (data_sovereignty === 'swiss' || data_sovereignty === 'eu') {
      if (region_preference === 'switzerland') {
        return 'infomaniak';
      }
      return 'hetzner'; // EU-based alternative
    }

    // Budget-first approach
    if (budget_priority === 'high') {
      return 'hetzner';
    }

    // Global deployment
    if (global_deployment === true) {
      return 'vultr';
    }

    // Default to primary provider
    return 'infomaniak';
  }

  getProviderRecommendation(workspaceId, requirements) {
    const primary = this.selectProvider(requirements);
    const alternatives = Object.keys(this.providerCapabilities)
      .filter(p => p !== primary)
      .sort((a, b) => {
        // Sort by cost efficiency and reliability
        const scoreA = this._calculateProviderScore(a, requirements);
        const scoreB = this._calculateProviderScore(b, requirements);
        return scoreB - scoreA;
      });

    return {
      primary,
      alternatives: alternatives.slice(0, 2),
      reasoning: this._getRecommendationReasoning(primary, requirements)
    };
  }

  _calculateProviderScore(provider, requirements) {
    // Scoring algorithm based on requirements
    // Implementation would calculate weighted scores
    return Math.random(); // Placeholder
  }

  _getRecommendationReasoning(provider, requirements) {
    const capabilities = this.providerCapabilities[provider];
    return {
      strengths: capabilities.strengths,
      matchedRequirements: [], // Would be populated based on requirements
      considerations: capabilities.limitations
    };
  }
}
```

---

## 11. Implementation Timeline

### 11.1 Phase 1: Foundation (Week 1-2)
**Goal**: Basic VPS provider integration infrastructure

**Deliverables**:
- [ ] Database schema implementation
- [ ] Provider abstraction layer
- [ ] Infomaniak provider implementation (basic CRUD)
- [ ] Security service with credential encryption
- [ ] Basic API routes for VPS management

**Success Criteria**:
- Can create/start/stop/delete Infomaniak instances via API
- Credentials are encrypted and stored securely
- Basic provider abstraction works

### 11.2 Phase 2: Agent Deployment (Week 3-4)  
**Goal**: Agent deployment to VPS instances

**Deliverables**:
- [ ] Agent deployment service
- [ ] Cloud-init script generation
- [ ] Agent runtime bootstrap template
- [ ] Deployment status tracking
- [ ] Basic monitoring and health checks

**Success Criteria**:
- Can deploy agents to VPS instances
- Agents successfully connect back to Vutler platform
- Deployment status is tracked and visible

### 11.3 Phase 3: Monitoring & Billing (Week 5-6)
**Goal**: Production-ready monitoring and cost tracking

**Deliverables**:
- [ ] VPS monitoring service
- [ ] Health check automation
- [ ] Billing integration and usage tracking
- [ ] Monitoring dashboard API
- [ ] Alert system for unhealthy instances

**Success Criteria**:
- Real-time monitoring of all VPS instances
- Accurate cost tracking and billing summaries
- Automatic recovery for unhealthy instances

### 11.4 Phase 4: Multi-Provider Support (Week 7-8)
**Goal**: Add Hetzner and Vultr providers

**Deliverables**:
- [ ] Hetzner Cloud provider implementation
- [ ] Vultr provider implementation
- [ ] Provider selection logic
- [ ] Migration tools between providers
- [ ] Cost comparison features

**Success Criteria**:
- All three providers work with same abstraction layer
- Users can choose providers based on requirements
- Seamless switching between providers

### 11.5 Phase 5: Polish & Launch (Week 9-10)
**Goal**: Production launch preparation

**Deliverables**:
- [ ] Frontend UI for VPS management
- [ ] Documentation and user guides  
- [ ] Load testing and optimization
- [ ] Security audit and penetration testing
- [ ] Backup and disaster recovery procedures

**Success Criteria**:
- Production-ready VPS integration
- Comprehensive documentation
- Security validation complete
- Performance benchmarks met

### 11.6 Technical Dependencies

**External Dependencies**:
- Infomaniak OpenStack API access and credentials
- Hetzner Cloud API access
- Vultr API access and partner program approval
- SSL certificates for agent endpoints

**Internal Dependencies**:
- CryptoService implementation (existing)
- PostgreSQL Row Level Security setup (existing)
- WebSocket infrastructure for agent communication (existing)
- Billing system integration points (existing)

### 11.7 Risk Mitigation

**High-Risk Items**:
1. **OpenStack SDK Complexity**: Infomaniak uses OpenStack which has a complex API
   - *Mitigation*: Start with basic operations, implement SDK wrapper layer
   - *Fallback*: Direct REST API calls if SDK proves problematic

2. **Agent Deployment Reliability**: Cloud-init scripts may fail
   - *Mitigation*: Comprehensive error handling and retry logic
   - *Fallback*: Manual deployment procedures documented

3. **Provider API Rate Limits**: Each provider has different limits
   - *Mitigation*: Implement rate limiting and queuing
   - *Fallback*: Graceful degradation and user notifications

4. **Cost Management**: Unexpected billing spikes
   - *Mitigation*: Strict quota enforcement and monitoring
   - *Fallback*: Emergency stop functionality

**Medium-Risk Items**:
- Network connectivity issues between VPS and platform
- Provider service outages affecting deployments
- Security vulnerabilities in agent-to-platform communication

### 11.8 Success Metrics

**Technical Metrics**:
- VPS provisioning success rate > 95%
- Agent deployment success rate > 90%
- Health check response time < 5 seconds
- Instance startup time < 3 minutes

**Business Metrics**:
- Customer adoption rate of VPS deployment feature
- Cost predictability (actual vs. estimated costs within 10%)
- Support ticket volume related to VPS issues
- User satisfaction scores for VPS feature

**Operational Metrics**:
- Monitoring coverage 100% of active instances
- Mean time to recovery < 15 minutes
- Billing accuracy > 99%
- API uptime > 99.9%

---

## Conclusion

This VPS Provider Integration specification provides a comprehensive roadmap for extending Vutler's AI agent management platform with automated VPS provisioning capabilities. The architecture prioritizes:

1. **Vendor Neutrality**: Abstract provider interface allows easy addition of new providers
2. **Security**: Encrypted credentials, tenant isolation, and secure agent communication
3. **Scalability**: Monitoring, billing, and management systems designed for growth
4. **Reliability**: Health checks, auto-recovery, and comprehensive error handling

The implementation follows Vutler's established patterns (CommonJS, Express routes, PostgreSQL with RLS) while introducing new capabilities that significantly expand the platform's value proposition.

**Next Steps**:
1. Review and approve this specification
2. Set up Infomaniak OpenStack API access
3. Begin Phase 1 implementation
4. Establish monitoring and alerting for the development process

*Total Estimated Implementation Time: **10 weeks***
*Estimated Development Effort: **2-3 full-time developers***