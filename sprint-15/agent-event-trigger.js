/**
 * Agent Event Trigger — Sprint 15
 * Call after agent chat-v2 completes to check for matching automations
 */
const { executeRule } = require('/app/runtime/automation-executor');

async function onAgentEvent(agentId, eventData, pool) {
  try {
    const result = await pool.query(
      `SELECT t.*, r.id as rule_id, r.workspace_id, r.name, r.trigger_type, r.action_type, r.agent_id, r.config as rule_config
       FROM tenant_vutler.automation_triggers t
       JOIN tenant_vutler.automation_rules r ON r.id = t.automation_id
       WHERE t.trigger_type = 'agent_event' AND t.is_enabled = true AND r.enabled = true
       AND (t.config->>'agent_id' = $1 OR t.config->>'agent_id' IS NULL)`,
      [agentId]
    );

    for (const row of result.rows) {
      const rule = {
        id: row.rule_id || row.automation_id,
        workspace_id: row.workspace_id,
        name: row.name,
        trigger_type: 'agent_event',
        action_type: row.action_type,
        agent_id: row.agent_id,
        config: row.rule_config || {},
      };

      // Fire and forget
      executeRule(rule, { agent_id: agentId, ...eventData }, pool, row.id).catch(err => {
        console.error(`[AGENT_EVENT] Execution error for rule ${rule.id}:`, err.message);
      });

      await pool.query(`UPDATE tenant_vutler.automation_triggers SET last_triggered_at = NOW() WHERE id = $1`, [row.id]);
    }

    return result.rows.length;
  } catch (err) {
    console.error('[AGENT_EVENT] Error:', err.message);
    return 0;
  }
}

module.exports = { onAgentEvent };
