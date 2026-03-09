'use strict';

const express = require('express');
const router = express.Router();

// Dynamic pool import
let pool;
try {
  pool = require('../lib/postgres').pool;
} catch (err) {
  console.warn('[Marketplace] postgres pool not found, will use req.pool');
}

/**
 * GET /api/v1/marketplace
 * Liste tous les templates avec filtres (PUBLIC)
 */
router.get('/', async (req, res) => {
  try {
    const { category, search, featured, limit = 50, offset = 0 } = req.query;
    const db = pool || req.pool || req.app.locals.pool;
    
    let query = 'SELECT * FROM tenant_vutler.templates WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount} OR tags::text ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (featured === 'true') {
      query += ` AND is_featured = true`;
    }

    query += ` ORDER BY is_featured DESC, install_count DESC, created_at DESC`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM tenant_vutler.templates WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;

    if (category) {
      countParamCount++;
      countQuery += ` AND category = $${countParamCount}`;
      countParams.push(category);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (name ILIKE $${countParamCount} OR description ILIKE $${countParamCount} OR tags::text ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (featured === 'true') {
      countQuery += ` AND is_featured = true`;
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      meta: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: result.rows.length
      }
    });
  } catch (err) {
    console.error('[Marketplace] Error listing templates:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/v1/marketplace/categories
 * Liste les catégories avec count (PUBLIC)
 */
router.get('/categories', async (req, res) => {
  try {
    const db = pool || req.pool || req.app.locals.pool;
    const result = await db.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM tenant_vutler.templates
      GROUP BY category
      ORDER BY count DESC, category ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('[Marketplace] Error listing categories:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/v1/marketplace/:slug
 * Détail d'un template (PUBLIC)
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const db = pool || req.pool || req.app.locals.pool;

    const result = await db.query(
      'SELECT * FROM tenant_vutler.templates WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Get reviews
    const reviews = await db.query(
      `SELECT * FROM tenant_vutler.template_reviews 
       WHERE template_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [result.rows[0].id]
    );

    const template = {
      ...result.rows[0],
      reviews: reviews.rows
    };

    res.json({
      success: true,
      data: template
    });
  } catch (err) {
    console.error('[Marketplace] Error getting template:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/v1/marketplace/:slug/install
 * Installe un template (crée un agent) - Auth optionnelle
 */
router.post('/:slug/install', async (req, res) => {
  try {
    const { slug } = req.params;
    const { name, config = {} } = req.body;
    const workspaceId = req.workspaceId || req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001';
    const userId = req.userId || req.headers['x-user-id'];
    const db = pool || req.pool || req.app.locals.pool;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Agent name is required'
      });
    }

    // Get template
    const templateResult = await db.query(
      'SELECT * FROM tenant_vutler.templates WHERE slug = $1',
      [slug]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const template = templateResult.rows[0];

    // Replace config variables in system_prompt
    let systemPrompt = template.system_prompt;
    
    // Default values
    const defaultConfig = {
      company_name: 'your company',
      language: 'English',
      tone: 'professional and friendly',
      timezone: 'UTC',
      ...config
    };

    // Replace all {{variable}} in the prompt
    Object.keys(defaultConfig).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      systemPrompt = systemPrompt.replace(regex, defaultConfig[key]);
    });

    // Generate username from name
    const username = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);

    // Create agent
    const agentResult = await db.query(
      `INSERT INTO tenant_vutler.agents 
       (workspace_id, name, username, email, system_prompt, model, tools, status, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        workspaceId,
        name,
        username,
        `${username}@vutler.ai`,
        systemPrompt,
        template.recommended_model,
        JSON.stringify(template.tools || []),
        'online',
        'bot'
      ]
    );

    // Increment install count
    await db.query(
      'UPDATE tenant_vutler.templates SET install_count = install_count + 1 WHERE id = $1',
      [template.id]
    );

    res.json({
      success: true,
      data: {
        agent: agentResult.rows[0],
        template: {
          slug: template.slug,
          name: template.name,
          emoji: template.emoji
        },
        config: defaultConfig
      }
    });
  } catch (err) {
    console.error('[Marketplace] Error installing template:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
