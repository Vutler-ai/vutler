/**
 * Vutler LLM Providers API
 * Manage LLM provider configurations
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const router = express.Router();

/**
 * GET /api/v1/llm/providers
 * List LLM providers for workspace
 */
router.get('/llm/providers', authenticateAgent, async (req, res) => {
  try {
    // TODO: Connect to PostgreSQL to fetch from tenant_vutler.llm_providers
    // For now, return hardcoded providers
    const providers = [
      {
        id: '1',
        provider: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-5.2', name: 'GPT-5.2' },
          { id: 'o3', name: 'O3' },
          { id: 'o4-mini', name: 'O4-Mini' }
        ],
        status: 'active'
      },
      {
        id: '2',
        provider: 'anthropic',
        name: 'Anthropic',
        models: [
          { id: 'claude-opus-4.6', name: 'Opus 4.6' },
          { id: 'claude-sonnet-4.5', name: 'Sonnet 4.5' },
          { id: 'claude-sonnet-4', name: 'Sonnet 4' }
        ],
        status: 'active'
      },
      {
        id: '3',
        provider: 'minimax',
        name: 'MiniMax',
        models: [
          { id: 'm2.5', name: 'M2.5' }
        ],
        status: 'active'
      }
    ];
    
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    console.error('[LLM API] Error fetching providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch LLM providers',
      message: error.message
    });
  }
});

module.exports = router;
