class AgentWorker {
  constructor(config, providers, sniparaClient) {
    this.id = config.id;
    this.name = config.name || config.username;
    this.systemPrompt = config.system_prompt || '';
    this.model = config.model || 'gpt-4o';
    this.sniparaScope = config.snipara_instance_id || config.id;
    this.tools = config.tools || ['filesystem', 'shell'];
    this.skills = config.skills || [];
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.max_tokens || 2000;
    this.providers = providers;
    this.sniparaClient = sniparaClient;
    this.status = 'idle'; // idle, busy, stopped
    this.tasksCompleted = 0;
    this.currentTask = null;
  }

  async execute(task) {
    this.status = 'busy';
    this.currentTask = task.id;
    const startTime = Date.now();

    try {
      // 1. Load memory from Snipara
      let memories = '';
      if (this.sniparaClient) {
        try {
          const recalled = await this.sniparaClient.recall(
            `context for: ${task.title || task.description}`,
            { scope: this.sniparaScope }
          );
          if (recalled && recalled.memories) {
            memories = recalled.memories.map(m => m.content).join('\n');
          }
        } catch (e) { /* memory unavailable, continue */ }
      }

      // 2. Determine execution method based on task metadata
      const provider = task.metadata?.provider;
      let result;

      if (provider === 'shell' || (task.description || '').startsWith('shell:')) {
        const command = task.metadata?.command || (task.description || '').replace(/^shell:\s*/, '');
        result = await this.providers.shell.exec(command);
      } else if (provider === 'filesystem') {
        result = await this.providers.fs.read(task.metadata?.path);
      } else if (this.providers.llm) {
        // LLM-based execution with agent personality
        const prompt = [
          { role: 'system', content: `${this.systemPrompt}\n\n## Context from memory:\n${memories}` },
          { role: 'user', content: task.description || task.title }
        ];
        result = await this.providers.llm.ask(prompt, {
          model: this.model,
          temperature: this.temperature,
          max_tokens: this.maxTokens
        });
      } else {
        result = `Agent ${this.name} received task but no suitable provider available`;
      }

      // 3. Remember the result
      if (this.sniparaClient) {
        try {
          const resultSummary = typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500);
          const memContent = `Completed task: "${task.title}". Result: ${resultSummary}`;
          console.log(`[Memory] Agent ${this.name} auto-remembering task completion (importance: 6)`);
          await this.sniparaClient.remember(this.sniparaScope, memContent, {
            type: 'action_log',
            importance: 6,
          });
        } catch (e) { /* fire and forget */ }
      }

      this.tasksCompleted++;
      this.status = 'idle';
      this.currentTask = null;
      return { success: true, output: result, duration_ms: Date.now() - startTime };

    } catch (error) {
      this.status = 'idle';
      this.currentTask = null;
      return { success: false, error: error.message, duration_ms: Date.now() - startTime };
    }
  }
}

module.exports = AgentWorker;
