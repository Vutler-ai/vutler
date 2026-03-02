/**
 * Templates API
 */
const express = require("express");
const router = express.Router();

const templates = [
  {
    id: '1',
    name: 'Customer Support Agent',
    description: 'Handles customer inquiries and support tickets',
    category: 'support',
    icon: 'headphones',
    config: {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are a helpful customer support agent...'
    }
  },
  {
    id: '2',
    name: 'Code Reviewer',
    description: 'Reviews code and provides feedback',
    category: 'development',
    icon: 'code',
    config: {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are an expert code reviewer...'
    }
  },
  {
    id: '3',
    name: 'Content Writer',
    description: 'Creates blog posts and marketing content',
    category: 'marketing',
    icon: 'pen',
    config: {
      model: 'openai/gpt-4o',
      systemPrompt: 'You are a skilled content writer...'
    }
  },
  {
    id: '4',
    name: 'Data Analyst',
    description: 'Analyzes data and generates reports',
    category: 'analytics',
    icon: 'bar-chart',
    config: {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are a data analyst...'
    }
  }
];

router.get("/templates", async (req, res) => {
  res.json({ success: true, templates });
});

router.get("/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const template = templates.find(t => t.id === id);
    
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    
    res.json({ success: true, template });
  } catch (err) {
    console.error("[TEMPLATES] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
