// Dashboard stats endpoint - add after line 188 (health check)
// Paste this into index.js

app.get('/api/v1/dashboard', async (req, res) => {
  try {
    const db = app.locals.db;
    
    // Count agents
    const agents = await db.collection('users').find({ type: { $in: ['agent', 'bot'] } }).toArray();
    const activeAgents = agents.filter(a => a.active !== false);
    
    // Count messages today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const messagesCount = await db.collection('rocketchat_message').countDocuments({
      ts: { $gte: todayStart }
    }).catch(() => 0);
    
    // Token usage
    const tokenAgg = await db.collection('token_usage').aggregate([
      { $group: { _id: null, total: { $sum: '$tokens' }, totalCost: { $sum: '$cost' } } }
    ]).toArray().catch(() => []);
    const totalTokens = tokenAgg[0]?.total || 0;
    
    // Uptime
    const uptimeSeconds = process.uptime();
    
    res.json({
      success: true,
      agents: activeAgents.map(a => ({
        id: a._id,
        name: a.name || a.username,
        type: a.type,
        status: a.active !== false ? 'active' : 'inactive',
        model: a.llmModel || null,
        roles: a.roles || []
      })),
      stats: {
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
        messagesToday: messagesCount,
        totalTokens: totalTokens,
        uptimeHours: Math.floor(uptimeSeconds / 3600),
        uptimeSeconds: Math.floor(uptimeSeconds)
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.json({ success: false, agents: [], stats: { totalAgents: 0, activeAgents: 0, messagesToday: 0, totalTokens: 0, uptimeHours: 0 } });
  }
});
