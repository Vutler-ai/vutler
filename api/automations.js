/**
 * Automations API
 */
const express = require("express");
const router = express.Router();

// In-memory automations
let automations = [];
let nextId = 1;

// GET /api/v1/automations
router.get("/", async (req, res) => {
  res.json({ success: true, automations });
});

// POST /api/v1/automations
router.post("/", async (req, res) => {
  try {
    const { name, trigger, action, enabled = true } = req.body;
    
    const automation = {
      id: String(nextId++),
      name,
      trigger,
      action,
      enabled,
      createdAt: new Date().toISOString(),
      lastRun: null
    };
    
    automations.push(automation);
    res.json({ success: true, automation });
  } catch (err) {
    console.error("[AUTOMATIONS] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/automations/:id
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const index = automations.findIndex(a => a.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Automation not found" });
    }
    
    automations[index] = { ...automations[index], ...updates, updatedAt: new Date().toISOString() };
    res.json({ success: true, automation: automations[index] });
  } catch (err) {
    console.error("[AUTOMATIONS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/automations/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const index = automations.findIndex(a => a.id === id);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Automation not found" });
    }
    
    automations.splice(index, 1);
    res.json({ success: true });
  } catch (err) {
    console.error("[AUTOMATIONS] Delete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
