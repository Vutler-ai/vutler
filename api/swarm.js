"use strict";

const express = require("express");
const { getSwarmCoordinator } = require("../services/swarmCoordinator");

const router = express.Router();

const svc = (req) => req.app.locals.swarmCoordinator || getSwarmCoordinator();

router.post("/task", async (req, res) => {
  try {
    const { title, description, priority } = req.body || {};
    const data = await svc(req).createTask({ title, description, priority }, req.workspaceId);
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/htasks", async (req, res) => {
  try {
    const { level, title, description, owner, parent_id, workstream_type } = req.body || {};
    const data = await svc(req).createHtask({
      level,
      title,
      description,
      owner,
      parentId: parent_id,
      workstreamType: workstream_type,
    }, req.workspaceId);
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const data = await svc(req).listTasks(req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/htasks/:id/block", async (req, res) => {
  try {
    const data = await svc(req).blockHtask(
      req.params.id,
      req.body?.blocker_type,
      req.body?.blocker_reason,
      req.workspaceId
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/htasks/:id/unblock", async (req, res) => {
  try {
    const data = await svc(req).unblockHtask(req.params.id, req.body?.resolution, req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/htasks/:id/complete", async (req, res) => {
  try {
    const data = await svc(req).completeHtask(
      req.params.id,
      req.body?.result,
      req.body?.evidence,
      req.workspaceId
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/htasks/:id/verify-closure", async (req, res) => {
  try {
    const data = await svc(req).verifyHtaskClosure(req.params.id, req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/htasks/:id/close", async (req, res) => {
  try {
    const data = await svc(req).closeHtask(req.params.id, req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/task/:id/claim", async (req, res) => {
  try {
    const data = await svc(req).claimTask(req.params.id, req.body?.agent_id, req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/task/:id/complete", async (req, res) => {
  try {
    const data = await svc(req).completeTask(req.params.id, req.body?.agent_id, req.body?.output, req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/events", async (req, res) => {
  try {
    const data = await svc(req).events(Number(req.query.limit || 50), req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/broadcast", async (req, res) => {
  try {
    const data = await svc(req).broadcast(req.body?.message, req.body?.type, req.body?.payload, req.workspaceId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
