"use strict";
const { createSniparaGateway } = require('./snipara/gateway');
const SWARM_ID = process.env.SNIPARA_SWARM_ID || "cmmdu24k500g01ihbw32d44x2";

async function callSnipara(toolName, args) {
  return createSniparaGateway().call(toolName, args);
}

async function broadcast(agentId, eventType, message) {
  return callSnipara("rlm_broadcast", { swarm_id: SWARM_ID, agent_id: agentId, event_type: eventType, message });
}
async function claimResource(agentId, resourceType, resourceId, timeoutSeconds = 300) {
  return callSnipara("rlm_claim", { swarm_id: SWARM_ID, agent_id: agentId, resource_type: resourceType, resource_id: resourceId, timeout_seconds: timeoutSeconds });
}
async function releaseResource(agentId, resourceType, resourceId) {
  return callSnipara("rlm_release", { swarm_id: SWARM_ID, agent_id: agentId, resource_type: resourceType, resource_id: resourceId });
}
async function createTask(title, description, assignedTo, priority) {
  return callSnipara("rlm_task_create", { swarm_id: SWARM_ID, title, description, assigned_to: assignedTo, priority: priority || "medium" });
}
async function completeTask(taskId) {
  return callSnipara("rlm_task_complete", { swarm_id: SWARM_ID, task_id: taskId });
}

module.exports = { broadcast, claimResource, releaseResource, createTask, completeTask, callSnipara };
