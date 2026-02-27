/**
 * Patch for /app/api/chat.js — Agent @mention detection in Chat Pro
 * Sprint 15 — Connects agents to Chat Pro channels
 * 
 * After a message is posted in a channel, if it contains @agent_id mentions,
 * the system calls AgentLoop and posts the response in the same channel.
 */

// This code should be added AFTER the broadcastToChannel call in POST /channels/:id/messages
// and BEFORE the res.status(201) line.

// --- AGENT MENTION HANDLER ---
// Detects @mentions in chat messages and triggers agent responses

async function handleAgentMentions(req, channelId, content, senderName) {
  if (!content) return;
  
  // Extract @mentions (e.g., @code_bot, @sales_pro, @polyglot)
  const mentionRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  
  if (mentions.length === 0) return;
  
  const pool = pg(req);
  
  // Look up which mentions correspond to real agents
  for (const mentionName of mentions) {
    try {
      const { rows } = await pool.query(
        'SELECT agent_id, model FROM tenant_vutler.agent_llm_configs WHERE LOWER(agent_id) = $1',
        [mentionName]
      );
      
      if (rows.length === 0) continue;
      
      const agentId = rows[0].agent_id;
      
      // Strip the @mention from the message to get the actual query
      const userMessage = content.replace(new RegExp(`@${mentionName}\\b`, 'gi'), '').trim();
      if (!userMessage) continue;
      
      console.log(`[Chat Pro] Agent mention detected: @${agentId} in channel ${channelId}`);
      
      // Get API key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error('[Chat Pro] No ANTHROPIC_API_KEY configured, skipping agent response');
        continue;
      }
      
      // Call AgentLoop
      const AgentLoop = require('../runtime/agent-loop');
      const agentLoop = new AgentLoop(pool, apiKey);
      agentLoop.anthropicEndpoint = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';
      
      const result = await agentLoop.run(agentId, userMessage);
      
      if (result && result.response) {
        // Post agent response as a new message in the same channel
        const { rows: [agentMessage] } = await pool.query(`
          INSERT INTO chat_messages (channel_id, sender_id, sender_name, content, message_type)
          VALUES ($1, $2, $3, $4, 'text')
          RETURNING *
        `, [channelId, `agent:${agentId}`, agentId, result.response]);
        
        // Broadcast agent response via WebSocket
        broadcastToChannel(req, channelId, 'message_new', { message: agentMessage });
        
        console.log(`[Chat Pro] Agent ${agentId} responded (${result.iterations} iterations, ${result.toolCalls.length} tool calls)`);
      }
    } catch (err) {
      console.error(`[Chat Pro] Agent ${mentionName} error:`, err.message);
    }
  }
}
