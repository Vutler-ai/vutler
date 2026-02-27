/**
 * runtime-wrapper.js
 * CONSERVATIVE INTEGRATION — Add-on, not replacement
 * 
 * This wrapper checks if an agent has tools configured.
 * - If YES → Use new agent runtime
 * - If NO → Fallback to existing chat handler (unchanged)
 * 
 * ZERO breaking changes to existing functionality.
 */

const AgentLoop = require('./runtime/agent-loop');

class RuntimeWrapper {
  constructor(pgPool, anthropicApiKey) {
    this.pool = pgPool;
    this.anthropicApiKey = anthropicApiKey;
    this.agentLoop = null;
  }

  /**
   * Check if an agent has tools configured
   * Tools are enabled if agent has capabilities OR explicit tool config
   */
  async hasToolsEnabled(agentId) {
    try {
      const result = await this.pool.query(
        `SELECT capabilities, metadata
         FROM tenant_vutler.agent_llm_configs
         WHERE agent_id = $1`,
        [agentId]
      );

      if (result.rowCount === 0) {
        return false;
      }

      const config = result.rows[0];

      // Check if capabilities array exists and has items
      if (config.capabilities && Array.isArray(config.capabilities) && config.capabilities.length > 0) {
        return true;
      }

      // Check metadata for explicit tool enablement
      if (config.metadata && config.metadata.enable_tools === true) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('[RuntimeWrapper] Error checking tools:', error);
      return false; // Fail-safe: fallback to existing handler
    }
  }

  /**
   * Main entry point for chat
   * Routes to new runtime OR existing handler based on tool config
   * 
   * @param {string} agentId - Agent UUID
   * @param {string} message - User message
   * @param {function} existingHandler - Your existing chat handler function
   * @param {object} options - { streaming: bool, onChunk: function }
   * @returns {object} Response from runtime or existing handler
   */
  async handleChat(agentId, message, existingHandler, options = {}) {
    try {
      // Check if agent has tools enabled
      const hasTools = await this.hasToolsEnabled(agentId);

      if (hasTools) {
        // Use new runtime
        console.log(`[RuntimeWrapper] Agent ${agentId} has tools enabled → Using agent runtime`);
        return await this.runWithRuntime(agentId, message, options);
      } else {
        // Fallback to existing handler
        console.log(`[RuntimeWrapper] Agent ${agentId} has NO tools → Using existing handler`);
        return await existingHandler(agentId, message, options);
      }

    } catch (error) {
      console.error('[RuntimeWrapper] Error in handleChat:', error);
      
      // FAIL-SAFE: Always fallback to existing handler on error
      console.log('[RuntimeWrapper] Error caught → Falling back to existing handler');
      return await existingHandler(agentId, message, options);
    }
  }

  /**
   * Run with new agent runtime
   */
  async runWithRuntime(agentId, message, options = {}) {
    try {
      // Lazy-init agent loop
      if (!this.agentLoop) {
        this.agentLoop = new AgentLoop(this.pool, this.anthropicApiKey);
      }

      const result = await this.agentLoop.run(agentId, message, options);

      return {
        response: result.response,
        metadata: {
          runtime: 'agent-loop',
          iterations: result.iterations,
          toolCallsCount: result.toolCalls.length,
          toolCalls: result.toolCalls
        }
      };

    } catch (error) {
      console.error('[RuntimeWrapper] Agent runtime error:', error);
      throw error; // Let handleChat catch and fallback
    }
  }
}

/**
 * Express middleware factory
 * Drop-in replacement for your existing chat handler
 * 
 * Usage:
 * const { createConservativeHandler } = require('./runtime-wrapper');
 * 
 * // Your existing handler function
 * async function existingChatHandler(agentId, message, options) {
 *   // Your existing code...
 *   return { response: "...", metadata: {...} };
 * }
 * 
 * // Replace route handler
 * router.post('/agents/:id/chat', authMiddleware, 
 *   createConservativeHandler(pgPool, anthropicApiKey, existingChatHandler)
 * );
 */
function createConservativeHandler(pgPool, anthropicApiKey, existingHandler) {
  const wrapper = new RuntimeWrapper(pgPool, anthropicApiKey);

  return async (req, res) => {
    try {
      const { message, stream = false } = req.body;
      const agentId = req.params.id;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (!agentId) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }

      // Route to runtime or existing handler
      const result = await wrapper.handleChat(
        agentId, 
        message, 
        existingHandler,
        { 
          streaming: stream,
          onChunk: stream ? (text) => {
            res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
          } : null
        }
      );

      // Handle streaming vs regular response
      if (stream && !res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }

      if (stream) {
        if (result.metadata?.runtime === 'agent-loop') {
          res.write(`data: ${JSON.stringify({ type: 'done', ...result.metadata })}\n\n`);
        }
        res.end();
      } else {
        res.json({
          success: true,
          ...result
        });
      }

    } catch (error) {
      console.error('[ConservativeHandler] Error:', error);
      
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  };
}

/**
 * Simple wrapper function for manual integration
 * 
 * Usage:
 * const { conservativeChat } = require('./runtime-wrapper');
 * 
 * const result = await conservativeChat(
 *   pgPool,
 *   anthropicApiKey,
 *   agentId,
 *   message,
 *   existingChatHandler  // Your existing function
 * );
 */
async function conservativeChat(pgPool, anthropicApiKey, agentId, message, existingHandler, options = {}) {
  const wrapper = new RuntimeWrapper(pgPool, anthropicApiKey);
  return await wrapper.handleChat(agentId, message, existingHandler, options);
}

module.exports = {
  RuntimeWrapper,
  createConservativeHandler,
  conservativeChat
};
