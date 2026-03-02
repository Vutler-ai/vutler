/**
 * Dashboard API
 * Stats and overview data for admin dashboard
 */
const express = require("express");
const pool = require("../lib/vaultbrix");
const router = express.Router();
const SCHEMA = "tenant_vutler";

// GET /api/v1/dashboard — dashboard stats
router.get("/", async (req, res) => {
  try {
    const workspaceId = req.workspaceId || "00000000-0000-0000-0000-000000000001";
    
    // Count agents
    const agentsResult = await pool.query(
      `SELECT COUNT(*) as total, 
              COUNT(CASE WHEN status = 'online' OR status = 'active' THEN 1 END) as active
       FROM ${SCHEMA}.agents WHERE workspace_id = $1`,
      [workspaceId]
    );
    
    // Count providers
    const providersResult = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN is_active = true THEN 1 END) as active
       FROM ${SCHEMA}.llm_providers WHERE workspace_id = $1`,
      [workspaceId]
    );
    
    // Recent activity (if activity table exists)
    let recentActivity = [];
    try {
      const activityResult = await pool.query(
        `SELECT * FROM ${SCHEMA}.activity_logs 
         WHERE workspace_id = $1 
         ORDER BY created_at DESC LIMIT 10`,
        [workspaceId]
      );
      recentActivity = activityResult.rows;
    } catch (e) {
      // Activity table might not exist
    }
    
    // Uptime
    const uptimeSeconds = process.uptime();
    
    res.json({
      success: true,
      stats: {
        agents: {
          total: parseInt(agentsResult.rows[0]?.total || 0),
          active: parseInt(agentsResult.rows[0]?.active || 0)
        },
        providers: {
          total: parseInt(providersResult.rows[0]?.total || 0),
          active: parseInt(providersResult.rows[0]?.active || 0)
        },
        uptime: {
          seconds: Math.floor(uptimeSeconds),
          hours: Math.floor(uptimeSeconds / 3600),
          formatted: formatUptime(uptimeSeconds)
        }
      },
      recentActivity,
      workspaceId
    });
  } catch (error) {
    console.error("[DASHBOARD] Stats error:", error.message);
    res.json({ 
      success: true, 
      stats: {
        agents: { total: 0, active: 0 },
        providers: { total: 0, active: 0 },
        uptime: { seconds: 0, hours: 0, formatted: "0s" }
      },
      recentActivity: []
    });
  }
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

module.exports = router;
