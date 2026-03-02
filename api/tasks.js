/**
 * Tasks API
 */
const express = require("express");
const router = express.Router();

// In-memory tasks
let tasks = [];
let nextId = 1;

// GET /api/v1/tasks
router.get("/", async (req, res) => {
  res.json({ success: true, tasks });
});

// POST /api/v1/tasks
router.post("/", async (req, res) => {
  try {
    const { title, description, status = 'pending', priority = 'medium', dueDate } = req.body;
    
    const task = {
      id: String(nextId++),
      title,
      description,
      status,
      priority,
      dueDate,
      createdAt: new Date().toISOString()
    };
    
    tasks.push(task);
    res.json({ success: true, task });
  } catch (err) {
    console.error("[TASKS] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/tasks/:id
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    
    tasks[index] = { ...tasks[index], ...updates, updatedAt: new Date().toISOString() };
    res.json({ success: true, task: tasks[index] });
  } catch (err) {
    console.error("[TASKS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/tasks/:id/complete
router.put("/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;
    
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    
    tasks[index].status = tasks[index].status === 'completed' ? 'pending' : 'completed';
    tasks[index].updatedAt = new Date().toISOString();
    
    res.json({ success: true, task: tasks[index] });
  } catch (err) {
    console.error("[TASKS] Complete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/tasks/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const index = tasks.findIndex(t => t.id === id);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    
    tasks.splice(index, 1);
    res.json({ success: true });
  } catch (err) {
    console.error("[TASKS] Delete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
