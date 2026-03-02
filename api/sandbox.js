/**
 * Sandbox API
 * Environment for testing agents safely before deployment
 */
const express = require("express");
const router = express.Router();

// In-memory store for sandbox sessions
let sessions = [];
let nextSessionId = 1;

// GET /api/v1/sandbox - List sandbox sessions
router.get("/", async (req, res) => {
  try {
    const workspaceSessions = sessions
      .filter(s => s.workspaceId === req.workspaceId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ 
      success: true, 
      sessions: workspaceSessions
    });
  } catch (err) {
    console.error("[SANDBOX] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/sandbox - Create new sandbox session
router.post("/", async (req, res) => {
  try {
    const { name, agentId } = req.body;
    
    const session = {
      id: String(nextSessionId++),
      name: name || `Sandbox ${nextSessionId - 1}`,
      agentId: agentId || null,
      status: 'active',
      workspaceId: req.workspaceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    sessions.push(session);
    
    res.json({ success: true, session });
  } catch (err) {
    console.error("[SANDBOX] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/sandbox/:id - Get session details
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const session = sessions.find(s => s.id === id && s.workspaceId === req.workspaceId);
    
    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    
    res.json({ success: true, session });
  } catch (err) {
    console.error("[SANDBOX] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/sandbox/:id - End session
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const index = sessions.findIndex(s => s.id === id && s.workspaceId === req.workspaceId);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    
    sessions[index].status = 'ended';
    sessions[index].updatedAt = new Date().toISOString();
    
    res.json({ success: true });
  } catch (err) {
    console.error("[SANDBOX] Delete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
