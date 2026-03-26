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

const MODEL_CATALOG = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o", tier: "premium", context: 128000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", tier: "budget", context: 128000 },
    { id: "o3", name: "o3", tier: "reasoning", context: 200000 }
  ],
  anthropic: [
    { id: "claude-opus-4-20250514", name: "Claude Opus 4", tier: "premium", context: 200000 },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", tier: "standard", context: 200000 },
    { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", tier: "budget", context: 200000 }
  ],
  openrouter: [
    { id: "openrouter/auto", name: "Auto (best model per prompt)", tier: "auto", context: 200000 },
    { id: "openai/gpt-4o", name: "GPT-4o (OpenRouter)", tier: "premium", context: 128000 },
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (OpenRouter)", tier: "standard", context: 200000 },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (OpenRouter)", tier: "budget", context: 131072 },
    { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro (OpenRouter)", tier: "premium", context: 1000000 },
    { id: "mistralai/mixtral-8x22b-instruct", name: "Mixtral 8x22B (OpenRouter)", tier: "standard", context: 65536 }
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large", tier: "premium", context: 128000 },
    { id: "mistral-medium-latest", name: "Mistral Medium", tier: "standard", context: 32768 },
    { id: "mistral-small-latest", name: "Mistral Small", tier: "budget", context: 32768 }
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", tier: "fast", context: 128000 },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", tier: "ultra-fast", context: 128000 },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", tier: "fast", context: 32768 }
  ]
};

/**
 * GET /api/v1/llm/models
 * Returns all available models grouped by provider
 */
router.get('/models', (_req, res) => {
  res.json({ success: true, models: MODEL_CATALOG });
});

module.exports = router;
