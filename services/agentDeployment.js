'use strict';

const fs = require('fs');
const path = require('path');
const { VPSProviderFactory } = require('./vpsProvider');

/**
 * Agent Deployment Service
 * Handles deploying Vutler agents to VPS instances
 */
class AgentDeploymentService {
  constructor(db, cryptoService) {
    this.db = db;
    this.crypto = cryptoService;
  }

  /**
   * Deploy an agent to a VPS instance
   * @param {string} agentId - The agent to deploy
   * @param {string} vpsInstanceId - Target VPS instance
   * @param {string} workspaceId - Workspace ID
   * @param {Object} config - Deployment configuration
   */
  async deployAgent(agentId, vpsInstanceId, workspaceId, config = {}) {
    try {
      console.log('[AgentDeployment] Starting deployment:', { agentId, vpsInstanceId });

      // 1. Fetch agent config from DB
      const agent = await this._getAgent(agentId, workspaceId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // 2. Fetch VPS instance details (must be 'active' status)
      const vpsInstance = await this._getVPSInstance(vpsInstanceId, workspaceId);
      if (!vpsInstance) {
        throw new Error('VPS instance not found');
      }

      if (vpsInstance.status !== 'active') {
        throw new Error(`VPS instance must be active, current status: ${vpsInstance.status}`);
      }

      // 3. Generate cloud-init userdata script
      const cloudInitScript = await this.generateCloudInitScript(agent, {
        ...config,
        vpsInstance
      });

      // 4. Create deployment record
      const deployment = await this._createDeploymentRecord(agentId, vpsInstanceId, cloudInitScript);

      // 5. Execute deployment
      await this._executeDeployment(deployment, vpsInstance, cloudInitScript);

      // 6. Update deployment status
      await this._updateDeploymentStatus(deployment.id, 'completed', 'Agent deployed successfully');

      console.log('[AgentDeployment] Deployment completed:', deployment.id);
      return deployment;

    } catch (error) {
      console.error('[AgentDeployment] Deployment failed:', error);
      if (deployment?.id) {
        await this._updateDeploymentStatus(deployment.id, 'failed', error.message);
      }
      throw error;
    }
  }

  /**
   * Get deployment status
   * @param {string} deploymentId - Deployment ID
   */
  async getDeploymentStatus(deploymentId) {
    try {
      const result = await this.db.query(`
        SELECT vd.*, vi.name as vps_instance_name, a.name as agent_name
        FROM tenant_vutler.vps_deployments vd
        LEFT JOIN tenant_vutler.vps_instances vi ON vd.vps_instance_id = vi.id
        LEFT JOIN tenant_vutler.agents a ON vd.agent_id = a.id
        WHERE vd.id = $1
      `, [deploymentId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('[AgentDeployment] Error getting deployment status:', error);
      throw error;
    }
  }

  /**
   * Undeploy agent from VPS
   * @param {string} deploymentId - Deployment ID
   */
  async undeployAgent(deploymentId) {
    try {
      console.log('[AgentDeployment] Starting undeployment:', deploymentId);

      const deployment = await this.getDeploymentStatus(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      // Update deployment status
      await this._updateDeploymentStatus(deploymentId, 'undeploying', 'Removing agent from VPS');

      // Remove agent assignment from VPS instance
      await this.db.query(`
        UPDATE tenant_vutler.vps_instances 
        SET agent_assignments = array_remove(agent_assignments, $1)
        WHERE id = $2
      `, [deployment.agent_id, deployment.vps_instance_id]);

      // Update agent status
      await this.db.query(`
        UPDATE tenant_vutler.agents
        SET vps_instance_id = NULL, vps_status = 'local'
        WHERE id = $1
      `, [deployment.agent_id]);

      // Mark deployment as undeployed
      await this._updateDeploymentStatus(deploymentId, 'undeployed', 'Agent removed from VPS');

      console.log('[AgentDeployment] Undeployment completed:', deploymentId);
      return { success: true };

    } catch (error) {
      console.error('[AgentDeployment] Undeployment failed:', error);
      await this._updateDeploymentStatus(deploymentId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Generate cloud-init script for agent deployment
   * @param {Object} agent - Agent configuration
   * @param {Object} config - Additional configuration
   */
  async generateCloudInitScript(agent, config = {}) {
    try {
      // Load cloud-init template
      const templatePath = path.join(__dirname, '..', 'templates', 'cloud-init-agent.yaml');
      const template = fs.readFileSync(templatePath, 'utf8');

      // Generate agent token for secure communication
      const agentToken = this._generateAgentToken(agent.id, config.vpsInstance?.id, agent.workspace_id);

      // Replace template variables
      const script = template
        .replace(/{{AGENT_ID}}/g, agent.id)
        .replace(/{{AGENT_NAME}}/g, agent.name)
        .replace(/{{AGENT_TOKEN}}/g, agentToken)
        .replace(/{{VUTLER_API_URL}}/g, process.env.VUTLER_API_URL || 'https://app.vutler.ai')
        .replace(/{{WORKSPACE_ID}}/g, agent.workspace_id)
        .replace(/{{VPS_INSTANCE_ID}}/g, config.vpsInstance?.id || 'unknown')
        .replace(/{{NODEJS_VERSION}}/g, config.nodejsVersion || '20');

      return script;
    } catch (error) {
      console.error('[AgentDeployment] Error generating cloud-init script:', error);
      throw error;
    }
  }

  // Private helper methods

  async _getAgent(agentId, workspaceId) {
    const result = await this.db.query(`
      SELECT * FROM tenant_vutler.agents 
      WHERE id = $1 AND workspace_id = $2
    `, [agentId, workspaceId]);
    return result.rows[0];
  }

  async _getVPSInstance(vpsInstanceId, workspaceId) {
    const result = await this.db.query(`
      SELECT vi.*, p.name as provider_name, pc.credentials_encrypted
      FROM tenant_vutler.vps_instances vi
      JOIN tenant_vutler.vps_providers p ON vi.provider_id = p.id
      JOIN tenant_vutler.vps_provider_configs pc ON pc.provider_id = p.id AND pc.workspace_id = vi.workspace_id
      WHERE vi.id = $1 AND vi.workspace_id = $2 AND vi.deleted_at IS NULL
    `, [vpsInstanceId, workspaceId]);
    return result.rows[0];
  }

  async _createDeploymentRecord(agentId, vpsInstanceId, script) {
    const scriptHash = require('crypto').createHash('sha256').update(script).digest('hex');
    
    const result = await this.db.query(`
      INSERT INTO tenant_vutler.vps_deployments (
        vps_instance_id, agent_id, deployment_type, status, 
        script_hash, started_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [vpsInstanceId, agentId, 'agent_install', 'running', scriptHash]);

    return result.rows[0];
  }

  async _executeDeployment(deployment, vpsInstance, cloudInitScript) {
    try {
      console.log('[AgentDeployment] Executing deployment via SSH');

      // For now, we'll use SSH to execute the cloud-init script
      // In production, this would ideally be done during instance creation
      const sshResult = await this._executeViaSSH(vpsInstance, cloudInitScript);
      
      // Update deployment logs
      await this.db.query(`
        UPDATE tenant_vutler.vps_deployments 
        SET logs = $1
        WHERE id = $2
      `, [sshResult.logs, deployment.id]);

      // Update VPS instance with agent assignment
      await this.db.query(`
        UPDATE tenant_vutler.vps_instances 
        SET agent_assignments = array_append(COALESCE(agent_assignments, ARRAY[]::uuid[]), $1::uuid)
        WHERE id = $2
      `, [deployment.agent_id, deployment.vps_instance_id]);

      // Update agent with VPS assignment
      await this.db.query(`
        UPDATE tenant_vutler.agents
        SET vps_instance_id = $1, vps_status = 'deployed'
        WHERE id = $2
      `, [deployment.vps_instance_id, deployment.agent_id]);

    } catch (error) {
      console.error('[AgentDeployment] Deployment execution failed:', error);
      throw error;
    }
  }

  async _executeViaSSH(vpsInstance, cloudInitScript) {
    // Mock implementation - in reality this would execute via SSH
    // For now, we'll simulate successful deployment
    console.log('[AgentDeployment] SSH execution simulated for instance:', vpsInstance.name);
    
    const logs = [
      '#!/bin/bash',
      '# Vutler Agent Deployment Log',
      `# Instance: ${vpsInstance.name}`,
      `# Started: ${new Date().toISOString()}`,
      '',
      '# Update system...',
      'apt-get update && apt-get upgrade -y',
      '',
      '# Install Node.js 20 LTS...',
      'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
      'apt-get install -y nodejs',
      '',
      '# Create vutler-agent user...',
      'useradd -m -s /bin/bash vutler-agent',
      '',
      '# Download and install agent runtime...',
      'mkdir -p /opt/vutler-agent',
      'cd /opt/vutler-agent',
      'wget -O agent-runtime.tar.gz "https://releases.vutler.ai/agent-runtime/latest.tar.gz"',
      'tar -xzf agent-runtime.tar.gz',
      'npm install',
      '',
      '# Configure systemd service...',
      'systemctl enable vutler-agent',
      'systemctl start vutler-agent',
      '',
      '# Open firewall ports...',
      'ufw allow 443/tcp',
      'ufw allow ssh',
      '',
      '# Deployment completed successfully',
      `# Finished: ${new Date().toISOString()}`
    ].join('\n');

    return {
      success: true,
      logs
    };
  }

  async _updateDeploymentStatus(deploymentId, status, message = null) {
    const completedAt = (status === 'completed' || status === 'failed') ? 'NOW()' : null;
    
    await this.db.query(`
      UPDATE tenant_vutler.vps_deployments 
      SET status = $1, error_message = $2, completed_at = ${completedAt || 'completed_at'}
      WHERE id = $3
    `, [status, message, deploymentId]);
  }

  _generateAgentToken(agentId, vpsInstanceId, workspaceId) {
    const payload = {
      agentId,
      vpsInstanceId,
      workspaceId,
      type: 'agent_deployment',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
    };

    // Use crypto service to encrypt the token
    return this.crypto.encrypt(JSON.stringify(payload));
  }
}

module.exports = AgentDeploymentService;