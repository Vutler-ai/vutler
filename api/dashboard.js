/**
 * Vutler Dashboard API — PostgreSQL only (no MongoDB)
 */
const express = require('express');
const vaultbrixPool = require('../lib/vaultbrix');
const { queryTokenUsageTotal } = require('./usage-pg');
const router = express.Router();

async function getPg(req) {
  return req?.app?.locals?.pg || vaultbrixPool;
}

async function fetchDashboardData(pg, workspaceId) {
  const [agentsRes, totalTokens, messagesRes] = await Promise.all([
    pg.query(
      `SELECT id, name, username, email, status, type, role, avatar, mbti, model
         FROM tenant_vutler.agents
        WHERE workspace_id = $1
        ORDER BY name`,
      [workspaceId]
    ),
    queryTokenUsageTotal(pg, workspaceId),
    pg.query(
      `SELECT COUNT(*)::int as count
         FROM tenant_vutler.chat_messages
        WHERE workspace_id = $1
          AND created_at >= CURRENT_DATE`,
      [workspaceId]
    ).catch(() => ({ rows: [{ count: 0 }] })),
  ]);

  const agents = agentsRes.rows.map(a => ({
    id: a.id,
    name: a.name,
    username: a.username,
    email: a.email,
    status: a.status || 'online',
    type: a.type || 'bot',
    role: a.role,
    avatar: a.avatar || `/sprites/agent-${a.username}.png`,
    mbti: a.mbti,
    model: a.model,
  }));

  const activeAgents = agents.filter((a) => a.status === 'online' || a.status === 'active').length;

  return {
    success: true,
    stats: {
      totalAgents: agents.length,
      activeAgents,
      messagesToday: parseInt(messagesRes.rows[0]?.count, 10) || 0,
      totalTokens: parseInt(totalTokens, 10) || 0,
    },
    agents,
  };
}

router.get('/', async (req, res) => {
  try {
    if (!req.workspaceId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const pg = await getPg(req);
    const payload = await fetchDashboardData(pg, req.workspaceId);

    res.json({
      ...payload,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data', message: error.message });
  }
});

module.exports = router;
module.exports.fetchDashboardData = fetchDashboardData;
