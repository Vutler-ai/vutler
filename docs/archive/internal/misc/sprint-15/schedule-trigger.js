/**
 * Schedule/Cron Trigger — Sprint 15
 * Loads schedule rules at boot, runs them on interval
 */
const { executeRule } = require('/app/runtime/automation-executor');

const activeSchedules = new Map();

function parseCron(expr) {
  // Simple cron: supports "every Xm", "every Xh", or interval in ms from config
  if (!expr) return null;
  const m = expr.match(/^every\s+(\d+)\s*(m|min|h|hr|s|sec)$/i);
  if (m) {
    const val = parseInt(m[1]);
    const unit = m[2].toLowerCase();
    if (unit.startsWith('s')) return val * 1000;
    if (unit.startsWith('m')) return val * 60000;
    if (unit.startsWith('h')) return val * 3600000;
  }
  // If it's a number, treat as ms
  const num = parseInt(expr);
  if (!isNaN(num)) return num;
  return null;
}

async function initSchedules(pool) {
  try {
    const result = await pool.query(
      `SELECT t.*, r.id as rule_id, r.workspace_id, r.name, r.trigger_type, r.action_type, r.agent_id, r.config as rule_config
       FROM tenant_vutler.automation_triggers t
       JOIN tenant_vutler.automation_rules r ON r.id = t.automation_id
       WHERE t.trigger_type = 'schedule' AND t.is_enabled = true AND r.enabled = true`
    );

    console.log(`[SCHEDULER] Found ${result.rows.length} schedule triggers`);

    for (const row of result.rows) {
      scheduleRule(row, pool);
    }
  } catch (err) {
    console.error('[SCHEDULER] Init error:', err.message);
  }
}

function scheduleRule(row, pool) {
  const config = row.config || {};
  const intervalMs = parseCron(config.cron || config.interval) || config.interval_ms || 3600000;

  const rule = {
    id: row.rule_id || row.automation_id,
    workspace_id: row.workspace_id,
    name: row.name,
    trigger_type: 'schedule',
    action_type: row.action_type,
    agent_id: row.agent_id,
    config: row.rule_config || {},
  };

  const timer = setInterval(async () => {
    try {
      console.log(`[SCHEDULER] Running: ${rule.name} (${rule.id})`);
      await pool.query(`UPDATE tenant_vutler.automation_triggers SET last_triggered_at = NOW() WHERE id = $1`, [row.id]);
      await executeRule(rule, { scheduled: true, timestamp: new Date().toISOString() }, pool, row.id);
    } catch (err) {
      console.error(`[SCHEDULER] Run error for ${rule.id}:`, err.message);
    }
  }, intervalMs);

  activeSchedules.set(row.id, timer);
  console.log(`[SCHEDULER] Scheduled "${rule.name}" every ${intervalMs}ms`);
}

function stopAll() {
  for (const [id, timer] of activeSchedules) {
    clearInterval(timer);
  }
  activeSchedules.clear();
}

module.exports = { initSchedules, scheduleRule, stopAll, activeSchedules };
