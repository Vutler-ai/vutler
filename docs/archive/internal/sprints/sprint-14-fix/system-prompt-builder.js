/**
 * system-prompt-builder.js [PATCHED]
 * Construit le system prompt dynamique pour l'agent
 * 
 * FIXES:
 * - getAgentConfig: agent_llm_configs doesn't have name, soul, mbti, capabilities
 * - Use config from agent_runtime_status for identity data
 * - assigned_to → assignee in tasks query
 */

class SystemPromptBuilder {
  constructor(pgPool, memoryManager) {
    this.pool = pgPool;
    this.memoryManager = memoryManager;
  }

  /**
   * Build le system prompt complet pour un agent
   * @param {string} agentId - UUID de l'agent
   * @param {string} userMessage - Message de l'utilisateur (pour context)
   * @returns {string} System prompt complet
   */
  async build(agentId, userMessage = '') {
    try {
      // 1. Récupère la config de l'agent (LLM + runtime)
      const llmConfig = await this.getAgentLLMConfig(agentId);
      const runtimeConfig = await this.getAgentRuntimeConfig(agentId);

      // 2. Récupère les memories pertinentes
      const memories = await this.memoryManager.recall(agentId, userMessage, 5);

      // 3. Récupère les tasks assignées
      const tasks = await this.getAssignedTasks(agentId);

      // 4. Build le prompt
      const prompt = this.assemblePrompt(llmConfig, runtimeConfig, memories, tasks);

      return prompt;
    } catch (error) {
      console.error('[SystemPromptBuilder] Error:', error);
      // Fallback vers prompt minimal
      return this.getMinimalPrompt();
    }
  }

  /**
   * Récupère la config LLM de l'agent
   * PATCHED: only query existing columns
   */
  async getAgentLLMConfig(agentId) {
    try {
      const result = await this.pool.query(
        `SELECT provider, model, temperature, max_tokens
         FROM tenant_vutler.agent_llm_configs
         WHERE agent_id = $1`,
        [agentId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[SystemPromptBuilder] LLM config fetch error:', error);
      return null;
    }
  }

  /**
   * Récupère la config runtime (identity data)
   * NEW: get identity from agent_runtime_status.config
   */
  async getAgentRuntimeConfig(agentId) {
    try {
      const result = await this.pool.query(
        `SELECT config
         FROM tenant_vutler.agent_runtime_status
         WHERE agent_id = $1`,
        [agentId]
      );

      if (result.rows[0] && result.rows[0].config) {
        return result.rows[0].config;
      }

      // Fallback: hardcoded identity
      return {
        name: 'Agent',
        role: 'AI Assistant',
        mbti_type: null,
        soul: 'You are a helpful AI agent.',
        capabilities: ['tasks', 'goals', 'memories', 'calendar'],
        system_prompt_template: null
      };
    } catch (error) {
      console.error('[SystemPromptBuilder] Runtime config fetch error:', error);
      return {
        name: 'Agent',
        role: 'AI Assistant',
        soul: 'You are a helpful AI agent.',
        capabilities: []
      };
    }
  }

  /**
   * Récupère les tasks assignées à l'agent
   * PATCHED: assigned_to → assignee
   */
  async getAssignedTasks(agentId) {
    try {
      const result = await this.pool.query(
        `SELECT id, title, description, status, priority, due_date
         FROM tenant_vutler.tasks
         WHERE assignee = $1
           AND status != 'done'
         ORDER BY priority DESC, due_date ASC NULLS LAST
         LIMIT 10`,
        [agentId]
      );

      return result.rows;
    } catch (error) {
      console.error('[SystemPromptBuilder] Tasks fetch error:', error);
      return [];
    }
  }

  /**
   * Assemble tous les éléments en un system prompt cohérent
   */
  assemblePrompt(llmConfig, runtimeConfig, memories, tasks) {
    const now = new Date().toISOString();
    const parts = [];

    // Header
    parts.push(`# Agent Identity`);
    parts.push(`Name: ${runtimeConfig.name || 'Agent'}`);
    parts.push(`Role: ${runtimeConfig.role || 'AI Assistant'}`);
    if (runtimeConfig.mbti_type) {
      parts.push(`Personality: ${runtimeConfig.mbti_type}`);
    }
    parts.push(`\nCurrent DateTime: ${now}`);
    parts.push(`Workspace ID: 00000000-0000-0000-0000-000000000001`);

    // SOUL
    if (runtimeConfig.soul) {
      parts.push(`\n# Core Identity (SOUL)`);
      parts.push(runtimeConfig.soul);
    }

    // Capabilities
    if (runtimeConfig.capabilities && runtimeConfig.capabilities.length > 0) {
      parts.push(`\n# Capabilities`);
      parts.push(runtimeConfig.capabilities.join(', '));
    }

    // Recent Memories
    if (memories.length > 0) {
      parts.push(`\n# Recent Memories`);
      memories.forEach((m, idx) => {
        const memType = m.type || m.memory_type || 'note';
        parts.push(`[${idx + 1}] ${memType}: ${m.content}`);
      });
    }

    // Assigned Tasks
    if (tasks.length > 0) {
      parts.push(`\n# Your Current Tasks`);
      tasks.forEach((t, idx) => {
        const dueDate = t.due_date ? ` (due: ${t.due_date})` : '';
        parts.push(`[${idx + 1}] ${t.title}${dueDate} - ${t.status} [${t.priority}]`);
        if (t.description) {
          parts.push(`    ${t.description}`);
        }
      });
    }

    // Custom system prompt template
    if (runtimeConfig.system_prompt_template) {
      parts.push(`\n# Instructions`);
      parts.push(runtimeConfig.system_prompt_template);
    }

    // Tool usage instructions
    parts.push(`\n# Tool Usage`);
    parts.push(`You have access to various tools. Use them proactively to accomplish tasks.`);
    parts.push(`Always think step-by-step and use the appropriate tool for each action.`);
    parts.push(`If a tool fails, try an alternative approach or inform the user gracefully.`);

    return parts.join('\n');
  }

  /**
   * Prompt minimal de fallback
   */
  getMinimalPrompt() {
    return `You are an AI agent assistant. Current time: ${new Date().toISOString()}`;
  }
}

module.exports = SystemPromptBuilder;
