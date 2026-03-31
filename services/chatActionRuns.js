'use strict';

const OPTIONAL_COLUMNS = new Set([
  'requested_agent_id',
  'display_agent_id',
  'orchestrated_by',
  'executed_by',
  'input_json',
  'output_json',
  'error_json',
  'completed_at',
]);

function isMissingChatActionRunsSchemaError(err) {
  const message = String(err?.message || '');
  return /chat_action_runs|requested_agent_id|display_agent_id|orchestrated_by|executed_by|input_json|output_json|error_json|completed_at|started_at/i.test(message);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

async function insertChatActionRun(pg, schema, payload) {
  if (!pg || !schema || !payload) return null;

  const row = {
    workspace_id: payload.workspace_id,
    chat_message_id: payload.chat_message_id,
    channel_id: payload.channel_id,
    requested_agent_id: payload.requested_agent_id,
    display_agent_id: payload.display_agent_id,
    orchestrated_by: payload.orchestrated_by,
    executed_by: payload.executed_by,
    action_key: payload.action_key,
    adapter: payload.adapter,
    status: payload.status || 'running',
    input_json: hasOwn(payload, 'input_json') ? JSON.stringify(payload.input_json) : undefined,
    output_json: hasOwn(payload, 'output_json') ? JSON.stringify(payload.output_json) : undefined,
    error_json: hasOwn(payload, 'error_json') ? JSON.stringify(payload.error_json) : undefined,
    started_at: payload.started_at || new Date(),
    completed_at: payload.completed_at,
  };

  while (true) {
    const keys = Object.keys(row).filter((key) => row[key] !== undefined);
    const values = keys.map((key) => row[key]);
    const placeholders = keys.map((_, index) => `$${index + 1}`);

    try {
      const result = await pg.query(
        `INSERT INTO ${schema}.chat_action_runs (${keys.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        values
      );
      return result.rows[0] || null;
    } catch (err) {
      if (isMissingChatActionRunsSchemaError(err) && /relation .*chat_action_runs.* does not exist/i.test(String(err?.message || ''))) {
        return null;
      }
      const missingColumn = keys.find((key) => OPTIONAL_COLUMNS.has(key) && err.message && err.message.includes(key));
      if (!missingColumn) throw err;
      delete row[missingColumn];
    }
  }
}

async function updateChatActionRun(pg, schema, runId, patch = {}) {
  if (!pg || !schema || !runId) return null;

  const updates = [];
  const params = [];
  let idx = 1;

  const assign = (column, value, serializer = (v) => v) => {
    if (value === undefined) return;
    updates.push(`${column} = $${idx++}`);
    params.push(serializer(value));
  };

  assign('status', patch.status);
  assign('executed_by', patch.executed_by);
  assign('output_json', patch.output_json, (value) => JSON.stringify(value));
  assign('error_json', patch.error_json, (value) => JSON.stringify(value));
  assign('completed_at', patch.completed_at || (patch.status && patch.status !== 'running' ? new Date() : undefined));

  if (updates.length === 0) return null;

  params.push(runId);
  const result = await pg.query(
    `UPDATE ${schema}.chat_action_runs
     SET ${updates.join(', ')}
     WHERE id = $${idx}
     RETURNING *`,
    params
  ).catch((err) => {
    if (isMissingChatActionRunsSchemaError(err)) return { rows: [] };
    throw err;
  });
  return result.rows?.[0] || null;
}

module.exports = { insertChatActionRun, updateChatActionRun };
