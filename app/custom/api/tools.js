/**
 * Vutler Tools Registry API
 * List and manage available agent tools
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const router = express.Router();

// Built-in tools catalog
const BUILT_IN_TOOLS = [
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web for information',
    category: 'research',
    status: 'active'
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Send and receive emails',
    category: 'communication',
    status: 'active'
  },
  {
    id: 'drive',
    name: 'VDrive',
    description: 'Access and manage files in VDrive',
    category: 'storage',
    status: 'active'
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Manage calendar events and schedules',
    category: 'productivity',
    status: 'active'
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Store and retrieve agent memories',
    category: 'cognitive',
    status: 'active'
  },
  {
    id: 'shell',
    name: 'Shell',
    description: 'Execute shell commands (admin only)',
    category: 'system',
    status: 'active'
  },
  {
    id: 'webhook',
    name: 'Webhook',
    description: 'Call external webhooks',
    category: 'integration',
    status: 'active'
  }
];

/**
 * GET /api/v1/tools
 * List available tools
 */
router.get('/', authenticateAgent, async (req, res) => {
  try {
    const category = req.query.category;
    
    let tools = BUILT_IN_TOOLS;
    
    if (category) {
      tools = tools.filter(t => t.category === category);
    }
    
    res.json({
      success: true,
      data: tools,
      meta: {
        total: tools.length,
        categories: ['research', 'communication', 'storage', 'productivity', 'cognitive', 'system', 'integration']
      }
    });
  } catch (error) {
    console.error('[Tools API] Error fetching tools:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tools',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/tools/:id
 * Get tool details
 */
router.get('/:id', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    const tool = BUILT_IN_TOOLS.find(t => t.id === id);
    
    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found'
      });
    }
    
    res.json({
      success: true,
      data: tool
    });
  } catch (error) {
    console.error('[Tools API] Error fetching tool:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tool',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/tools/:id/execute
 * Execute a tool (for testing)
 */
router.post('/:id/execute', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    const { params = {} } = req.body;

    const tool = BUILT_IN_TOOLS.find(t => t.id === id);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found'
      });
    }
    let result;

    switch (id) {
      case 'web_search': {
        // Delegate to sandbox for web search via agent runtime
        result = { message: 'Use the sandbox API (/api/v1/sandbox/execute) to run web searches via agent code.' };
        break;
      }
      case 'email': {
        result = { message: 'Use /api/v1/mail/send to send emails. Params: to, subject, plain_body, html_body.' };
        break;
      }
      case 'drive': {
        const pool = (() => { try { return require('../../../lib/vaultbrix'); } catch(e) { return null; } })();
        if (pool && params.action === 'list') {
          const r = await pool.query(
            `SELECT name, path, mime_type, size_bytes FROM tenant_vutler.drive_files
             WHERE workspace_id = $1 AND is_deleted = false AND path LIKE $2 ORDER BY path LIMIT 50`,
            [req.workspaceId || '00000000-0000-0000-0000-000000000001', (params.path || '/') + '%']
          );
          result = { files: r.rows };
        } else {
          result = { message: 'Supported actions: list. Pass params.path to filter.' };
        }
        break;
      }
      case 'memory': {
        result = { message: 'Use /api/v1/agents/:id/memories to recall or store agent memories.' };
        break;
      }
      case 'shell': {
        if (req.role !== 'admin') {
          return res.status(403).json({ success: false, error: 'Shell tool requires admin role' });
        }
        result = { message: 'Use /api/v1/sandbox/execute to run code in the sandbox environment.' };
        break;
      }
      default:
        result = { message: `Tool "${id}" is registered but has no direct execution handler. Use the relevant API endpoint.` };
    }

    res.json({ success: true, data: { tool: id, status: 'executed', result } });
  } catch (error) {
    console.error('[Tools API] Error executing tool:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute tool',
      message: error.message
    });
  }
});

module.exports = router;
