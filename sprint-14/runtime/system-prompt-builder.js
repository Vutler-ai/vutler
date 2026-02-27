/**
 * system-prompt-builder.js
 * Construit le system prompt dynamique pour l'agent
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
      // 1. Récupère la config de l'agent
      const config = await this.getAgentConfig(agentId);
      if (!config) {
        throw new Error(`Agent config not found for ${agentId}`);
      }

      // 2. Récupère les memories pertinentes
      const memories = await this.memoryManager.recall(agentId, userMessage, 5);

      // 3. Récupère les tasks assignées
      const tasks = await this.getAssignedTasks(agentId);

      // 4. Build le prompt
      const prompt = this.assemblePrompt(config, memories, tasks);

      return prompt;
    } catch (error) {
      console.error('[SystemPromptBuilder] Error:', error);
      // Fallback vers prompt minimal
      return this.getMinimalPrompt();
    }
  }

  /**
   * Récupère la config LLM de l'agent
   */
  async getAgentConfig(agentId) {
    try {
      const result = await this.pool.query(
        `SELECT agent_id, name, role, mbti_type, soul, capabilities, system_prompt_template, metadata
         FROM tenant_vutler.agent_llm_configs
         WHERE agent_id = $1`,
        [agentId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[SystemPromptBuilder] Config fetch error:', error);
      return null;
    }
  }

  /**
   * Récupère les tasks assignées à l'agent
   */
  async getAssignedTasks(agentId) {
    try {
      const result = await this.pool.query(
        `SELECT id, title, description, status, priority, due_date
         FROM tenant_vutler.tasks
         WHERE assigned_to = $1
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
  assemblePrompt(config, memories, tasks) {
    const now = new Date().toISOString();
    const parts = [];

    // Header
    parts.push(`# Agent Identity`);
    parts.push(`Name: ${config.name || 'Agent'}`);
    parts.push(`Role: ${config.role || 'AI Assistant'}`);
    if (config.mbti_type) {
      parts.push(`Personality: ${config.mbti_type}`);
    }
    parts.push(`\nCurrent DateTime: ${now}`);
    parts.push(`Workspace ID: 00000000-0000-0000-0000-000000000001`);

    // SOUL
    if (config.soul) {
      parts.push(`\n# Core Identity (SOUL)`);
      parts.push(config.soul);
    }

    // Capabilities
    if (config.capabilities && config.capabilities.length > 0) {
      parts.push(`\n# Capabilities`);
      parts.push(config.capabilities.join(', '));
    }

    // Recent Memories
    if (memories.length > 0) {
      parts.push(`\n# Recent Memories`);
      memories.forEach((m, idx) => {
        parts.push(`[${idx + 1}] ${m.memory_type}: ${m.content}`);
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
    if (config.system_prompt_template) {
      parts.push(`\n# Instructions`);
      parts.push(config.system_prompt_template);
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
