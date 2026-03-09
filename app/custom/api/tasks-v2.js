/**
 * Vutler Tasks API v2
 * Task management for agents
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const router = express.Router();

/**
 * GET /api/v1/tasks-v2
 * List tasks for workspace
 */
router.get('/tasks-v2', authenticateAgent, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status; // pending, in_progress, completed, failed
    
    // TODO: Connect to PostgreSQL tenant_vutler.tasks table
    // For now, return empty array
    res.json({
      success: true,
      data: [],
      meta: {
        total: 0,
        limit,
        filter: status ? { status } : {}
      }
    });
  } catch (error) {
    console.error('[Tasks API] Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/tasks-v2
 * Create a new task
 */
router.post('/tasks-v2', authenticateAgent, async (req, res) => {
  try {
    const { title, description, assignee, priority } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: title'
      });
    }
    
    // TODO: Insert into PostgreSQL
    const task = {
      id: `task_${Date.now()}`,
      title,
      description: description || '',
      assignee: assignee || req.agent.id,
      priority: priority || 'medium',
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('[Tasks API] Error creating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/tasks-v2/:id
 * Get a specific task
 */
router.get('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    
    // TODO: Fetch from PostgreSQL
    res.status(404).json({
      success: false,
      error: 'Task not found'
    });
  } catch (error) {
    console.error('[Tasks API] Error fetching task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task',
      message: error.message
    });
  }
});

/**
 * PATCH /api/v1/tasks-v2/:id
 * Update task status/details
 */
router.patch('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // TODO: Update in PostgreSQL
    res.json({
      success: true,
      data: {
        id,
        ...updates,
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Tasks API] Error updating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task',
      message: error.message
    });
  }
});

module.exports = router;
