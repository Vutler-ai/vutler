'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('./middleware/auth');
const svc = require('../services/taskAssignment');

router.post('/tasks/assign/marcus', authMiddleware, async (req, res) => {
  try {
    const task = await svc.createTask({
      title: req.body?.title || 'Reporting Marcus',
      description: req.body?.description || '',
      priority: req.body?.priority || 10,
      metadata: req.body?.metadata || {},
      assignee: {
        agent_name: 'Marcus',
        agent_internal_id: process.env.MARCUS_AGENT_INTERNAL_ID || 'marcus',
      },
    });
    res.status(201).json({ success: true, task });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/tasks/assign/sentinel', authMiddleware, async (req, res) => {
  try {
    const task = await svc.createTask({
      title: req.body?.title || 'Reporting Sentinel',
      description: req.body?.description || '',
      priority: req.body?.priority || 10,
      metadata: req.body?.metadata || {},
      assignee: {
        agent_name: 'Sentinel',
        agent_internal_id: process.env.SENTINEL_AGENT_INTERNAL_ID || 'sentinel',
      },
    });
    res.status(201).json({ success: true, task });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/tasks/assign', authMiddleware, async (req, res) => {
  try {
    const task = await svc.createTask({
      title: req.body?.title,
      description: req.body?.description || '',
      priority: req.body?.priority || 10,
      metadata: req.body?.metadata || {},
      assignee: {
        agent_name: req.body?.agent_name,
        agent_internal_id: req.body?.agent_internal_id,
      },
    });
    res.status(201).json({ success: true, task });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/tasks/claim', authMiddleware, async (req, res) => {
  try {
    const task = await svc.claimTaskForWorker({
      worker: req.body?.worker || {},
      task_id: req.body?.task_id,
    });
    res.json({ success: true, task });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/tasks/:id/complete', authMiddleware, async (req, res) => {
  try {
    const result = await svc.completeTask({
      worker: req.body?.worker || {},
      task_id: req.params.id,
      success: req.body?.success !== false,
      result: req.body?.result || {},
    });
    res.json({ success: true, result });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;
