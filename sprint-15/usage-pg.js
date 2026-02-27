/**
 * Usage API (PostgreSQL) - Token usage stats
 * Replaces MongoDB-based usage.js
 */
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');

// GET /api/v1/usage - aggregated stats
router.get('/usage', async (req, res) => {
  try {
    const { agent_id, period, group_by } = req.query;
    
    let dateFilter = '';
    if (period === 'day') dateFilter = "AND created_at >= NOW() - INTERVAL '1 day'";
    else if (period === 'week') dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
    else if (period === 'month') dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    
    let agentFilter = '';
    const params = [];
    if (agent_id) { agentFilter = 'AND agent_id = $1'; params.push(agent_id); }

    // Summary
    const summaryQ = `SELECT 
      COUNT(*) as total_requests,
      COALESCE(SUM(input_tokens),0) as total_input_tokens,
      COALESCE(SUM(output_tokens),0) as total_output_tokens,
      COALESCE(SUM(input_tokens + output_tokens),0) as total_tokens,
      COALESCE(SUM(cost_usd),0) as total_cost_usd
    FROM tenant_vutler.token_usage WHERE 1=1 ${agentFilter} ${dateFilter}`;
    const { rows: [summary] } = await pool.query(summaryQ, params);

    // By day
    const byDayQ = `SELECT 
      DATE(created_at) as date,
      COALESCE(SUM(input_tokens),0) as input_tokens,
      COALESCE(SUM(output_tokens),0) as output_tokens,
      COALESCE(SUM(cost_usd),0) as cost_usd,
      COUNT(*) as requests
    FROM tenant_vutler.token_usage WHERE 1=1 ${agentFilter} ${dateFilter}
    GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`;
    const { rows: byDay } = await pool.query(byDayQ, params);

    // By agent
    const byAgentQ = `SELECT 
      agent_id,
      COALESCE(SUM(input_tokens),0) as input_tokens,
      COALESCE(SUM(output_tokens),0) as output_tokens,
      COALESCE(SUM(cost_usd),0) as cost_usd,
      COUNT(*) as requests
    FROM tenant_vutler.token_usage WHERE 1=1 ${agentFilter} ${dateFilter}
    GROUP BY agent_id ORDER BY cost_usd DESC`;
    const { rows: byAgent } = await pool.query(byAgentQ, params);

    res.json({ success: true, summary, by_day: byDay, by_agent: byAgent });
  } catch (err) {
    console.error('[Usage] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/usage/summary - quick summary
router.get('/usage/summary', async (req, res) => {
  try {
    const { rows: [summary] } = await pool.query(`
      SELECT COUNT(*) as total_requests,
        COALESCE(SUM(input_tokens + output_tokens),0) as total_tokens,
        COALESCE(SUM(cost_usd),0)::numeric(10,4) as total_cost_usd
      FROM tenant_vutler.token_usage WHERE created_at >= NOW() - INTERVAL '30 days'`);
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Keep old agent usage route working
router.get('/agents/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT DATE(created_at) as date, provider, model,
        SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
        SUM(cost_usd) as cost_usd, COUNT(*) as requests
       FROM tenant_vutler.token_usage WHERE agent_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at), provider, model ORDER BY date DESC`, [id]);
    res.json({ success: true, usage: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
