/**
 * Deployments API
 */
const express = require("express");
const router = express.Router();

// In-memory store (replace with DB in production)
let deployments = [];
let nextId = 1;

// GET /api/v1/deployments
router.get("/", async (req, res) => {
  try {
    const userDeployments = deployments
      .filter(d => d.workspaceId === req.workspaceId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ 
      success: true, 
      deployments: userDeployments
    });
  } catch (err) {
    console.error("[DEPLOYMENTS] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/deployments
router.post("/", async (req, res) => {
  try {
    const { name, agentId, environment, config } = req.body;
    
    const deployment = {
      id: String(nextId++),
      name,
      agentId,
      environment: environment || 'production',
      config: config || {},
      status: 'pending',
      workspaceId: req.workspaceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    deployments.push(deployment);
    
    // Simulate deployment process
    setTimeout(() => {
      deployment.status = 'running';
      deployment.updatedAt = new Date().toISOString();
    }, 2000);
    
    res.json({ success: true, deployment });
  } catch (err) {
    console.error("[DEPLOYMENTS] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/deployments/:id/status
router.get("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const deployment = deployments.find(d => d.id === id && d.workspaceId === req.workspaceId);
    
    if (!deployment) {
      return res.status(404).json({ success: false, error: "Deployment not found" });
    }
    
    res.json({ 
      success: true, 
      status: deployment.status,
      updatedAt: deployment.updatedAt
    });
  } catch (err) {
    console.error("[DEPLOYMENTS] Status error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/deployments/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const index = deployments.findIndex(d => d.id === id && d.workspaceId === req.workspaceId);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Deployment not found" });
    }
    
    deployments.splice(index, 1);
    res.json({ success: true });
  } catch (err) {
    console.error("[DEPLOYMENTS] Delete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
