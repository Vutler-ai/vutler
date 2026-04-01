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

const ALWAYS_ON_TOOL_SKILL_KEYS = [
  'workspace_drive_list',
  'workspace_drive_search',
  'workspace_drive_read',
  'workspace_drive_write',
  'workspace_drive_create_folder',
  'vutler_calendar_list',
  'vutler_calendar_create',
  'vutler_calendar_update',
  'vutler_calendar_delete',
];

const OPTIONAL_TOOL_SKILL_KEYS = [
  'calendar_management',
  'google_drive_list',
  'google_drive_search',
  'google_drive_read',
  'google_calendar_list',
  'google_calendar_create',
  'google_calendar_update',
  'google_calendar_delete',
  'google_calendar_check_availability',
];

const NON_COUNTED_CAPABILITY_KEYS = new Set([
  ...TOOL_KEYS,
  ...ALWAYS_ON_TOOL_SKILL_KEYS,
  ...OPTIONAL_TOOL_SKILL_KEYS,
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

function isNonCountedCapability(value) {
  return NON_COUNTED_CAPABILITY_KEYS.has(value);
}

function normalizeCapabilities(capabilities) {
  return unique([
    ...ALWAYS_ON_TOOL_SKILL_KEYS,
    ...toStringArray(capabilities),
  ]);
}

function splitCapabilities(capabilities) {
  const list = normalizeCapabilities(capabilities);
  const tools = list.filter((value) => isNonCountedCapability(value));
  const skills = list.filter((value) => !isNonCountedCapability(value));
  return { skills, tools };
}

function countCountedSkills(capabilities) {
  return splitCapabilities(capabilities).skills.length;
}

function mergeCapabilities(body = {}, existing = []) {
  if (body.capabilities !== undefined) {
    return normalizeCapabilities(body.capabilities);
  }

  const hasSkills = body.skills !== undefined;
  const hasTools = body.tools !== undefined;
  if (hasSkills || hasTools) {
    return normalizeCapabilities([
      ...toStringArray(body.skills),
      ...toStringArray(body.tools),
    ]);
  }

  return normalizeCapabilities(existing);
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
    'Apply this rule to all destination-based actions, including Drive, calendar, email, and similar tools.',
    'If the user request could go to multiple destinations of the same kind and more than one of those destinations is actually available to you, ask one short clarifying question before acting.',
    'If only one valid destination is actually available to you, do the work directly and do not ask for confirmation about the destination.',
    'Example: if both the Vutler calendar and Google Calendar are available, ask "Should I put this in your Vutler calendar or your Google Calendar?" before creating the event.',
    'Use a direct clarification such as: "Should I put this in your Vutler calendar or your Google Calendar?"',
    'When the user asks for a folder or folder tree in Drive, create real folders with the folder creation tool instead of placeholder files such as .gitkeep or README.md unless the user explicitly requests those files.',
    'The canonical Drive root is /projects/Vutler.',
    'If a document destination is unclear, prefer the best matching Generated/ folder under /projects/Vutler.',
    'When available, return a direct link to the created artifact so the user can open it immediately.',
  ].join(' ');
}

module.exports = {
  TOOL_KEYS,
  ALWAYS_ON_TOOL_SKILL_KEYS,
  OPTIONAL_TOOL_SKILL_KEYS,
  NON_COUNTED_CAPABILITY_KEYS,
  toStringArray,
  isNonCountedCapability,
  normalizeCapabilities,
  splitCapabilities,
  countCountedSkills,
  mergeCapabilities,
  buildAgentConfigUpdate,
  buildInternalPlacementInstruction,
};
