/**
 * Nexus API
 * Local agent management
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/nexus/status
router.get("/status", async (req, res) => {
  try {
    res.json({
      success: true,
      status: {
        running: true,
        version: '2.0.0',
        uptime: process.uptime(),
        connected: true,
        localMode: true
      }
    });
  } catch (err) {
    console.error("[NEXUS] Status error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/nexus/register
router.post("/register", async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Mock registration
    const registration = {
      id: 'nexus-' + Date.now(),
      name: name || 'My Nexus',
      email: email || req.user?.email,
      registeredAt: new Date().toISOString(),
      status: 'active'
    };
    
    res.json({
      success: true,
      message: 'Nexus instance registered successfully',
      registration
    });
  } catch (err) {
    console.error("[NEXUS] Register error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/nexus/local-token
router.post("/local-token", async (req, res) => {
  try {
    // Generate a local API token
    const token = 'sk-local-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    res.json({
      success: true,
      token,
      message: 'Local token generated successfully'
    });
  } catch (err) {
    console.error("[NEXUS] Local token error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// CLI Tokens management
let cliTokens = [];
let nextTokenId = 1;

// GET /api/v1/nexus/cli/tokens
router.get("/cli/tokens", async (req, res) => {
  try {
    const tokens = cliTokens.map(t => ({
      ...t,
      token: t.token.substring(0, 10) + '...' // Mask full token
    }));
    
    res.json({ success: true, tokens });
  } catch (err) {
    console.error("[NEXUS] List tokens error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/nexus/cli/tokens
router.post("/cli/tokens", async (req, res) => {
  try {
    const { name } = req.body;
    
    const token = {
      id: String(nextTokenId++),
      name: name || `Token ${nextTokenId}`,
      token: 'sk-nexus-' + Math.random().toString(36).substring(2, 15),
      createdAt: new Date().toISOString(),
      lastUsed: null
    };
    
    cliTokens.push(token);
    
    res.json({ 
      success: true, 
      token: token.token, // Return full token only on creation
      id: token.id
    });
  } catch (err) {
    console.error("[NEXUS] Create token error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/nexus/cli/tokens/:id
router.delete("/cli/tokens/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const index = cliTokens.findIndex(t => t.id === id);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Token not found" });
    }
    
    cliTokens.splice(index, 1);
    res.json({ success: true });
  } catch (err) {
    console.error("[NEXUS] Delete token error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/nexus/cli/instances
router.get("/cli/instances", async (req, res) => {
  try {
    const instances = [
      {
        id: '1',
        name: 'Local Instance',
        status: 'running',
        version: '2.0.0',
        lastSeen: new Date().toISOString(),
        ip: '127.0.0.1'
      }
    ];
    
    res.json({ success: true, instances });
  } catch (err) {
    console.error("[NEXUS] List instances error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
