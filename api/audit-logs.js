/**
 * Audit Logs API
 */
const express = require("express");
const router = express.Router();

// Mock audit logs
const auditLogs = [
  {
    id: '1',
    action: 'agent.created',
    user: 'alex@vutler.com',
    resource: 'agent',
    resourceId: '1',
    details: { name: 'Jarvis' },
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    ip: '192.168.1.1'
  },
  {
    id: '2',
    action: 'agent.updated',
    user: 'alex@vutler.com',
    resource: 'agent',
    resourceId: '1',
    details: { field: 'model' },
    timestamp: new Date(Date.now() - 43200000).toISOString(),
    ip: '192.168.1.1'
  },
  {
    id: '3',
    action: 'user.login',
    user: 'alex@vutler.com',
    resource: 'user',
    resourceId: 'alex-001',
    details: {},
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    ip: '192.168.1.1'
  }
];

// GET /api/v1/audit-logs
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, action, limit = 50 } = req.query;
    
    let logs = [...auditLogs];
    
    // Filter by date range
    if (startDate) {
      logs = logs.filter(l => new Date(l.timestamp) >= new Date(startDate));
    }
    if (endDate) {
      logs = logs.filter(l => new Date(l.timestamp) <= new Date(endDate));
    }
    
    // Filter by action
    if (action) {
      logs = logs.filter(l => l.action === action);
    }
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit results
    logs = logs.slice(0, parseInt(limit));
    
    res.json({ 
      success: true, 
      logs,
      total: logs.length
    });
  } catch (err) {
    console.error("[AUDIT_LOGS] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
