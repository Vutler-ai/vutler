/**
 * chat-handler-runtime.js
 * Modified chat handler using the new agent runtime engine
 * 
 * INTEGRATION INSTRUCTIONS:
 * 1. Update your existing chat route handler (POST /api/agents/:id/chat)
 * 2. Replace the simple LLM call with AgentLoop.run()
 * 3. Handle streaming if needed
 * 
 * Example integration:
 * 
 * const AgentLoop = require('./runtime/agent-loop');
 * const agentLoop = new AgentLoop(pgPool, process.env.ANTHROPIC_API_KEY);
 * 
 * router.post('/agents/:id/chat', authMiddleware, async (req, res) => {
 *   const { message, stream = false } = req.body;
 *   const agentId = req.params.id;
 *   
 *   if (stream) {
 *     res.setHeader('Content-Type', 'text/event-stream');
 *     res.setHeader('Cache-Control', 'no-cache');
 *     res.setHeader('Connection', 'keep-alive');
 *     
 *     const result = await agentLoop.run(agentId, message, {
 *       streaming: true,
 *       onChunk: (text) => {
 *         res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
 *       }
 *     });
 *     
 *     res.write(`data: ${JSON.stringify({ type: 'done', ...result })}\n\n`);
 *     res.end();
 *   } else {
 *     const result = await agentLoop.run(agentId, message);
 *     res.json(result);
 *   }
 * });
 */

const AgentLoop = require('./runtime/agent-loop');

/**
 * Create a runtime-enabled chat handler
 * @param {object} pgPool - PostgreSQL pool instance
 * @param {string} anthropicApiKey - Anthropic API key
 * @returns {function} Express middleware handler
 */
function createRuntimeChatHandler(pgPool, anthropicApiKey) {
  const agentLoop = new AgentLoop(pgPool, anthropicApiKey);

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

      // Verify agent exists
      const agentCheck = await pgPool.query(
        'SELECT id FROM tenant_vutler.agent_llm_configs WHERE agent_id = $1',
        [agentId]
      );

      if (agentCheck.rowCount === 0) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Handle streaming vs regular response
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

        const result = await agentLoop.run(agentId, message, {
          streaming: true,
          onChunk: (text) => {
            res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
          }
        });

        // Send final summary
        res.write(`data: ${JSON.stringify({ 
          type: 'done', 
          iterations: result.iterations,
          toolCalls: result.toolCalls.length
        })}\n\n`);
        
        res.end();
      } else {
        // Regular non-streaming response
        const result = await agentLoop.run(agentId, message);
        
        res.json({
          success: true,
          response: result.response,
          metadata: {
            iterations: result.iterations,
            toolCallsCount: result.toolCalls.length,
            toolCalls: result.toolCalls
          }
        });
      }

    } catch (error) {
      console.error('[ChatHandler] Error:', error);
      
      if (res.headersSent) {
        // Streaming mode - send error event
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      } else {
        // Regular mode - send error response
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  };
}

/**
 * Alternative: Minimal integration wrapper
 * Use this if you want to keep your existing handler structure
 */
async function runAgentChat(pgPool, anthropicApiKey, agentId, message, options = {}) {
  const agentLoop = new AgentLoop(pgPool, anthropicApiKey);
  return await agentLoop.run(agentId, message, options);
}

module.exports = {
  createRuntimeChatHandler,
  runAgentChat
};
