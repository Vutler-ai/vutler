'use strict';

function summarizeMemoryTypes(memories = []) {
  return (memories || []).reduce((acc, memory) => {
    const key = String(memory?.type || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function summarizeMemoryScopes(memories = []) {
  return (memories || []).reduce((acc, memory) => {
    const key = String(memory?.scopeKey || memory?.scope_key || memory?.metadata?.memory_scope_key || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function logMemoryEvent(event, payload = {}) {
  console.info(`[MemoryTelemetry] ${event}`, payload);
}

module.exports = {
  summarizeMemoryTypes,
  summarizeMemoryScopes,
  logMemoryEvent,
};
