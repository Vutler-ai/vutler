/**
 * Sprint 9.3 — Agent Templates & Marketplace API
 * PostgreSQL-based, pre-seeded templates
 * Mike ⚙️ — 2026-02-26
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ─── Pre-loaded Templates ────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'customer-support',
    name: 'Customer Support Agent',
    description: 'Handles customer inquiries, support tickets, and FAQ responses. Multi-language, empathetic tone.',
    category: 'support',
    icon: '🎧',
    tags: ['support', 'tickets', 'faq', 'multilingual'],
    price: 0,
    author: 'Vutler',
    rating: 4.8,
    installs: 1250,
    systemPrompt: 'You are a professional customer support agent. Be empathetic, solution-oriented, and concise. Always greet the customer, understand their issue, and provide clear steps to resolve it. Escalate to a human when necessary.',
    tools: ['email', 'tickets', 'knowledge-base'],
    settings: { model: 'claude-haiku-4-20250514', maxTokens: 1024, temperature: 0.3 }
  },
  {
    id: 'content-writer',
    name: 'Content Writer',
    description: 'Creates blog posts, social media content, newsletters, and marketing copy. SEO-aware.',
    category: 'marketing',
    icon: '✍️',
    tags: ['content', 'blog', 'seo', 'copywriting', 'social-media'],
    price: 0,
    author: 'Vutler',
    rating: 4.6,
    installs: 890,
    systemPrompt: 'You are a creative content writer. Write engaging, SEO-optimized content. Adapt tone to the brand voice. Structure content with clear headings, short paragraphs, and calls to action.',
    tools: ['web-search', 'image-gen'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.7 }
  },
  {
    id: 'sales-assistant',
    name: 'Sales Assistant',
    description: 'Qualifies leads, handles objections, schedules demos, and follows up with prospects.',
    category: 'sales',
    icon: '💼',
    tags: ['sales', 'leads', 'crm', 'outreach', 'demo'],
    price: 0,
    author: 'Vutler',
    rating: 4.5,
    installs: 670,
    systemPrompt: 'You are a professional sales assistant. Qualify leads by asking targeted questions. Handle objections with data and testimonials. Always aim to schedule a demo or next step. Be persistent but not pushy.',
    tools: ['email', 'calendar', 'crm'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 2048, temperature: 0.5 }
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews pull requests, suggests improvements, checks for security issues and best practices.',
    category: 'engineering',
    icon: '🔍',
    tags: ['code-review', 'security', 'best-practices', 'github'],
    price: 0,
    author: 'Vutler',
    rating: 4.7,
    installs: 1100,
    systemPrompt: 'You are a senior code reviewer. Analyze code for bugs, security vulnerabilities, performance issues, and style consistency. Provide specific, actionable feedback with code examples. Be constructive.',
    tools: ['github', 'code-analysis'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.2 }
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Analyzes datasets, creates reports, generates insights, and builds visualizations.',
    category: 'analytics',
    icon: '📊',
    tags: ['data', 'analytics', 'reports', 'sql', 'visualization'],
    price: 0,
    author: 'Vutler',
    rating: 4.4,
    installs: 540,
    systemPrompt: 'You are a data analyst. Interpret data, identify trends, and present insights clearly. Write SQL queries, suggest visualizations, and explain findings in business terms. Always cite your data sources.',
    tools: ['sql', 'charts', 'export'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.3 }
  },
  {
    id: 'hr-recruiter',
    name: 'HR & Recruiter',
    description: 'Screens resumes, schedules interviews, answers candidate questions, and manages hiring pipeline.',
    category: 'hr',
    icon: '👥',
    tags: ['hr', 'recruiting', 'hiring', 'interviews', 'onboarding'],
    price: 0,
    author: 'Vutler',
    rating: 4.3,
    installs: 380,
    systemPrompt: 'You are an HR recruiter assistant. Screen candidates professionally, schedule interviews, and answer questions about the company and role. Maintain a welcoming, inclusive tone. Follow employment law guidelines.',
    tools: ['email', 'calendar', 'forms'],
    settings: { model: 'claude-haiku-4-20250514', maxTokens: 2048, temperature: 0.4 }
  },
  {
    id: 'legal-assistant',
    name: 'Legal Assistant',
    description: 'Reviews contracts, drafts NDAs, checks compliance (GDPR/LPD), and summarizes legal documents.',
    category: 'legal',
    icon: '⚖️',
    tags: ['legal', 'contracts', 'gdpr', 'compliance', 'nda'],
    price: 0,
    author: 'Vutler',
    rating: 4.2,
    installs: 290,
    systemPrompt: 'You are a legal assistant. Review and draft contracts, NDAs, and legal documents. Check for GDPR/LPD compliance. Summarize complex legal text in plain language. Always add a disclaimer that you are not a licensed attorney.',
    tools: ['document-review', 'templates'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.2 }
  },
  {
    id: 'project-manager',
    name: 'Project Manager',
    description: 'Tracks tasks, manages sprints, sends status updates, and coordinates team communication.',
    category: 'operations',
    icon: '📋',
    tags: ['project', 'agile', 'scrum', 'tasks', 'coordination'],
    price: 0,
    author: 'Vutler',
    rating: 4.6,
    installs: 720,
    systemPrompt: 'You are a project manager. Track tasks, manage sprint planning, and provide status updates. Use agile methodology. Identify blockers early and suggest solutions. Keep stakeholders informed with clear, concise updates.',
    tools: ['tasks', 'calendar', 'notifications'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 2048, temperature: 0.4 }
  },
  {
    id: 'social-media',
    name: 'Social Media Manager',
    description: 'Creates and schedules social posts, tracks engagement, manages community responses.',
    category: 'marketing',
    icon: '📱',
    tags: ['social', 'instagram', 'twitter', 'linkedin', 'scheduling'],
    price: 0,
    author: 'Vutler',
    rating: 4.5,
    installs: 830,
    systemPrompt: 'You are a social media manager. Create engaging posts for different platforms (Twitter/X, LinkedIn, Instagram). Optimize posting times, use relevant hashtags, and maintain brand voice consistency. Track and report on engagement metrics.',
    tools: ['social-post', 'analytics', 'image-gen'],
    settings: { model: 'claude-haiku-4-20250514', maxTokens: 1024, temperature: 0.8 }
  },
  {
    id: 'translator',
    name: 'Professional Translator',
    description: 'Translates documents and communications in 50+ languages with cultural context awareness.',
    category: 'communication',
    icon: '🌍',
    tags: ['translation', 'multilingual', 'localization', 'i18n'],
    price: 0,
    author: 'Vutler',
    rating: 4.7,
    installs: 960,
    systemPrompt: 'You are a professional translator. Translate text accurately while preserving tone, context, and cultural nuances. Support 50+ languages. Ask for clarification on ambiguous terms. Provide alternatives for idiomatic expressions.',
    tools: ['translation', 'glossary'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.3 }
  },
  {
    id: 'research-analyst',
    name: 'Research Analyst',
    description: 'Conducts market research, competitive analysis, and produces structured reports with citations.',
    category: 'analytics',
    icon: '🔬',
    tags: ['research', 'market', 'competitive', 'reports', 'citations'],
    price: 0,
    author: 'Vutler',
    rating: 4.4,
    installs: 450,
    systemPrompt: 'You are a research analyst. Conduct thorough research, cite sources, and present findings in structured reports. Compare competitors objectively. Identify market trends and opportunities. Use data to support conclusions.',
    tools: ['web-search', 'document-review', 'charts'],
    settings: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, temperature: 0.3 }
  },
  {
    id: 'office-manager',
    name: 'Office Manager',
    description: 'Manages schedules, processes expenses, handles admin tasks, and coordinates office operations.',
    category: 'operations',
    icon: '🏢',
    tags: ['admin', 'scheduling', 'expenses', 'operations'],
    price: 0,
    author: 'Vutler',
    rating: 4.3,
    installs: 310,
    systemPrompt: 'You are an office manager assistant. Handle scheduling, expense processing, and administrative tasks efficiently. Maintain organized records, send reminders, and coordinate between departments. Be proactive about upcoming deadlines.',
    tools: ['calendar', 'email', 'tasks', 'expenses'],
    settings: { model: 'claude-haiku-4-20250514', maxTokens: 2048, temperature: 0.3 }
  }
];

const CATEGORIES = [
  { id: 'support', name: 'Customer Support', icon: '🎧', count: 1 },
  { id: 'marketing', name: 'Marketing', icon: '📈', count: 2 },
  { id: 'sales', name: 'Sales', icon: '💼', count: 1 },
  { id: 'engineering', name: 'Engineering', icon: '⚙️', count: 1 },
  { id: 'analytics', name: 'Analytics', icon: '📊', count: 2 },
  { id: 'hr', name: 'HR & Recruiting', icon: '👥', count: 1 },
  { id: 'legal', name: 'Legal', icon: '⚖️', count: 1 },
  { id: 'operations', name: 'Operations', icon: '📋', count: 2 },
  { id: 'communication', name: 'Communication', icon: '🌍', count: 1 },
];

// ─── GET /templates — List all templates ─────────────────────────────────────

router.get('/templates', (req, res) => {
  const { category, search, sort } = req.query;

  let results = [...TEMPLATES];

  // Filter by category
  if (category) {
    results = results.filter(t => t.category === category);
  }

  // Search
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q))
    );
  }

  // Sort
  if (sort === 'rating') results.sort((a, b) => b.rating - a.rating);
  else if (sort === 'popular') results.sort((a, b) => b.installs - a.installs);
  else if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    success: true,
    templates: results.map(t => ({
      id: t.id, name: t.name, description: t.description,
      category: t.category, icon: t.icon, tags: t.tags,
      price: t.price, author: t.author, rating: t.rating, installs: t.installs
    })),
    categories: CATEGORIES,
    count: results.length,
    total: TEMPLATES.length
  });
});

// ─── GET /templates/:id — Template details ───────────────────────────────────

router.get('/templates/:id', (req, res) => {
  const template = TEMPLATES.find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

  res.json({ success: true, template });
});

// ─── GET /templates/categories — List categories ─────────────────────────────

router.get('/templates/categories', (req, res) => {
  res.json({ success: true, categories: CATEGORIES });
});

// ─── POST /agents/from-template — Deploy agent from template ─────────────────

router.post('/agents/from-template', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const { templateId, name, customization } = req.body;

  if (!templateId || !name) {
    return res.status(400).json({ success: false, error: 'templateId and name are required' });
  }

  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }

  try {
    const agentId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const systemPrompt = customization?.systemPrompt || template.systemPrompt;
    const model = customization?.model || template.settings.model;

    // Insert LLM config for the new agent
    await pg.query(
      `INSERT INTO agent_llm_configs (id, agent_id, provider, model, system_prompt, settings, created_at, updated_at, workspace_id)
       VALUES (gen_random_uuid(), $1, 'anthropic', $2, $3, $4, NOW(), NOW(), $5)
       ON CONFLICT (agent_id) DO UPDATE SET model = $2, system_prompt = $3, settings = $4, updated_at = NOW()`,
      [agentId, model, systemPrompt, JSON.stringify(template.settings), '00000000-0000-0000-0000-000000000000']
    );

    console.log(`✨ Created agent "${name}" from template "${template.name}"`);

    res.status(201).json({
      success: true,
      agent: {
        id: agentId,
        name,
        template: { id: template.id, name: template.name },
        model,
        systemPrompt,
        tools: template.tools,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating agent from template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
