'use strict';

const express = require('express');
const { listTemplates, getTemplateDetail, createTemplate } = require('./services/templateService');
const { validateTemplateCreatePayload } = require('./validators/templateSchema');

const router = express.Router();

router.get('/templates', async (req, res) => {
  const result = listTemplates({
    q: req.query.q,
    category: req.query.category,
    difficulty: req.query.difficulty,
    sort: req.query.sort || 'relevance',
    page: req.query.page || 1,
    limit: req.query.limit || 20,
  });
  res.json({ success: true, templates: result.data, pagination: result.pagination });
});

router.get('/templates/:id', async (req, res) => {
  const template = getTemplateDetail(req.params.id, []);
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  res.json({ success: true, template });
});

router.post('/templates', async (req, res) => {
  const validation = validateTemplateCreatePayload(req.body || {});
  if (!validation.valid) {
    return res.status(422).json({
      error: 'validation_failed',
      details: validation.errors,
    });
  }

  const item = createTemplate(req.body, req.userId || null);
  res.status(201).json({
    id: item.id,
    slug: item.slug,
    status: 'pending',
    validation_result: {
      valid: true,
      errors: [],
    },
  });
});

module.exports = router;
