'use strict';

const fs = require('fs/promises');
const path = require('path');

const SEED_ROOT = path.join(__dirname, '..', '..', 'seeds', 'browser-operator');

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getVersionParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function readSeedDir(dirName) {
  const dirPath = path.join(SEED_ROOT, dirName);
  let fileNames = [];
  try {
    fileNames = await fs.readdir(dirPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  const records = [];
  for (const fileName of fileNames.filter((name) => name.endsWith('.json')).sort()) {
    const filePath = path.join(dirPath, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    records.push(JSON.parse(raw));
  }
  return records;
}

function normalizeRegistryRecord(record, kind) {
  assert(isObject(record), `${kind} record must be an object`);
  assert(typeof record.key === 'string' && record.key, `${kind} record is missing key`);
  assert(typeof record.version === 'string' && record.version, `${kind} record ${record.key} is missing version`);
  assert(typeof record.status === 'string' && record.status, `${kind} record ${record.key} is missing status`);
  assert(typeof record.managed_by === 'string' && record.managed_by, `${kind} record ${record.key} is missing managed_by`);
  assert(isObject(record.definition), `${kind} record ${record.key} is missing definition`);
  return record;
}

function latestFirst(a, b) {
  return b.version.localeCompare(a.version) || a.key.localeCompare(b.key);
}

async function loadRegistry() {
  const [profiles, flows, actionCatalogs] = await Promise.all([
    readSeedDir('profiles'),
    readSeedDir('flows'),
    readSeedDir('action-catalogs'),
  ]);

  const registry = {
    profiles: profiles.map((record) => normalizeRegistryRecord(record, 'profile')).sort(latestFirst),
    flows: flows.map((record) => normalizeRegistryRecord(record, 'flow')).sort(latestFirst),
    actionCatalogs: actionCatalogs.map((record) => normalizeRegistryRecord(record, 'action catalog')).sort(latestFirst),
  };

  validateRegistry(registry);
  return registry;
}

function validateRegistry(registry) {
  const actionCatalogKeys = new Set(registry.actionCatalogs.map((record) => record.key));
  const flowKeys = new Set(registry.flows.map((record) => record.key));

  assert(registry.actionCatalogs.length > 0, 'At least one browser operator action catalog is required');
  assert(registry.profiles.length > 0, 'At least one browser operator profile is required');

  for (const catalog of registry.actionCatalogs) {
    const actions = catalog.definition?.actions;
    assert(Array.isArray(actions) && actions.length > 0, `Action catalog ${catalog.key} is missing actions`);
    for (const action of actions) {
      assert(typeof action.action_key === 'string' && action.action_key, `Action catalog ${catalog.key} contains action without action_key`);
      assert(typeof action.risk_level === 'string' && action.risk_level, `Action ${action.action_key} in ${catalog.key} is missing risk_level`);
    }
  }

  for (const profile of registry.profiles) {
    const definition = profile.definition;
    assert(typeof definition.profile_key === 'string' && definition.profile_key === profile.key, `Profile ${profile.key} must match definition.profile_key`);
    assert(typeof definition.action_catalog_ref === 'string' && actionCatalogKeys.has(definition.action_catalog_ref), `Profile ${profile.key} references unknown action catalog ${definition.action_catalog_ref}`);
    assert(Array.isArray(definition.supported_flows), `Profile ${profile.key} is missing supported_flows`);
    for (const flowKey of definition.supported_flows) {
      assert(flowKeys.has(flowKey), `Profile ${profile.key} references unknown flow ${flowKey}`);
    }
  }

  for (const flow of registry.flows) {
    const definition = flow.definition;
    assert(typeof definition.flow_key === 'string' && definition.flow_key === flow.key, `Flow ${flow.key} must match definition.flow_key`);
    assert(Array.isArray(definition.steps) && definition.steps.length > 0, `Flow ${flow.key} is missing steps`);
    for (const step of definition.steps) {
      assert(typeof step.action_key === 'string' && step.action_key, `Flow ${flow.key} contains step without action_key`);
    }
  }
}

function pickVersion(records, key, version) {
  const filtered = records.filter((record) => record.key === key);
  if (!filtered.length) return null;
  if (version) {
    return filtered.find((record) => record.version === version) || null;
  }
  return filtered[0];
}

async function listProfiles() {
  const registry = await loadRegistry();
  return registry.profiles;
}

async function getProfile(profileKey, version) {
  const registry = await loadRegistry();
  return pickVersion(registry.profiles, profileKey, getVersionParam(version));
}

async function listFlows() {
  const registry = await loadRegistry();
  return registry.flows;
}

async function getFlow(flowKey, version) {
  const registry = await loadRegistry();
  return pickVersion(registry.flows, flowKey, getVersionParam(version));
}

async function listActionCatalogs() {
  const registry = await loadRegistry();
  return registry.actionCatalogs;
}

async function getActionCatalog({ catalogKey, profileKey, version } = {}) {
  const registry = await loadRegistry();
  if (catalogKey) {
    return pickVersion(registry.actionCatalogs, catalogKey, getVersionParam(version));
  }
  if (profileKey) {
    const profile = pickVersion(registry.profiles, profileKey, null);
    if (!profile) return null;
    return pickVersion(registry.actionCatalogs, profile.definition.action_catalog_ref, getVersionParam(version));
  }
  return registry.actionCatalogs[0] || null;
}

async function resolveRunCatalog(profileKey, flowKey, profileVersion, flowVersion) {
  const [profile, flow] = await Promise.all([
    getProfile(profileKey, profileVersion),
    getFlow(flowKey, flowVersion),
  ]);

  assert(profile, `Unknown browser operator profile: ${profileKey}`);
  assert(flow, `Unknown browser operator flow: ${flowKey}`);
  assert(profile.definition.supported_flows.includes(flow.key), `Flow ${flow.key} is not allowed for profile ${profile.key}`);

  const actionCatalog = await getActionCatalog({ profileKey: profile.key, version: profileVersion });
  assert(actionCatalog, `Action catalog not found for profile ${profile.key}`);

  const allowedActions = new Set((actionCatalog.definition.actions || []).map((action) => action.action_key));
  for (const step of flow.definition.steps || []) {
    assert(allowedActions.has(step.action_key), `Flow ${flow.key} uses unsupported action ${step.action_key}`);
  }

  return { profile, flow, actionCatalog };
}

module.exports = {
  listProfiles,
  getProfile,
  listFlows,
  getFlow,
  listActionCatalogs,
  getActionCatalog,
  resolveRunCatalog,
};
