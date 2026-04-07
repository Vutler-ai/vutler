'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function getDiscoveryRegistryPath() {
  return path.join(os.homedir(), '.vutler', 'nexus-discovery.json');
}

function ensureDiscoveryRegistryDir() {
  fs.mkdirSync(path.dirname(getDiscoveryRegistryPath()), { recursive: true });
}

function readDiscoveryRegistry() {
  try {
    const raw = JSON.parse(fs.readFileSync(getDiscoveryRegistryPath(), 'utf8'));
    return Array.isArray(raw?.instances) ? raw.instances : [];
  } catch (_) {
    return [];
  }
}

function writeDiscoveryRegistry(instances) {
  ensureDiscoveryRegistryDir();
  fs.writeFileSync(getDiscoveryRegistryPath(), JSON.stringify({ instances }, null, 2));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function normalizeDiscoveryInstance(instance) {
  if (!instance || typeof instance !== 'object') return null;
  const runtimeId = typeof instance.runtime_id === 'string' ? instance.runtime_id : '';
  if (!runtimeId) return null;

  const pid = Number.parseInt(instance.pid, 10);
  const port = Number.parseInt(instance.port, 10);
  const discoveryPort = Number.parseInt(instance.discovery_port, 10);

  return {
    runtime_id: runtimeId,
    pid: Number.isFinite(pid) ? pid : null,
    port: Number.isFinite(port) ? port : null,
    discovery_port: Number.isFinite(discoveryPort) ? discoveryPort : null,
    node_id: typeof instance.node_id === 'string' ? instance.node_id : null,
    node_name: typeof instance.node_name === 'string' ? instance.node_name : null,
    mode: typeof instance.mode === 'string' ? instance.mode : 'local',
    server: typeof instance.server === 'string' ? instance.server : 'https://app.vutler.ai',
    connected: Boolean(instance.connected),
    setup_mode: Boolean(instance.setup_mode),
    updated_at: typeof instance.updated_at === 'string' ? instance.updated_at : new Date().toISOString(),
  };
}

function listDiscoveryInstances() {
  const active = readDiscoveryRegistry()
    .map(normalizeDiscoveryInstance)
    .filter((instance) => instance && isProcessAlive(instance.pid));

  const deduped = [];
  const seen = new Set();
  for (const instance of active) {
    if (seen.has(instance.runtime_id)) continue;
    seen.add(instance.runtime_id);
    deduped.push(instance);
  }

  deduped.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  writeDiscoveryRegistry(deduped);
  return deduped;
}

function upsertDiscoveryInstance(instance) {
  const normalized = normalizeDiscoveryInstance(instance);
  if (!normalized) {
    throw new Error('Invalid discovery instance payload');
  }

  const instances = listDiscoveryInstances().filter((entry) => entry.runtime_id !== normalized.runtime_id);
  instances.unshift(normalized);
  writeDiscoveryRegistry(instances);
  return normalized;
}

function removeDiscoveryInstance(runtimeId) {
  if (!runtimeId) return;
  const instances = listDiscoveryInstances().filter((entry) => entry.runtime_id !== runtimeId);
  writeDiscoveryRegistry(instances);
}

module.exports = {
  getDiscoveryRegistryPath,
  listDiscoveryInstances,
  upsertDiscoveryInstance,
  removeDiscoveryInstance,
};
