'use strict';

const { publishChatMessage, normalizeRealtimeMessage } = require('./chatRealtime');

const OPTIONAL_COLUMNS = [
  'client_message_id',
  'attachments',
  'processing_state',
  'processing_attempts',
  'processing_started_at',
  'next_retry_at',
  'last_error',
  'reply_to_message_id',
  'requested_agent_id',
  'display_agent_id',
  'orchestrated_by',
  'executed_by',
  'metadata',
];

function normalizeChatMessage(row) {
  return normalizeRealtimeMessage(row);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function buildInsertPayload(message) {
  return {
    channel_id: message.channel_id,
    sender_id: message.sender_id,
    sender_name: message.sender_name,
    content: message.content,
    message_type: message.message_type || 'text',
    workspace_id: message.workspace_id,
    parent_id: hasOwn(message, 'parent_id') ? message.parent_id : undefined,
    client_message_id: hasOwn(message, 'client_message_id') ? message.client_message_id : undefined,
    attachments: hasOwn(message, 'attachments') ? JSON.stringify(message.attachments || []) : undefined,
    processed_at: hasOwn(message, 'processed_at') ? message.processed_at : undefined,
    processing_state: hasOwn(message, 'processing_state') ? message.processing_state : undefined,
    processing_attempts: hasOwn(message, 'processing_attempts') ? message.processing_attempts : undefined,
    processing_started_at: hasOwn(message, 'processing_started_at') ? message.processing_started_at : undefined,
    next_retry_at: hasOwn(message, 'next_retry_at') ? message.next_retry_at : undefined,
    last_error: hasOwn(message, 'last_error') ? message.last_error : undefined,
    reply_to_message_id: hasOwn(message, 'reply_to_message_id') ? message.reply_to_message_id : undefined,
    requested_agent_id: hasOwn(message, 'requested_agent_id') ? message.requested_agent_id : undefined,
    display_agent_id: hasOwn(message, 'display_agent_id') ? message.display_agent_id : undefined,
    orchestrated_by: hasOwn(message, 'orchestrated_by') ? message.orchestrated_by : undefined,
    executed_by: hasOwn(message, 'executed_by') ? message.executed_by : undefined,
    metadata: hasOwn(message, 'metadata') ? JSON.stringify(message.metadata) : undefined,
  };
}

async function insertChatMessage(pg, app, schema, message, options = {}) {
  const payload = buildInsertPayload(message);
  const publish = options.publish !== false;

  while (true) {
    const keys = Object.keys(payload).filter((key) => payload[key] !== undefined);
    const params = keys.map((key) => payload[key]);
    const placeholders = keys.map((_, index) => `$${index + 1}`);

    try {
      const result = await pg.query(
        `INSERT INTO ${schema}.chat_messages (${keys.join(', ')})\n         VALUES (${placeholders.join(', ')})\n         RETURNING *`,
        params
      );
      const row = result.rows[0];
      if (publish) publishChatMessage(app, row);
      return normalizeChatMessage(row);
    } catch (err) {
      const missing = OPTIONAL_COLUMNS.find(
        (column) => hasOwn(payload, column) && payload[column] !== undefined && err.message && err.message.includes(column)
      );
      if (!missing) throw err;
      delete payload[missing];
    }
  }
}

module.exports = { insertChatMessage, normalizeChatMessage };
