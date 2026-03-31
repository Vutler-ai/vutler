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
    const result = await coordinator(req).createTask({ title, description, priority }, req.workspaceId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("[Swarm API] create task error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/htasks", async (req, res) => {
  try {
    const { level, title, description, owner, parent_id, workstream_type } = req.body || {};
    const result = await coordinator(req).createHtask({
      level,
      title,
      description,
      owner,
      parentId: parent_id,
      workstreamType: workstream_type,
    }, req.workspaceId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("[Swarm API] create htask error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const data = await coordinator(req).listTasks(req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] list tasks error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/htasks/:id/block", async (req, res) => {
  try {
    const data = await coordinator(req).blockHtask(
      req.params.id,
      req.body?.blocker_type,
      req.body?.blocker_reason,
      req.workspaceId
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] htask block error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/htasks/:id/unblock", async (req, res) => {
  try {
    const data = await coordinator(req).unblockHtask(req.params.id, req.body?.resolution, req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] htask unblock error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/htasks/:id/complete", async (req, res) => {
  try {
    const data = await coordinator(req).completeHtask(
      req.params.id,
      req.body?.result,
      req.body?.evidence,
      req.workspaceId
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] htask complete error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/htasks/:id/verify-closure", async (req, res) => {
  try {
    const data = await coordinator(req).verifyHtaskClosure(req.params.id, req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] htask verify closure error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/htasks/:id/close", async (req, res) => {
  try {
    const data = await coordinator(req).closeHtask(req.params.id, req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] htask close error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/task/:id/claim", async (req, res) => {
  try {
    const { agent_id } = req.body || {};
    const data = await coordinator(req).claimTask(req.params.id, agent_id, req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] claim error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/task/:id/complete", async (req, res) => {
  try {
    const { agent_id, output } = req.body || {};
    const data = await coordinator(req).completeTask(req.params.id, agent_id, output, req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] complete error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/events", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const data = await coordinator(req).listEvents(limit, req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] events error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/broadcast", async (req, res) => {
  try {
    const { message, type, payload } = req.body || {};
    const data = await coordinator(req).broadcast(message, type, payload, req.workspaceId);
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Swarm API] broadcast error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
