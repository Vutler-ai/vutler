// Load LLM keys from .env.llm
try { const _fs = require('fs'); _fs.readFileSync('/app/.env.llm','utf8').split('\n').forEach(l => { const i=l.indexOf('='); if(i>0) process.env[l.slice(0,i).trim()]=l.slice(i+1).trim(); }); } catch(e) {}

/**
 * agent-loop.js [PATCHED]
 * Le cœur du runtime : message → recall → prompt → LLM → tools → observe → loop → save → respond
 * 
 * FIXES:
 * - updateRuntimeStatus: last_heartbeat → last_activity, error_message → config
 * - getAgentLLMConfig: removed metadata column (doesn't exist)
 */

const MemoryManager = require('./memory-manager');
const SystemPromptBuilder = require('./system-prompt-builder');
const TasksToolHandler = require('./tools/tasks');
const GoalsToolHandler = require('./tools/goals');
const MemoriesToolHandler = require('./tools/memories');
const EmailToolHandler = require('./tools/email');
const WebSearchToolHandler = require('./tools/web-search');
const CalendarToolHandler = require('./tools/calendar');

class AgentLoop {
  constructor(pgPool, anthropicApiKey) {
    this.pool = pgPool;
    this.anthropicApiKey = anthropicApiKey;
    this.anthropicEndpoint = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';
    this.maxIterations = 10;
    
    // Initialize managers
    this.memoryManager = new MemoryManager(pgPool);
    this.promptBuilder = new SystemPromptBuilder(pgPool, this.memoryManager);
  }

  /**
   * Initialize tools for a specific agent
   */
  initializeTools(agentId) {
    this.tools = {
      tasks: new TasksToolHandler(this.pool),
      goals: new GoalsToolHandler(this.pool),
      memories: new MemoriesToolHandler(this.pool, agentId),
      email: new EmailToolHandler(),
      webSearch: new WebSearchToolHandler(),
      calendar: new CalendarToolHandler(this.pool)
    };
  }

  /**
   * Get all tool definitions for Anthropic API
   */
  getToolDefinitions() {
    const definitions = [];
    for (const [key, handler] of Object.entries(this.tools)) {
      definitions.push(...handler.getDefinitions());
    }
    return definitions;
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolName, args) {
    // Find which handler owns this tool
    for (const [key, handler] of Object.entries(this.tools)) {
      const defs = handler.getDefinitions();
      if (defs.some(d => d.name === toolName)) {
        return await handler.execute(toolName, args);
      }
    }
    return { error: `Tool not found: ${toolName}` };
  }

  /**
   * Main agent loop
   * @param {string} agentId - UUID de l'agent
   * @param {string} userMessage - Message de l'utilisateur
   * @param {object} options - { streaming: boolean, onChunk: function }
   * @returns {object} { response: string, toolCalls: array, iterations: number }
   */
  async run(agentId, userMessage, options = {}) {
    const { streaming = false, onChunk = null } = options;

    try {
      // Initialize tools for this agent
      this.initializeTools(agentId);

      // 1. Update runtime status
      await this.updateRuntimeStatus(agentId, 'running');

      // 2. Build system prompt (includes memory recall)
      const systemPrompt = await this.promptBuilder.build(agentId, userMessage);

      // 3. Get agent LLM config
      const config = await this.getAgentLLMConfig(agentId);

      // 4. Initialize conversation messages
      const messages = [{ role: 'user', content: userMessage }];
      const toolDefinitions = this.getToolDefinitions();

      let iteration = 0;
      let finalResponse = '';
      const toolCallsLog = [];

      // 5. Main loop: LLM → tools → LLM → tools...
      while (iteration < this.maxIterations) {
        iteration++;

        // Call Anthropic API
        const llmResponse = await this.callAnthropic(
          systemPrompt,
          messages,
          toolDefinitions,
          config,
          streaming && iteration === 1 ? onChunk : null
        );

        if (llmResponse.error) {
          throw new Error(llmResponse.error);
        }

        // Check stop reason
        const { stop_reason, content } = llmResponse;

        // Process content blocks
        for (const block of content) {
          if (block.type === 'text') {
            finalResponse += block.text;
          } else if (block.type === 'tool_use') {
            // Execute tool
            console.log(`[AgentLoop] Tool call: ${block.name}`, block.input);
            const toolResult = await this.executeTool(block.name, block.input);
            
            toolCallsLog.push({
              tool: block.name,
              input: block.input,
              result: toolResult
            });

            // Add tool result to messages
            messages.push({
              role: 'assistant',
              content: content
            });

            messages.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(toolResult)
                }
              ]
            });

            // Continue loop to let LLM process tool result
            break;
          }
        }

        // If stop_reason is 'end_turn', we're done
        if (stop_reason === 'end_turn') {
          break;
        }

        // If stop_reason is 'max_tokens', we hit limit
        if (stop_reason === 'max_tokens') {
          console.warn('[AgentLoop] Hit max tokens');
          break;
        }

        // If no tool_use blocks found and stop_reason is tool_use, something's wrong
        if (stop_reason === 'tool_use' && !content.some(b => b.type === 'tool_use')) {
          console.warn('[AgentLoop] Unexpected stop_reason: tool_use with no tool blocks');
          break;
        }
      }

      // 6. Save conversation to memory
      await this.memoryManager.autoSave(agentId, userMessage, finalResponse, {
        iterations: iteration,
        toolCalls: toolCallsLog.length
      });

      // 7. Update runtime status
      await this.updateRuntimeStatus(agentId, 'idle');

      return {
        response: finalResponse,
        toolCalls: toolCallsLog,
        iterations: iteration
      };

    } catch (error) {
      console.error('[AgentLoop] Error:', error);
      await this.updateRuntimeStatus(agentId, 'error', { error: error.message });
      throw error;
    }
  }

  /**
   * Call Anthropic API
   */
  async callAnthropic(systemPrompt, messages, tools, config, onChunk = null) {
    try {
      const payload = {
        model: config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: config.max_tokens || 4096,
        temperature: config.temperature || 0.7,
        system: systemPrompt,
        messages: messages,
        tools: tools
      };

      if (onChunk) {
        payload.stream = true;
      }

      const response = await fetch(this.anthropicEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
      }

      if (onChunk) {
        // Handle streaming response
        return await this.handleStreamingResponse(response, onChunk);
      } else {
        // Handle regular response
        return await response.json();
      }

    } catch (error) {
      console.error('[AgentLoop] Anthropic API error:', error);
      return { error: error.message };
    }
  }

  /**
   * Handle streaming response from Anthropic
   */
  async handleStreamingResponse(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = [];
    let stopReason = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              if (event.type === 'content_block_delta' && event.delta?.text) {
                onChunk(event.delta.text);
                // Accumulate for return
                if (fullContent.length === 0 || fullContent[fullContent.length - 1].type !== 'text') {
                  fullContent.push({ type: 'text', text: '' });
                }
                fullContent[fullContent.length - 1].text += event.delta.text;
              } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                fullContent.push({
                  type: 'tool_use',
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: {}
                });
              } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
                // Accumulate tool input
                const lastBlock = fullContent[fullContent.length - 1];
                if (lastBlock && lastBlock.type === 'tool_use') {
                  if (!lastBlock.inputJson) lastBlock.inputJson = '';
                  lastBlock.inputJson += event.delta.partial_json;
                }
              } else if (event.type === 'content_block_stop') {
                // Finalize tool input
                const lastBlock = fullContent[fullContent.length - 1];
                if (lastBlock && lastBlock.type === 'tool_use' && lastBlock.inputJson) {
                  lastBlock.input = JSON.parse(lastBlock.inputJson);
                  delete lastBlock.inputJson;
                }
              } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
                stopReason = event.delta.stop_reason;
              }
            } catch (e) {
              console.error('[AgentLoop] Streaming parse error:', e);
            }
          }
        }
      }

      return {
        stop_reason: stopReason || 'end_turn',
        content: fullContent
      };

    } catch (error) {
      console.error('[AgentLoop] Streaming error:', error);
      throw error;
    }
  }

  /**
   * Get agent LLM config
   * PATCHED: removed metadata column (doesn't exist in schema)
   */
  async getAgentLLMConfig(agentId) {
    try {
      const result = await this.pool.query(
        `SELECT provider, model, temperature, max_tokens
         FROM tenant_vutler.agent_llm_configs
         WHERE agent_id = $1`,
        [agentId]
      );

      if (result.rows.length === 0) {
        // Return defaults
        return {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          temperature: 0.7
        };
      }

      return result.rows[0];
    } catch (error) {
      console.error('[AgentLoop] Config fetch error:', error);
      return {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.7
      };
    }
  }

  /**
   * Update agent runtime status
   * PATCHED: last_heartbeat → last_activity, error_message → config
   */
  async updateRuntimeStatus(agentId, status, configData = null) {
    try {
      const config = configData ? JSON.stringify(configData) : null;
      
      await this.pool.query(
        `INSERT INTO tenant_vutler.agent_runtime_status
         (agent_id, status, last_activity, config, created_at, workspace_id)
         VALUES ($1, $2, NOW(), $3, NOW(), '00000000-0000-0000-0000-000000000001')
         ON CONFLICT (agent_id)
         DO UPDATE SET
           status = EXCLUDED.status,
           last_activity = EXCLUDED.last_activity,
           config = COALESCE(EXCLUDED.config, agent_runtime_status.config)`,
        [agentId, status, config]
      );
    } catch (error) {
      console.error('[AgentLoop] Status update error:', error);
    }
  }
}

module.exports = AgentLoop;
