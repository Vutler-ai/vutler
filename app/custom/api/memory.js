/**
 * Vutler Memory API
 * Agent memory storage and retrieval (Snipara integration)
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const router = express.Router();

/**
 * GET /api/v1/memory
 * List agent memories
 */
router.get('/memory', authenticateAgent, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type; // fact, decision, learning, preference
    
    // TODO: Fetch from Snipara or local memory storage
    res.json({
      success: true,
      data: [],
      meta: {
        total: 0,
        limit,
        filter: type ? { type } : {}
      }
    });
  } catch (error) {
    console.error('[Memory API] Error fetching memories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch memories',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/memory
 * Store a new memory
 */
router.post('/memory', authenticateAgent, async (req, res) => {
  try {
    const { content, type, tags } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: content'
      });
    }
    
    // TODO: Store in Snipara via rlm_remember
    const memory = {
      id: `mem_${Date.now()}`,
      content,
      type: type || 'fact',
      tags: tags || [],
      agent_id: req.agent.id,
      created_at: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: memory
    });
  } catch (error) {
    console.error('[Memory API] Error storing memory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store memory',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/memory/search
 * Semantic search in memories
 */
router.get('/memory/search', authenticateAgent, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: q (query)'
      });
    }
    
    // TODO: Use Snipara rlm_recall for semantic search
    res.json({
      success: true,
      data: [],
      query: q
    });
  } catch (error) {
    console.error('[Memory API] Error searching memories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search memories',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/memory/:id
 * Delete a memory
 */
router.delete('/memory/:id', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    
    // TODO: Delete from storage
    res.json({
      success: true,
      data: { id, deleted: true }
    });
  } catch (error) {
    console.error('[Memory API] Error deleting memory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete memory',
      message: error.message
    });
  }
});

module.exports = router;
