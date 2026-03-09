"use strict";

const express = require("express");
const { getSwarmCoordinator } = require("../services/swarmCoordinator");

const router = express.Router();

const svc = (req) => req.app.locals.swarmCoordinator || getSwarmCoordinator();

router.post("/task", async (req, res) => {
  try {
    const { title, description, priority } = req.body || {};
    const data = await svc(req).createTask({ title, description, priority });
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const data = await svc(req).listTasks();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/task/:id/claim", async (req, res) => {
  try {
    const data = await svc(req).claimTask(req.params.id, req.body?.agent_id);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/task/:id/complete", async (req, res) => {
  try {
    const data = await svc(req).completeTask(req.params.id, req.body?.agent_id, req.body?.output);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/events", async (req, res) => {
  try {
    const data = await svc(req).events(Number(req.query.limit || 50));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/broadcast", async (req, res) => {
  try {
    const data = await svc(req).broadcast(req.body?.message, req.body?.type, req.body?.payload);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
