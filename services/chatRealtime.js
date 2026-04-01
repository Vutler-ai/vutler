'use strict';

const { publishMessage } = require('../api/ws-chat');

function normalizeRealtimeMessage(row) {
  if (!row) return null;
  let attachments = row.attachments || [];
  if (typeof attachments === 'string') {
    try {
      attachments = JSON.parse(attachments);
    } catch (_) {
      attachments = [];
    }
  }
  return {
    id: row.id,
    channel_id: row.channel_id,
    content: row.content,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    message_type: row.message_type || 'text',
    parent_id: row.parent_id || null,
    client_message_id: row.client_message_id || null,
    attachments,
    reply_to_message_id: row.reply_to_message_id || null,
    requested_agent_id: row.requested_agent_id || null,
    display_agent_id: row.display_agent_id || null,
    orchestrated_by: row.orchestrated_by || null,
    executed_by: row.executed_by || null,
    metadata: row.metadata || null,
    created_at: row.created_at,
  };
}

function publishChatMessage(_app, row) {
  const message = normalizeRealtimeMessage(row);
  if (!message?.channel_id) return;
  try {
    publishMessage(message);
  } catch (err) {
    console.warn('[ChatRealtime] publish error:', err.message);
  }
}

module.exports = { publishChatMessage, normalizeRealtimeMessage };
