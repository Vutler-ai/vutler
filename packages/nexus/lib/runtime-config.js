'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function getConfigPath() {
  return path.join(os.homedir(), '.vutler', 'nexus.json');
}

function ensureConfigDir() {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
}

function readRuntimeConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeRuntimeConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  return config;
}

function decodeDeployToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format — expected header.payload.signature');
  }

  const payload = parts[1];
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(json);
}

function buildRuntimeConfigFromToken(token, overrides = {}) {
  const payload = decodeDeployToken(token);
  if (payload.exp && Date.now() > payload.exp) {
    throw new Error('Token has expired.');
  }

  const config = {
    deploy_token: token,
    api_key: payload.api_key || null,
    mode: payload.mode || 'standard',
    node_id: payload.node_id || null,
    node_name: overrides.nodeName || payload.node_name || payload.name || null,
    snipara_instance_id: payload.snipara_instance_id || null,
    permissions: overrides.permissions || payload.permissions || {},
    server: overrides.server || payload.server || 'https://app.vutler.ai',
    updated_at: new Date().toISOString(),
  };

  if (payload.mode === 'enterprise') {
    config.client_name = payload.client_name || null;
    config.filesystem_root = payload.filesystem_root || null;
    config.seats = payload.seats || null;
    config.max_seats = payload.max_seats || null;
    config.primary_agent = payload.primary_agent || null;
    config.available_pool = payload.available_pool || [];
    config.allow_create = payload.allow_create ?? false;
    config.routing_rules = payload.routing_rules || [];
    config.auto_spawn_rules = payload.auto_spawn_rules || [];
    config.offline_config = payload.offline_config || {};
  }

  return config;
}

module.exports = {
  getConfigPath,
  readRuntimeConfig,
  writeRuntimeConfig,
  decodeDeployToken,
  buildRuntimeConfigFromToken,
};
