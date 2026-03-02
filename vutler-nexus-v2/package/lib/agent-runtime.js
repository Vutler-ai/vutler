/**
 * @vutler/nexus — Agent Runtime Engine
 * Handles LLM interactions via multiple providers, tool execution, and conversation management
 */
const { EventEmitter } = require('events');
const { FileManager } = require('./file-manager');
const { ToolExecutor } = require('./tools');
const { getProvider } = require('./llm-providers');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_TOOL_CALLS_PER_MESSAGE = 10;

class AgentRuntime extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.fileManager = new FileManager(config.workspace);
    this.toolExecutor = new ToolExecutor({
      workspace: config.workspace,
      permissions: config.permissions || {},
      configDir: config.configDir || path.join(os.homedir(), '.vutler')
    });
    this.conversationHistory = [];
    this.systemPrompt = null;
    this.llmProvider = null;
    
    this.loadSystemPrompt();
    this.initializeLLMProvider();
  }

  async initializeLLMProvider() {
    try {
      const providerName = this.config.llm?.provider || 'claude-code';
      console.log(`[runtime] 🔄 Initializing LLM provider: ${providerName}`);
      
      this.llmProvider = getProvider(providerName);
      const providerConfig = this.getProviderConfig();
      await this.llmProvider.init(providerConfig);
      console.log(`[runtime] ✅ LLM provider ${providerName} initialized`);
    } catch (error) {
      console.error(`[runtime] ❌ Failed to initialize LLM provider: ${error.message}`);
      this.llmProvider = null;
    }
  }

  getProviderConfig() {
    const llmConfig = this.config.llm || {};
    
    const baseConfig = {
      provider: llmConfig.provider,
      model: llmConfig.model,
      maxTokens: llmConfig.maxTokens,
      temperature: llmConfig.temperature,
    };
    
    switch (llmConfig.provider) {
      case 'claude-code':
        return { ...baseConfig, claudePath: llmConfig.claudePath || 'claude' };
      case 'anthropic':
        return { ...baseConfig, apiKey: llmConfig.apiKey };
      case 'openai':
        return { ...baseConfig, apiKey: llmConfig.apiKey, baseUrl: llmConfig.baseUrl || 'https://api.openai.com/v1' };
      case 'ollama':
        return { ...baseConfig, ollamaHost: llmConfig.ollamaHost || 'localhost', ollamaPort: llmConfig.ollamaPort || 11434 };
      case 'kimi':
        return { ...baseConfig, apiKey: llmConfig.apiKey, baseUrl: 'https://api.moonshot.cn/v1' };
      default:
        return baseConfig;
    }
  }

  loadSystemPrompt() {
    try {
      if (this.config.agent.systemPrompt === 'auto') {
        const contextFiles = this.config.agent.contextFiles || [];
        this.systemPrompt = this.fileManager.loadContextFiles(contextFiles);
        if (!this.systemPrompt) {
          this.systemPrompt = this.getDefaultSystemPrompt();
        }
      } else {
        this.systemPrompt = this.config.agent.systemPrompt || this.getDefaultSystemPrompt();
      }
      
      // Append tools description to system prompt
      const toolsDesc = this.toolExecutor.getToolsDescription();
      if (toolsDesc) {
        this.systemPrompt += toolsDesc;
      }
      
      console.log('[runtime] ✅ System prompt loaded');
    } catch (error) {
      console.warn('[runtime] ⚠️  Could not load system prompt, using default');
      this.systemPrompt = this.getDefaultSystemPrompt();
    }
  }

  getDefaultSystemPrompt() {
    const providerName = this.config.llm?.provider || 'claude-code';
    return `You are ${this.config.agent.name || 'Jarvis'}, an AI assistant running locally on this machine via ${providerName}.

You have access to the local file system and can:
- Read and write files in the workspace
- Search through documents
- Keep memory notes
- Execute shell commands (when enabled)

Current workspace: ${this.config.workspace}

Be helpful, accurate, and respect the user's privacy. All data stays local.`;
  }

  // Process a chat message through the LLM with multi-turn tool loop
  async processMessage(message, options = {}) {
    if (!this.canUseLLM()) {
      throw new Error(`LLM not configured. Please set up ${this.config.llm?.provider || 'a provider'}.`);
    }
    if (!this.llmProvider) {
      throw new Error('LLM provider not initialized');
    }

    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      const messages = this.buildMessages();
      const tools = this.getToolsForProvider();
      let allToolResults = [];
      let totalToolCalls = 0;
      let finalContent = '';

      // Multi-turn tool loop
      let currentMessages = [...messages];
      
      while (totalToolCalls < MAX_TOOL_CALLS_PER_MESSAGE) {
        const response = await this.llmProvider.chat(currentMessages, {
          ...options,
          tools: tools.length > 0 ? tools : undefined
        });

        // Accumulate text content
        if (response.content) {
          finalContent += response.content;
        }

        // If no tool calls, we're done
        if (!response.toolUses || response.toolUses.length === 0) {
          break;
        }

        // Execute tool calls
        const batchResults = [];
        for (const toolUse of response.toolUses) {
          totalToolCalls++;
          if (totalToolCalls > MAX_TOOL_CALLS_PER_MESSAGE) {
            batchResults.push({
              tool_use_id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
              result: { success: false, error: 'Tool call limit reached (max 10 per message)' },
              status: 'error'
            });
            break;
          }

          console.log(`[runtime] 🔧 Tool call ${totalToolCalls}/${MAX_TOOL_CALLS_PER_MESSAGE}: ${toolUse.name}`);
          
          // Emit tool start event for UI
          if (options.onChunk) {
            options.onChunk({ type: 'tool_start', tool: toolUse.name, input: toolUse.input, id: toolUse.id });
          }

          const result = await this.toolExecutor.execute(toolUse.name, toolUse.input);
          
          const toolResult = {
            tool_use_id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input,
            result,
            status: result.success !== false ? 'done' : 'error'
          };
          batchResults.push(toolResult);
          allToolResults.push(toolResult);

          // Emit tool result event for UI
          if (options.onChunk) {
            options.onChunk({ type: 'tool_result', ...toolResult });
          }
        }

        // Build follow-up messages with tool results
        // Add assistant message with tool_use
        currentMessages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolUses.map(tu => ({
            id: tu.id,
            name: tu.name,
            input: tu.input
          }))
        });

        // Add tool results as a message
        const toolResultContent = batchResults.map(r => {
          const output = r.result.output || r.result.error || JSON.stringify(r.result);
          return `[${r.name}] ${r.status === 'error' ? 'ERROR: ' : ''}${output}`;
        }).join('\n\n');

        currentMessages.push({
          role: 'user',
          content: `Tool results:\n${toolResultContent}\n\nContinue based on these results.`
        });

        // If we hit the limit, break
        if (totalToolCalls >= MAX_TOOL_CALLS_PER_MESSAGE) break;
      }

      // Add final response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toISOString()
      });

      return { content: finalContent, toolUses: allToolResults.map(r => ({ name: r.name, input: r.input })), toolResults: allToolResults };

    } catch (error) {
      console.error('[runtime] Error processing message:', error);
      throw new Error(`Failed to process message: ${error.message}`);
    }
  }

  buildMessages() {
    const messages = [];
    
    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }
    
    // Keep last 20 messages for context
    const recentHistory = this.conversationHistory.slice(-20);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    
    return messages;
  }

  // Get tools formatted for the current provider
  getToolsForProvider() {
    const provider = this.config.llm?.provider || 'claude-code';
    if (provider === 'openai' || provider === 'kimi') {
      return this.toolExecutor.getOpenAITools();
    }
    return this.toolExecutor.getClaudeTools();
  }

  // Legacy compatibility - still expose getAllTools
  getAllTools() {
    return this.toolExecutor.getAvailableTools();
  }

  canUseLLM() {
    return !!this.llmProvider;
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getHistory() {
    return [...this.conversationHistory];
  }

  saveConversation(filePath) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        config: {
          provider: this.config.llm?.provider,
          model: this.config.llm?.model,
          agent: this.config.agent.name
        },
        history: this.conversationHistory
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return 'Conversation saved successfully';
    } catch (error) {
      throw new Error(`Failed to save conversation: ${error.message}`);
    }
  }

  loadConversation(filePath) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.conversationHistory = data.history || [];
      return `Conversation loaded: ${data.history?.length || 0} messages`;
    } catch (error) {
      throw new Error(`Failed to load conversation: ${error.message}`);
    }
  }

  async updateConfig(newConfig) {
    const oldProvider = this.config.llm?.provider;
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.agent) this.loadSystemPrompt();
    if (newConfig.workspace) {
      this.fileManager = new FileManager(newConfig.workspace);
      this.toolExecutor = new ToolExecutor({
        workspace: newConfig.workspace,
        permissions: this.config.permissions || {},
        configDir: this.config.configDir || path.join(os.homedir(), '.vutler')
      });
    }
    if (newConfig.permissions) {
      this.toolExecutor.permissions = { ...this.toolExecutor.permissions, ...newConfig.permissions };
      this.loadSystemPrompt(); // Refresh tools in system prompt
    }
    
    if (newConfig.llm && (newConfig.llm.provider !== oldProvider || newConfig.llm.apiKey || newConfig.llm.baseUrl)) {
      await this.initializeLLMProvider();
    }
  }

  async testConnection() {
    if (!this.llmProvider) throw new Error('LLM provider not initialized');
    try {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello! This is a connection test. Please respond briefly.' }
      ];
      const response = await this.llmProvider.chat(messages, { stream: false });
      if (response && response.content) {
        return {
          success: true,
          provider: this.llmProvider.name,
          model: this.config.llm?.model,
          response: response.content.substring(0, 100) + (response.content.length > 100 ? '...' : '')
        };
      }
      throw new Error('No response received');
    } catch (error) {
      return { success: false, provider: this.llmProvider.name, error: error.message };
    }
  }

  getStatus() {
    return {
      llmConfigured: this.canUseLLM(),
      llmProvider: this.config.llm?.provider,
      llmProviderReady: !!this.llmProvider,
      systemPromptLoaded: !!this.systemPrompt,
      conversationLength: this.conversationHistory.length,
      workspace: this.config.workspace,
      model: this.config.llm?.model,
      agentName: this.config.agent?.name,
      toolsAvailable: this.toolExecutor.getAvailableTools().length,
      permissions: this.config.permissions || {}
    };
  }
}

module.exports = { AgentRuntime };
