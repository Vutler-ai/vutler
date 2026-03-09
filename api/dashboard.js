/**
 * Vutler Dashboard API — PostgreSQL only (no MongoDB)
 */
const express = require('express');
const vaultbrixPool = require('../lib/vaultbrix');
const router = express.Router();

async function getPg() { return vaultbrixPool; }

router.get('/', async (req, res) => {
  try {
    const pg = await getPg();
    const [agentsRes, tokensRes, messagesRes] = await Promise.all([
      pg.query('SELECT id, name, username, email, status, type, role, avatar, mbti, model FROM agents ORDER BY name'),
      pg.query('SELECT COALESCE(SUM(tokens), 0)::bigint as total FROM token_usage').catch(() => ({ rows: [{ total: 0 }] })),
      pg.query("SELECT COUNT(*)::int as count FROM chat_messages WHERE created_at >= CURRENT_DATE").catch(() => ({ rows: [{ count: 0 }] })),
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

    const activeAgents = agents.filter(a => a.status === 'online').length;

    res.json({
      success: true,
      stats: {
        totalAgents: agents.length,
        activeAgents,
        messagesToday: parseInt(messagesRes.rows[0].count) || 0,
        totalTokens: parseInt(tokensRes.rows[0].total) || 0,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      agents,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data', message: error.message });
  }
});

module.exports = router;
