/**
 * AutomationExecutor — Sprint 15
 * Executes automation rules: evaluates triggers, runs actions in sequence
 */
const crypto = require('crypto');
const http = require('http');

function uuidv4() { return crypto.randomUUID(); }

// HTTP request helper (Node 18 without native fetch)
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 60000,
    };
    const mod = parsed.protocol === 'https:' ? require('https') : http;
    const req = mod.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

// Variable interpolation: {{trigger.data}}, {{previous.output}}, {{trigger.data.field}}
function interpolate(template, context) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const parts = path.trim().split('.');
    let val = context;
    for (const p of parts) {
      if (val == null) return '';
      val = val[p];
    }
    return typeof val === 'object' ? JSON.stringify(val) : (val ?? '');
  });
}

function interpolateDeep(obj, context) {
  if (typeof obj === 'string') return interpolate(obj, context);
  if (Array.isArray(obj)) return obj.map(i => interpolateDeep(i, context));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = interpolateDeep(v, context);
    return out;
  }
  return obj;
}

// Action executors
const actionHandlers = {
  async call_agent(actionConfig, context) {
    const agentId = interpolate(actionConfig.agent_id, context);
    const message = interpolate(actionConfig.message || JSON.stringify(context.trigger?.data || {}), context);
    const res = await httpRequest(`http://localhost:3001/api/agents/${agentId}/chat-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stream: false }),
      timeout: 60000,
    });
    return res.data;
  },

  async webhook_out(actionConfig, context) {
    const config = interpolateDeep(actionConfig, context);
    const headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
    const res = await httpRequest(config.url, {
      method: (config.method || 'POST').toUpperCase(),
      headers,
      body: config.body ? JSON.stringify(config.body) : undefined,
      timeout: 60000,
    });
    return res.data;
  },

  async send_email(actionConfig, context) {
    const config = interpolateDeep(actionConfig, context);
    const res = await httpRequest('https://mail.vutler.ai/api/v1/send/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Server-API-Key': (process.env.POSTAL_API_KEY),
      },
      body: JSON.stringify({
        to: [config.to],
        from: config.from || 'noreply@vutler.ai',
        subject: config.subject || 'Automation notification',
        html_body: config.body || config.html_body || '',
        plain_body: config.plain_body || '',
      }),
      timeout: 30000,
    });
    return res.data;
  },

  async create_task(actionConfig, context, pool) {
    const config = interpolateDeep(actionConfig, context);
    const id = uuidv4();
    const wsId = context.workspace_id || '00000000-0000-0000-0000-000000000001';
    await pool.query(
      `INSERT INTO tenant_vutler.tasks (id, title, description, status, priority, assignee, workspace_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      [id, config.title || 'Auto-task', config.description || '', config.status || 'open', config.priority || 'medium', config.assignee || null, wsId]
    );
    return { task_id: id, title: config.title };
  },
};

/**
 * Execute an automation rule
 * @param {object} rule - automation_rules row
 * @param {object} triggerData - incoming trigger payload
 * @param {object} pool - pg pool
 * @param {string} triggerId - optional trigger id
 */
async function executeRule(rule, triggerData, pool, triggerId = null) {
  const logId = uuidv4();
  const startedAt = new Date();

  // Insert run log
  await pool.query(
    `INSERT INTO tenant_vutler.automation_logs (id, automation_id, trigger_id, status, started_at, payload)
     VALUES ($1,$2,$3,'running',$4,$5)`,
    [logId, rule.id, triggerId, startedAt, JSON.stringify(triggerData || {})]
  );

  const context = {
    trigger: { data: triggerData, type: rule.trigger_type },
    previous: { output: null },
    workspace_id: rule.workspace_id,
  };

  // Parse actions from config
  const actions = (rule.config && rule.config.actions) || [];
  if (actions.length === 0 && rule.action_type && rule.agent_id) {
    // Legacy single-action format
    actions.push({ type: rule.action_type, agent_id: rule.agent_id, ...(rule.config || {}) });
  }

  let finalStatus = 'success';
  let errorMsg = null;
  const results = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionLogId = uuidv4();
    const actionStart = new Date();
    const handler = actionHandlers[action.type];

    if (!handler) {
      await pool.query(
        `INSERT INTO tenant_vutler.automation_action_logs (id, automation_log_id, action_node_id, action_type, status, started_at, error_message)
         VALUES ($1,$2,$3,$4,'failed',$5,$6)`,
        [actionLogId, logId, action.node_id || `step_${i}`, action.type, actionStart, `Unknown action type: ${action.type}`]
      );
      finalStatus = 'failed';
      errorMsg = `Unknown action type: ${action.type}`;
      break;
    }

    const maxRetries = action.retries || 1;
    let lastError = null;
    let result = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        result = await handler(action, context, pool);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.error(`[EXECUTOR] Action ${action.type} attempt ${attempt + 1} failed:`, err.message);
        if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    const actionEnd = new Date();
    const durationMs = actionEnd - actionStart;

    if (lastError) {
      await pool.query(
        `INSERT INTO tenant_vutler.automation_action_logs (id, automation_log_id, action_node_id, action_type, status, started_at, completed_at, duration_ms, retry_count, error_message, input_data)
         VALUES ($1,$2,$3,$4,'failed',$5,$6,$7,$8,$9,$10)`,
        [actionLogId, logId, action.node_id || `step_${i}`, action.type, actionStart, actionEnd, durationMs, maxRetries, lastError.message, JSON.stringify(action)]
      );
      finalStatus = 'failed';
      errorMsg = lastError.message;
      break;
    }

    await pool.query(
      `INSERT INTO tenant_vutler.automation_action_logs (id, automation_log_id, action_node_id, action_type, status, started_at, completed_at, duration_ms, retry_count, input_data, output_data)
       VALUES ($1,$2,$3,$4,'success',$5,$6,$7,0,$8,$9)`,
      [actionLogId, logId, action.node_id || `step_${i}`, action.type, actionStart, actionEnd, durationMs, JSON.stringify(action), JSON.stringify(result)]
    );

    context.previous = { output: result };
    results.push(result);
  }

  const completedAt = new Date();
  await pool.query(
    `UPDATE tenant_vutler.automation_logs SET status=$1, completed_at=$2, duration_ms=$3, error_message=$4, result=$5 WHERE id=$6`,
    [finalStatus, completedAt, completedAt - startedAt, errorMsg, JSON.stringify(results), logId]
  );

  return { logId, status: finalStatus, results };
}

module.exports = { executeRule, actionHandlers, interpolate, interpolateDeep };
