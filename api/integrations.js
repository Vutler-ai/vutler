/**
 * Integrations API
 * External service integrations (n8n, Zapier, etc.)
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/integrations
router.get("/", async (req, res) => {
  try {
    const integrations = [
      {
        id: 'n8n',
        name: 'n8n',
        description: 'Workflow automation',
        icon: 'https://cdn-icons-png.flaticon.com/512/2918/2918215.png',
        connected: false,
        category: 'automation'
      },
      {
        id: 'zapier',
        name: 'Zapier',
        description: 'Connect your apps',
        icon: 'https://cdn-icons-png.flaticon.com/512/2918/2918215.png',
        connected: false,
        category: 'automation'
      },
      {
        id: 'slack',
        name: 'Slack',
        description: 'Team messaging',
        icon: 'https://cdn-icons-png.flaticon.com/512/2918/2918215.png',
        connected: false,
        category: 'communication'
      },
      {
        id: 'github',
        name: 'GitHub',
        description: 'Code repository',
        icon: 'https://cdn-icons-png.flaticon.com/512/2918/2918215.png',
        connected: false,
        category: 'development'
      }
    ];
    
    res.json({ success: true, integrations });
  } catch (err) {
    console.error("[INTEGRATIONS] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/n8n/workflows
router.get("/n8n/workflows", async (req, res) => {
  try {
    // Mock n8n workflows
    const workflows = [
      { id: '1', name: 'Agent Notification', active: true, createdAt: '2026-01-15' },
      { id: '2', name: 'Email to Task', active: false, createdAt: '2026-01-20' },
      { id: '3', name: 'Daily Report', active: true, createdAt: '2026-02-01' }
    ];
    
    res.json({ success: true, workflows });
  } catch (err) {
    console.error("[INTEGRATIONS] n8n workflows error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/integrations/n8n/workflows/:id/trigger
router.post("/n8n/workflows/:id/trigger", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Mock trigger workflow
    res.json({ 
      success: true, 
      message: `Workflow ${id} triggered successfully`,
      executionId: `exec-${Date.now()}`
    });
  } catch (err) {
    console.error("[INTEGRATIONS] n8n trigger error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/:provider
router.get("/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    
    const integration = {
      id: provider,
      name: provider.charAt(0).toUpperCase() + provider.slice(1),
      description: `Integration with ${provider}`,
      connected: false,
      config: {}
    };
    
    res.json({ success: true, integration });
  } catch (err) {
    console.error("[INTEGRATIONS] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/available
router.get("/available", async (req, res) => {
  try {
    const available = [
      { id: 'n8n', name: 'n8n', category: 'automation' },
      { id: 'zapier', name: 'Zapier', category: 'automation' },
      { id: 'slack', name: 'Slack', category: 'communication' },
      { id: 'github', name: 'GitHub', category: 'development' },
      { id: 'gitlab', name: 'GitLab', category: 'development' },
      { id: 'jira', name: 'Jira', category: 'project-management' }
    ];
    
    res.json({ success: true, integrations: available });
  } catch (err) {
    console.error("[INTEGRATIONS] Available error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/integrations/:provider/agents
router.get("/:provider/agents", async (req, res) => {
  try {
    const { provider } = req.params;
    
    // Mock agents for this integration
    const agents = [
      { id: '1', name: 'Support Agent', connected: true },
      { id: '2', name: 'Sales Agent', connected: false }
    ];
    
    res.json({ success: true, agents });
  } catch (err) {
    console.error("[INTEGRATIONS] Agents error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
