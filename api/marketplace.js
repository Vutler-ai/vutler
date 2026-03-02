/**
 * Marketplace API
 * Template marketplace for agents
 */
const express = require("express");
const router = express.Router();

// Mock marketplace templates
const marketplaceTemplates = [
  {
    id: '1',
    name: 'Customer Support Agent',
    description: 'Handles customer inquiries and support tickets with empathy and efficiency',
    category: 'support',
    author: 'Vutler Team',
    authorAvatar: '/sprites/agent-jarvis.png',
    icon: 'headphones',
    downloads: 1250,
    rating: 4.8,
    reviews: 89,
    price: 0,
    tags: ['support', 'customer-service', 'helpdesk'],
    config: {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are a helpful customer support agent...'
    },
    createdAt: '2026-01-15'
  },
  {
    id: '2',
    name: 'Code Reviewer Pro',
    description: 'Expert code reviewer with focus on best practices and security',
    category: 'development',
    author: 'DevTools Inc',
    authorAvatar: '/sprites/agent-mike.png',
    icon: 'code',
    downloads: 890,
    rating: 4.9,
    reviews: 56,
    price: 0,
    tags: ['coding', 'review', 'security'],
    config: {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are an expert code reviewer...'
    },
    createdAt: '2026-01-20'
  },
  {
    id: '3',
    name: 'Content Creator',
    description: 'Creates engaging blog posts, social media content and marketing copy',
    category: 'marketing',
    author: 'Marketing Pro',
    authorAvatar: '/sprites/agent-max.png',
    icon: 'pen',
    downloads: 2100,
    rating: 4.7,
    reviews: 134,
    price: 0,
    tags: ['content', 'marketing', 'writing'],
    config: {
      model: 'openai/gpt-4o',
      systemPrompt: 'You are a skilled content creator...'
    },
    createdAt: '2026-02-01'
  },
  {
    id: '4',
    name: 'Data Analyst',
    description: 'Analyzes data, creates reports and provides insights',
    category: 'analytics',
    author: 'DataCorp',
    authorAvatar: '/sprites/agent-luna.png',
    icon: 'bar-chart',
    downloads: 650,
    rating: 4.6,
    reviews: 42,
    price: 0,
    tags: ['data', 'analytics', 'reports'],
    config: {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are a data analyst...'
    },
    createdAt: '2026-02-10'
  },
  {
    id: '5',
    name: 'Sales Assistant',
    description: 'Helps with sales outreach, follow-ups and CRM updates',
    category: 'sales',
    author: 'SalesFlow',
    authorAvatar: '/sprites/agent-victor.png',
    icon: 'briefcase',
    downloads: 430,
    rating: 4.5,
    reviews: 28,
    price: 0,
    tags: ['sales', 'crm', 'outreach'],
    config: {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are a sales assistant...'
    },
    createdAt: '2026-02-15'
  }
];

// User's installed templates (mock)
let myTemplates = [];

// GET /api/v1/marketplace/templates
router.get("/templates", async (req, res) => {
  try {
    const { search, category, sort = 'popular' } = req.query;
    
    let templates = [...marketplaceTemplates];
    
    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      templates = templates.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    // Filter by category
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    
    // Sort
    if (sort === 'popular') {
      templates.sort((a, b) => b.downloads - a.downloads);
    } else if (sort === 'newest') {
      templates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'rating') {
      templates.sort((a, b) => b.rating - a.rating);
    }
    
    res.json({ 
      success: true, 
      templates,
      total: templates.length
    });
  } catch (err) {
    console.error("[MARKETPLACE] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/marketplace/templates/:id
router.get("/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const template = marketplaceTemplates.find(t => t.id === id);
    
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    
    res.json({ success: true, template });
  } catch (err) {
    console.error("[MARKETPLACE] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/marketplace/templates/:id/install
router.post("/templates/:id/install", async (req, res) => {
  try {
    const { id } = req.params;
    const template = marketplaceTemplates.find(t => t.id === id);
    
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    
    // Add to user's templates
    const installedTemplate = {
      ...template,
      installedAt: new Date().toISOString(),
      instanceId: 'instance-' + Date.now()
    };
    
    myTemplates.push(installedTemplate);
    
    res.json({ 
      success: true, 
      message: "Template installed successfully",
      template: installedTemplate
    });
  } catch (err) {
    console.error("[MARKETPLACE] Install error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/marketplace/my-templates
router.get("/my-templates", async (req, res) => {
  try {
    res.json({ 
      success: true, 
      templates: myTemplates
    });
  } catch (err) {
    console.error("[MARKETPLACE] My templates error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
