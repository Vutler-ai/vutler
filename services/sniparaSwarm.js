"use strict";
const {
  buildSniparaProjectUrl,
  DEFAULT_SNIPARA_PROJECT_SLUG,
} = require('./sniparaResolver');
const SNIPARA_URL = process.env.SNIPARA_PROJECT_MCP_URL
  || process.env.SNIPARA_MCP_URL
  || process.env.SNIPARA_API_URL
  || buildSniparaProjectUrl(process.env.SNIPARA_PROJECT_SLUG || DEFAULT_SNIPARA_PROJECT_SLUG);
const SNIPARA_KEY = process.env.SNIPARA_API_KEY || "REDACTED_SNIPARA_KEY_2";
const SWARM_ID = process.env.SNIPARA_SWARM_ID || "cmmdu24k500g01ihbw32d44x2";

async function callSnipara(toolName, args) {
  const resp = await fetch(SNIPARA_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SNIPARA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: toolName, arguments: args }, id: Date.now() })
  });
  const data = await resp.json();
  return data.result?.content?.[0]?.text ? JSON.parse(data.result.content[0].text) : data;
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
