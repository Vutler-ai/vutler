/**
 * Vutler Cloud Client
 * 
 * Executes tasks via Vutler cloud agents instead of local processes
 */

class VutlerClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.VUTLER_API_URL || 'https://app.vutler.ai';
    this.apiKey = config.apiKey || process.env.VUTLER_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('VUTLER_API_KEY required for cloud agent execution');
    }
  }

  /**
   * Execute a task with a cloud agent
   */
  async executeTask(agentId, task, options = {}) {
    const startTime = Date.now();
    
    console.log(`☁️  Executing task via cloud agent: ${agentId}`);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/agents/${agentId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-User-Id': options.userId || 'default'
        },
        body: JSON.stringify({
          task,
          context: options.context || {},
          timeout: options.timeout || 300000,
          streaming: false
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloud agent error (${response.status}): ${error}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      const usage = result.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      if (!usage.totalTokens) {
        usage.totalTokens = usage.inputTokens + usage.outputTokens;
      }

      return {
        agentId,
        agentName: result.agent?.name || agentId,
        result: result.output || result.result,
        duration,
        cost: result.cost || 0,
        usage,
        timestamp: new Date().toISOString(),
        source: 'cloud'
      };
      
    } catch (error) {
      console.error(`❌ Cloud execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * List available cloud agents
   */
  async listAgents() {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/agents`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list agents: ${response.status}`);
      }

      const data = await response.json();
      return data.agents || [];
      
    } catch (error) {
      console.error(`Failed to list cloud agents: ${error.message}`);
      return [];
    }
  }

  /**
   * Get agent details
   */
  async getAgent(agentId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/agents/${agentId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.agent;
      
    } catch (error) {
      console.error(`Failed to get agent ${agentId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Health check
   */
  async ping() {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

module.exports = VutlerClient;
