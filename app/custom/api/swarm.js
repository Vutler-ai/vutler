"use strict";

const express = require("express");
const { getSwarmCoordinator } = require("../services/swarmCoordinator");

const router = express.Router();

function coordinator(req) {
  return req.app.locals.swarmCoordinator || getSwarmCoordinator();
}

router.post("/task", async (req, res) => {
  try {
    const { title, description, priority } = req.body || {};
    const result = await coordinator(req).createTask({ title, description, priority });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("[Swarm API] create task error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const data = await coordinator(req).listTasks();
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] list tasks error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/task/:id/claim", async (req, res) => {
  try {
    const { agent_id } = req.body || {};
    const data = await coordinator(req).claimTask(req.params.id, agent_id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] claim error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/task/:id/complete", async (req, res) => {
  try {
    const { agent_id, output } = req.body || {};
    const data = await coordinator(req).completeTask(req.params.id, agent_id, output);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] complete error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/events", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const data = await coordinator(req).listEvents(limit);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] events error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/broadcast", async (req, res) => {
  try {
    const { message, type, payload } = req.body || {};
    const data = await coordinator(req).broadcast(message, type, payload);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] broadcast error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
