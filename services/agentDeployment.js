'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  createApiKey,
  revokeApiKey,
  ensureApiKeysTable,
} = require('./apiKeys');

const SCHEMA = 'tenant_vutler';
const DEFAULT_API_BASE = process.env.VUTLER_API_URL || 'https://app.vutler.ai';

function appendUniqueUuid(items, value) {
  const current = Array.isArray(items) ? items.map(String) : [];
  const target = String(value);
  return current.includes(target) ? current : [...current, target];
}

function removeUuid(items, value) {
  const target = String(value);
  return (Array.isArray(items) ? items : []).map(String).filter((item) => item !== target);
}

function sanitizeHostname(value, fallback = 'vutler-node') {
  const normalized = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return (normalized || fallback).slice(0, 63);
}

async function ensureNexusTables(db) {
  try {
    const check1 = await db.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_deployments'`
    );

    if (check1.rows.length === 0) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_deployments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          created_by_user_id UUID NULL,
          agent_id TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('local', 'docker')),
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'online', 'offline', 'error')),
          api_key_id UUID NULL,
          client_company TEXT NULL,
          command_context JSONB NOT NULL DEFAULT '{}'::jsonb,
          last_heartbeat_at TIMESTAMPTZ NULL,
          last_heartbeat_payload JSONB NULL,
          runtime_version TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    const check2 = await db.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='nexus_runtime_heartbeats'`
    );

    if (check2.rows.length === 0) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_runtime_heartbeats (
          id BIGSERIAL PRIMARY KEY,
          deployment_id UUID NOT NULL REFERENCES ${SCHEMA}.nexus_deployments(id) ON DELETE CASCADE,
          workspace_id UUID NOT NULL,
          runtime_id TEXT NULL,
          runtime_version TEXT NULL,
          status TEXT NOT NULL DEFAULT 'online',
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }
  } catch (err) {
    console.warn('[AgentDeployment] ensureNexusTables warning:', err.message);
  }
}

/**
 * Agent Deployment Service
 * Handles first-boot Nexus runtime bootstrap for VPS-backed agents.
 */
class AgentDeploymentService {
  constructor(db, cryptoService) {
    this.db = db;
    this.crypto = cryptoService;
  }

  async deployAgent() {
    throw new Error(
      'Automatic deployment to an existing VPS is not supported. Create the instance with agentId so cloud-init can bootstrap the runtime on first boot.'
    );
  }

  async prepareDeploymentForInstance(agentId, vpsInstanceId, workspaceId, config = {}) {
    await this._ensureDeploymentSchema();

    const agent = await this._getAgent(agentId, workspaceId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const vpsInstance = await this._getVPSInstance(vpsInstanceId, workspaceId);
    if (!vpsInstance) {
      throw new Error('VPS instance not found');
    }

    const runtimeKey = await createApiKey({
      workspaceId,
      userId: config.userId || null,
      name: `VPS Runtime ${agent.name || agent.id}`,
    });

    let nexusDeployment = null;
    let deployment = null;

    try {
      nexusDeployment = await this._createNexusDeployment({
        agent,
        vpsInstance,
        workspaceId,
        runtimeKey,
        config,
      });

      const cloudInitScript = await this.generateCloudInitScript(agent, {
        ...config,
        workspaceId,
        vpsInstance,
        runtimeApiKey: runtimeKey.secret,
        runtimeApiKeyId: runtimeKey.id,
        nexusDeploymentId: nexusDeployment.id,
      });

      deployment = await this._createDeploymentRecord({
        agent,
        vpsInstance,
        script: cloudInitScript,
        nexusDeploymentId: nexusDeployment.id,
        runtimeApiKeyId: runtimeKey.id,
        config,
      });

      return {
        deployment,
        nexusDeployment,
        runtimeKey,
        cloudInitScript,
      };
    } catch (error) {
      if (nexusDeployment?.id) {
        await this._markNexusDeploymentError(nexusDeployment.id, error.message);
      }
      if (runtimeKey?.id) {
        await revokeApiKey({ workspaceId, id: runtimeKey.id }).catch(() => null);
      }
      throw error;
    }
  }

  async markDeploymentProvisioned(deploymentId, details = {}) {
    const deployment = await this.getDeploymentStatus(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const metadata = {
      status: 'provisioned',
      provisionedAt: new Date().toISOString(),
      providerInstanceId: details.providerInstanceId || null,
      ipAddress: details.ipAddress || null,
      bootstrapMode: 'cloud_init',
    };

    await this.db.query(
      `UPDATE ${SCHEMA}.vps_deployments
          SET status = 'running',
              logs = COALESCE(logs, '') || $1,
              bootstrap_config = COALESCE(bootstrap_config, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE id = $3`,
      [
        `\n[bootstrap] Instance provisioned. Waiting for Nexus runtime heartbeat.\n`,
        JSON.stringify(metadata),
        deploymentId,
      ]
    );

    const assignments = appendUniqueUuid(deployment.agent_assignments, deployment.agent_id);
    await this.db.query(
      `UPDATE ${SCHEMA}.vps_instances
          SET agent_assignments = $1::uuid[],
              metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE id = $3`,
      [
        assignments,
        JSON.stringify({
          bootstrap: {
            deploymentId,
            nexusDeploymentId: deployment.nexus_deployment_id,
            provisionedAt: metadata.provisionedAt,
          },
        }),
        deployment.vps_instance_id,
      ]
    );

    await this.db.query(
      `UPDATE ${SCHEMA}.agents
          SET vps_instance_id = $1,
              vps_status = 'bootstrapping'
        WHERE id = $2`,
      [deployment.vps_instance_id, deployment.agent_id]
    );
  }

  async markDeploymentFailed(deploymentId, message) {
    const deployment = await this.getDeploymentStatus(deploymentId);
    if (!deployment) return;

    await this._updateDeploymentStatus(deploymentId, 'failed', message || 'Deployment failed');

    if (deployment.nexus_deployment_id) {
      await this._markNexusDeploymentError(deployment.nexus_deployment_id, message || 'Deployment failed');
    }

    if (deployment.runtime_api_key_id) {
      await revokeApiKey({
        workspaceId: deployment.workspace_id,
        id: deployment.runtime_api_key_id,
      }).catch(() => null);
    }

    await this.db.query(
      `UPDATE ${SCHEMA}.vps_instances
          SET agent_assignments = $1::uuid[],
              updated_at = NOW()
        WHERE id = $2`,
      [removeUuid(deployment.agent_assignments, deployment.agent_id), deployment.vps_instance_id]
    ).catch(() => null);

    await this.db.query(
      `UPDATE ${SCHEMA}.agents
          SET vps_instance_id = NULL,
              vps_status = 'local'
        WHERE id = $1`,
      [deployment.agent_id]
    ).catch(() => null);
  }

  async getDeploymentStatus(deploymentId) {
    const result = await this.db.query(
      `SELECT
         vd.*,
         vi.workspace_id,
         vi.name AS vps_instance_name,
         vi.agent_assignments,
         a.name AS agent_name,
         nd.status AS nexus_status,
         nd.last_heartbeat_at,
         nd.runtime_version
       FROM ${SCHEMA}.vps_deployments vd
       LEFT JOIN ${SCHEMA}.vps_instances vi ON vd.vps_instance_id = vi.id
       LEFT JOIN ${SCHEMA}.agents a ON vd.agent_id = a.id
       LEFT JOIN ${SCHEMA}.nexus_deployments nd ON nd.id = vd.nexus_deployment_id
       WHERE vd.id = $1`,
      [deploymentId]
    );

    return result.rows[0] || null;
  }

  async undeployAgent(deploymentId) {
    const deployment = await this.getDeploymentStatus(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    await this._updateDeploymentStatus(deploymentId, 'undeploying', 'Removing agent from VPS');

    await this.db.query(
      `UPDATE ${SCHEMA}.vps_instances
          SET agent_assignments = $1::uuid[],
              updated_at = NOW()
        WHERE id = $2`,
      [removeUuid(deployment.agent_assignments, deployment.agent_id), deployment.vps_instance_id]
    );

    await this.db.query(
      `UPDATE ${SCHEMA}.agents
          SET vps_instance_id = NULL,
              vps_status = 'local'
        WHERE id = $1`,
      [deployment.agent_id]
    );

    if (deployment.runtime_api_key_id) {
      await revokeApiKey({
        workspaceId: deployment.workspace_id,
        id: deployment.runtime_api_key_id,
      }).catch(() => null);
    }

    if (deployment.nexus_deployment_id) {
      await this.db.query(
        `UPDATE ${SCHEMA}.nexus_deployments
            SET status = 'offline',
                updated_at = NOW()
          WHERE id = $1`,
        [deployment.nexus_deployment_id]
      ).catch(() => null);
    }

    await this._updateDeploymentStatus(deploymentId, 'undeployed', 'Agent removed from VPS');
    return { success: true };
  }

  async generateCloudInitScript(agent, config = {}) {
    const templatePath = path.join(__dirname, '..', 'templates', 'cloud-init-agent.yaml');
    const template = fs.readFileSync(templatePath, 'utf8');
    const apiBaseUrl = config.apiBaseUrl || DEFAULT_API_BASE;
    const nodeName = config.nodeName || `${agent.name || agent.id}-vps`;
    const runtimeConfig = {
      apiBaseUrl,
      apiKey: config.runtimeApiKey,
      deploymentId: config.nexusDeploymentId,
      nodeName,
      nodePort: Number(config.nodePort || 3100),
      workspaceId: agent.workspace_id,
      vpsInstanceId: config.vpsInstance?.id || null,
      heartbeatIntervalMs: Number(config.heartbeatIntervalMs || 30000),
      connectIntervalMs: Number(config.connectIntervalMs || 30000),
      runtimeVersion: 'vps-cloud-init-1',
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role || 'agent',
      },
    };

    return template
      .replace(/{{NODE_HOSTNAME}}/g, sanitizeHostname(nodeName, `agent-${agent.id}`))
      .replace(/{{NODE_NAME}}/g, nodeName)
      .replace(/{{NODEJS_VERSION}}/g, String(config.nodejsVersion || '20'))
      .replace(/{{AGENT_ID}}/g, agent.id)
      .replace(/{{AGENT_NAME}}/g, agent.name || agent.id)
      .replace(/{{WORKSPACE_ID}}/g, agent.workspace_id)
      .replace(/{{VPS_INSTANCE_ID}}/g, config.vpsInstance?.id || 'unknown')
      .replace(/{{NEXUS_DEPLOYMENT_ID}}/g, config.nexusDeploymentId)
      .replace(/{{RUNTIME_CONFIG_JSON}}/g, JSON.stringify(runtimeConfig, null, 2));
  }

  async _ensureDeploymentSchema() {
    await ensureApiKeysTable();
    await ensureNexusTables(this.db);

    try {
      const check = await this.db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='vps_deployments'`
      );

      if (check.rows.length === 0) {
        await this.db.query(`
          CREATE TABLE IF NOT EXISTS ${SCHEMA}.vps_deployments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vps_instance_id UUID NOT NULL,
            agent_id UUID NOT NULL,
            deployment_type TEXT NOT NULL DEFAULT 'agent_install',
            status TEXT NOT NULL DEFAULT 'running',
            script_hash TEXT NULL,
            logs TEXT NULL,
            error_message TEXT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
      }

      await this.db.query(`ALTER TABLE ${SCHEMA}.vps_deployments ADD COLUMN IF NOT EXISTS nexus_deployment_id UUID NULL`);
      await this.db.query(`ALTER TABLE ${SCHEMA}.vps_deployments ADD COLUMN IF NOT EXISTS runtime_api_key_id UUID NULL`);
      await this.db.query(`ALTER TABLE ${SCHEMA}.vps_deployments ADD COLUMN IF NOT EXISTS boot_method TEXT NOT NULL DEFAULT 'cloud_init'`);
      await this.db.query(`ALTER TABLE ${SCHEMA}.vps_deployments ADD COLUMN IF NOT EXISTS runtime_online_at TIMESTAMPTZ NULL`);
      await this.db.query(`ALTER TABLE ${SCHEMA}.vps_deployments ADD COLUMN IF NOT EXISTS bootstrap_config JSONB NOT NULL DEFAULT '{}'::jsonb`);
      await this.db.query(`ALTER TABLE ${SCHEMA}.vps_deployments ADD COLUMN IF NOT EXISTS command_context JSONB NOT NULL DEFAULT '{}'::jsonb`);
      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_vps_deployments_instance ON ${SCHEMA}.vps_deployments (vps_instance_id, created_at DESC)`);
      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_vps_deployments_nexus ON ${SCHEMA}.vps_deployments (nexus_deployment_id)`);
    } catch (err) {
      console.warn('[AgentDeployment] ensureDeploymentSchema warning:', err.message);
    }
  }

  async _getAgent(agentId, workspaceId) {
    const result = await this.db.query(
      `SELECT * FROM ${SCHEMA}.agents
        WHERE id = $1 AND workspace_id = $2`,
      [agentId, workspaceId]
    );

    return result.rows[0] || null;
  }

  async _getVPSInstance(vpsInstanceId, workspaceId) {
    const result = await this.db.query(
      `SELECT vi.*, p.name AS provider_name, pc.credentials_encrypted
         FROM ${SCHEMA}.vps_instances vi
         JOIN ${SCHEMA}.vps_providers p ON vi.provider_id = p.id
         LEFT JOIN ${SCHEMA}.vps_provider_configs pc
           ON pc.provider_id = p.id AND pc.workspace_id = vi.workspace_id
        WHERE vi.id = $1
          AND vi.workspace_id = $2
          AND vi.deleted_at IS NULL`,
      [vpsInstanceId, workspaceId]
    );

    return result.rows[0] || null;
  }

  async _createNexusDeployment({ agent, vpsInstance, workspaceId, runtimeKey, config }) {
    const result = await this.db.query(
      `INSERT INTO ${SCHEMA}.nexus_deployments (
         workspace_id,
         created_by_user_id,
         agent_id,
         mode,
         status,
         api_key_id,
         client_company,
         command_context
       ) VALUES ($1, $2, $3, $4, 'planned', $5, $6, $7::jsonb)
       RETURNING *`,
      [
        workspaceId,
        config.userId || null,
        String(agent.id),
        'docker',
        runtimeKey.id,
        config.clientCompany || null,
        JSON.stringify({
          apiBaseUrl: config.apiBaseUrl || DEFAULT_API_BASE,
          vpsInstanceId: vpsInstance.id,
          provider: vpsInstance.provider_name || null,
          bootMethod: 'cloud_init',
          nodeName: config.nodeName || `${agent.name || agent.id}-vps`,
        }),
      ]
    );

    return result.rows[0];
  }

  async _createDeploymentRecord({ agent, vpsInstance, script, nexusDeploymentId, runtimeApiKeyId, config }) {
    const scriptHash = crypto.createHash('sha256').update(script).digest('hex');
    const result = await this.db.query(
      `INSERT INTO ${SCHEMA}.vps_deployments (
         vps_instance_id,
         agent_id,
         deployment_type,
         status,
         script_hash,
         logs,
         started_at,
         nexus_deployment_id,
         runtime_api_key_id,
         boot_method,
         bootstrap_config,
         command_context
       ) VALUES ($1, $2, 'agent_install', 'running', $3, $4, NOW(), $5, $6, 'cloud_init', $7::jsonb, $8::jsonb)
       RETURNING *`,
      [
        vpsInstance.id,
        agent.id,
        scriptHash,
        '[bootstrap] Cloud-init prepared. Waiting for provider provisioning.\n',
        nexusDeploymentId,
        runtimeApiKeyId,
        JSON.stringify({
          nodeName: config.nodeName || `${agent.name || agent.id}-vps`,
          nodePort: Number(config.nodePort || 3100),
          provider: vpsInstance.provider_name || null,
        }),
        JSON.stringify({
          apiBaseUrl: config.apiBaseUrl || DEFAULT_API_BASE,
          nodeName: config.nodeName || `${agent.name || agent.id}-vps`,
        }),
      ]
    );

    return result.rows[0];
  }

  async _updateDeploymentStatus(deploymentId, status, message = null) {
    const completedAt = status === 'completed' || status === 'failed' || status === 'undeployed'
      ? 'NOW()'
      : 'completed_at';

    await this.db.query(
      `UPDATE ${SCHEMA}.vps_deployments
          SET status = $1,
              error_message = $2,
              completed_at = ${completedAt},
              updated_at = NOW()
        WHERE id = $3`,
      [status, message, deploymentId]
    );
  }

  async _markNexusDeploymentError(nexusDeploymentId, message) {
    await this.db.query(
      `UPDATE ${SCHEMA}.nexus_deployments
          SET status = 'error',
              last_heartbeat_payload = COALESCE(last_heartbeat_payload, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
        WHERE id = $1`,
      [
        nexusDeploymentId,
        JSON.stringify({
          error: message || 'Deployment failed',
          source: 'vps_bootstrap',
        }),
      ]
    ).catch(() => null);
  }
}

module.exports = AgentDeploymentService;
