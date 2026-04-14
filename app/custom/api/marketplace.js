'use strict';

/**
 * Marketplace API — agent templates + skills
 *
 * Routes (all mounted under /api/v1/marketplace):
 *   GET  /templates              — list templates (category, search, sort, page, limit)
 *   GET  /templates/:id          — template detail
 *   POST /templates/:id/install  — create agent from template
 *   GET  /skills                 — list all skills
 */

const express = require('express');
const router = express.Router();
const { authenticateAgent } = require('../lib/auth');
const { getAgentTemplates, getAgentSkills } = require('../../../seeds/loadTemplates');

// ─── DB pool (optional — install endpoint needs it) ──────────────────────────

let pool;
try {
  pool = require('../../lib/postgres').pool;
} catch (_) {
  try {
    pool = require('../../../lib/vaultbrix');
  } catch (__) {
    // Will fall back to req.app.locals.pool at request time
  }
}

const SCHEMA = 'tenant_vutler';

function normalizeWorkspaceId(value) {
  if (typeof value !== 'string') return value || null;
  const normalized = value.trim();
  return normalized || null;
}

function workspaceIdOf(req) {
  const candidates = [
    req.workspaceId,
    req.user?.workspaceId,
    req.user?.workspace_id,
    req.agent?.workspaceId,
    req.agent?.workspace_id,
  ];
  for (const candidate of candidates) {
    const value = normalizeWorkspaceId(candidate);
    if (value) return value;
  }
  return null;
}

function ensureWorkspaceContext(req, res, next) {
  const workspaceId = workspaceIdOf(req);
  if (!workspaceId) {
    return res.status(400).json({
      success: false,
      error: 'workspace context is required',
    });
  }
  req.workspaceId = workspaceId;
  return next();
}

// ─── In-memory template store (loaded at module init) ────────────────────────

let _templates = null;
let _skills = null;

function getTemplates() {
  if (!_templates) _templates = getAgentTemplates();
  return _templates;
}

function getSkills() {
  if (!_skills) _skills = getAgentSkills();
  return _skills;
}

/**
 * Normalize a raw template (from JSON seed) into the shape the frontend
 * expects: { id, name, description, category, avatar, config: { model, system_prompt, tags, icon } }
 */
function normalizeTemplate(tpl) {
  return {
    id: tpl.id || String(tpl.name).toLowerCase().replace(/\s+/g, '-'),
    name: tpl.name,
    description: tpl.description || '',
    category: tpl.category || 'custom',
    avatar: tpl.avatar || null,
    skills: tpl.skills || [],
    tags: tpl.tags || [],
    install_count: tpl.install_count || 0,
    avg_rating: tpl.avg_rating || 0,
    review_count: tpl.review_count || 0,
    config: {
      model: tpl.model || 'gpt-5.4',
      temperature: (tpl.config && tpl.config.temperature) != null ? tpl.config.temperature : 0.7,
      max_tokens: (tpl.config && tpl.config.max_tokens) || 2000,
      system_prompt: tpl.system_prompt || '',
      icon: tpl.avatar || null,
      tags: tpl.tags || [],
    },
  };
}

// ─── GET /templates ───────────────────────────────────────────────────────────

router.get('/templates', (req, res) => {
  try {
    const {
      category,
      search,
      sort = 'popular',
      page = 1,
      limit = 50,
    } = req.query;

    let templates = getTemplates().map(normalizeTemplate);

    // Category filter
    if (category && category !== 'All') {
      templates = templates.filter(
        t => t.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      templates = templates.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    // Sorting
    switch (sort) {
      case 'newest':
        // JSON seed order is intentional; newest = reverse order
        templates = [...templates].reverse();
        break;
      case 'top_rated':
        templates = [...templates].sort((a, b) => b.avg_rating - a.avg_rating);
        break;
      case 'alphabetical':
        templates = [...templates].sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // popular — default seed order (already sorted by relevance)
        break;
    }

    const total = templates.length;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;
    const paged = templates.slice(offset, offset + limitNum);

    res.json({ success: true, templates: paged, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('[Marketplace] GET /templates error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /templates/:id ───────────────────────────────────────────────────────

router.get('/templates/:id', (req, res) => {
  try {
    const { id } = req.params;
    const all = getTemplates().map(normalizeTemplate);
    const template = all.find(t => t.id === id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, template });
  } catch (err) {
    console.error('[Marketplace] GET /templates/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /templates/:id/install ─────────────────────────────────────────────

router.post('/templates/:id/install', authenticateAgent, ensureWorkspaceContext, async (req, res) => {
  try {
    const { id } = req.params;
    const all = getTemplates().map(normalizeTemplate);
    const template = all.find(t => t.id === id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const db = pool || (req.app && req.app.locals && req.app.locals.pg);

    if (!db) {
      // No DB — return template data so caller can create the agent client-side
      return res.json({
        success: true,
        template,
        agent: null,
        message: 'DB unavailable — use template config to create agent',
      });
    }

    const ws = workspaceIdOf(req);
    const userId = req.user?.id || req.agent?.id || null;

    // Derive a unique username
    const baseUsername = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent';
    let username = baseUsername;
    for (let i = 1; i <= 20; i++) {
      const check = await db.query(`SELECT 1 FROM ${SCHEMA}.agents WHERE username = $1 LIMIT 1`, [username]);
      if (check.rows.length === 0) break;
      username = `${baseUsername}-${i}`;
    }

    const agent = await db.query(
      `INSERT INTO ${SCHEMA}.agents
         (workspace_id, name, username, description, type, status, tools, model, system_prompt)
       VALUES ($1, $2, $3, $4, 'custom', 'inactive', $5, $6, $7)
       RETURNING *`,
      [
        ws,
        template.name,
        username,
        template.description,
        JSON.stringify(template.config.tags || []),
        template.config.model,
        template.config.system_prompt,
      ]
    );

    // agent_configs row
    try {
      await db.query(
        `INSERT INTO ${SCHEMA}.agent_configs (agent_id, workspace_id, model, system_prompt, permissions)
         VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
        [agent.rows[0].id, ws, template.config.model, template.config.system_prompt]
      );
    } catch (_) {}

    // Audit log
    try {
      await db.query(
        `INSERT INTO ${SCHEMA}.audit_logs (user_id, action, entity_type, entity_id, details, workspace_id)
         VALUES ($1, 'marketplace_install', 'agent_template', $2, $3, $4)`,
        [userId, id, JSON.stringify({ template_name: template.name, agent_id: agent.rows[0].id }), ws]
      );
    } catch (_) {}

    res.status(201).json({ success: true, agent: agent.rows[0], template });
  } catch (err) {
    console.error('[Marketplace] POST /templates/:id/install error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /skills ──────────────────────────────────────────────────────────────

router.get('/skills', (req, res) => {
  try {
    const { category } = req.query;
    const skills = getSkills();

    let entries = Object.entries(skills).map(([key, skill]) => ({
      key,
      ...skill,
    }));

    if (category) {
      entries = entries.filter(s => s.category === category);
    }

    // Group by category for convenience
    const grouped = entries.reduce((acc, skill) => {
      const cat = skill.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(skill);
      return acc;
    }, {});

    res.json({ success: true, skills: entries, grouped, total: entries.length });
  } catch (err) {
    console.error('[Marketplace] GET /skills error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports._private = {
  workspaceIdOf,
  ensureWorkspaceContext,
};
