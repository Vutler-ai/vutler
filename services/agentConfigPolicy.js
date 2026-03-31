'use strict';

const TOOL_KEYS = new Set([
  'file_access',
  'workspace_drive',
  'google_drive',
  'google_calendar',
  'network_access',
  'code_execution',
  'web_search',
  'tool_use',
]);

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function splitCapabilities(capabilities) {
  const list = toStringArray(capabilities);
  const tools = list.filter((value) => TOOL_KEYS.has(value));
  const skills = list.filter((value) => !TOOL_KEYS.has(value));
  return { skills, tools };
}

function mergeCapabilities(body = {}, existing = []) {
  if (body.capabilities !== undefined) {
    return unique(toStringArray(body.capabilities));
  }

  const hasSkills = body.skills !== undefined;
  const hasTools = body.tools !== undefined;
  if (hasSkills || hasTools) {
    return unique([
      ...toStringArray(body.skills),
      ...toStringArray(body.tools),
    ]);
  }

  return unique(toStringArray(existing));
}

function buildAgentConfigUpdate({ body = {}, existing = {}, isCoordinator = false } = {}) {
  const nextCapabilities = mergeCapabilities(body, existing.capabilities || []);
  const updates = {};
  const ignored = [];

  const assignIfPresent = (key, value) => {
    if (value !== undefined) updates[key] = value;
  };

  assignIfPresent('model', body.model);
  assignIfPresent('provider', body.provider);
  assignIfPresent('temperature', body.temperature);
  assignIfPresent('max_tokens', body.max_tokens);
  assignIfPresent('mbti', body.mbti);
  assignIfPresent('type', body.type);
  assignIfPresent('description', body.description);
  assignIfPresent('avatar', body.avatar);
  assignIfPresent('capabilities', nextCapabilities);

  if (body.system_prompt !== undefined) {
    if (isCoordinator) {
      ignored.push('system_prompt');
    } else {
      updates.system_prompt = body.system_prompt;
    }
  }

  return {
    updates,
    ignored,
    capabilities: nextCapabilities,
    ...splitCapabilities(nextCapabilities),
  };
}

function buildInternalPlacementInstruction() {
  return [
    'You are operating inside Vutler.',
    'When you create or update a file, email draft, task, or calendar event, choose the canonical internal destination automatically instead of asking the user for a path, folder, or location unless the destination is genuinely ambiguous.',
    'The canonical Drive root is /projects/Vutler.',
    'If a document destination is unclear, prefer the best matching Generated/ folder under /projects/Vutler.',
    'When available, return a direct link to the created artifact so the user can open it immediately.',
  ].join(' ');
}

module.exports = {
  TOOL_KEYS,
  toStringArray,
  splitCapabilities,
  mergeCapabilities,
  buildAgentConfigUpdate,
  buildInternalPlacementInstruction,
};
