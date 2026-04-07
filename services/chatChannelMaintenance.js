'use strict';

const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');

const DEFAULT_SCHEMA = 'tenant_vutler';
const CHAT_PREFERENCE_COLUMNS = [
  'id',
  'workspace_id',
  'channel_id',
  'user_id',
  'pinned',
  'muted',
  'archived',
  'created_at',
  'updated_at',
];

const TECHNICAL_DM_PATTERNS = [
  /^dm__agent__/i,
  /^dm__user__/i,
  /^dm_/i,
  /^jarvis-policy-check-/i,
  /^jarvis-e2e-/i,
  /^codex-verify-/i,
  /^dm-delete-check-/i,
  /^test-/i,
  /^verify-/i,
  /^e2e-/i,
  /^smoke-/i,
  /^codex-/i,
  /^jarvis-/i,
  /^dm-[a-z0-9-]+-[a-f0-9]{8}$/i,
];

const TECHNICAL_CHANNEL_PATTERNS = [
  /^test[-_ ]/i,
  /^verify[-_ ]/i,
  /^e2e[-_ ]/i,
  /^smoke[-_ ]/i,
  /^codex[-_ ]/i,
  /^jarvis[-_ ]/i,
  /^tmp[-_ ]/i,
  /^temp[-_ ]/i,
  /^channel[-_ ]/i,
  /^room[-_ ]/i,
  /^workspace[-_ ]/i,
  /^group[-_ ]/i,
  /^[0-9a-f]{8,}$/i,
];

let chatPreferencesSchemaPromise = null;

function slugifyContactToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function canonicalDmNameForContact(contactName, username) {
  let token = slugifyContactToken(username || contactName);
  token = token.replace(/^(dm-)+/i, '');
  if (!token || isGenericChannelToken(token)) return null;
  return token ? `DM-${token}` : null;
}

function toTitleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isGenericChannelToken(value) {
  return [
    'test',
    'verify',
    'e2e',
    'smoke',
    'codex',
    'jarvis',
    'tmp',
    'temp',
    'channel',
    'room',
    'workspace',
    'group',
    'direct',
    'message',
    'dm',
  ].includes(String(value || '').toLowerCase());
}

function looksTechnicalDmName(name) {
  return TECHNICAL_DM_PATTERNS.some((pattern) => pattern.test(String(name || '')));
}

function looksTechnicalChannelName(name) {
  const raw = String(name || '');
  return TECHNICAL_CHANNEL_PATTERNS.some((pattern) => pattern.test(raw)) || isUuidLike(raw);
}

function deriveReadableChannelName(name) {
  const rawName = String(name || '');
  let normalized = rawName
    .replace(/^[a-z]+(?:__[a-z0-9-]+)+/i, '')
    .replace(/^(test|verify|e2e|smoke|codex|jarvis|tmp|temp|channel|room|workspace|group)[-_ ]+/i, '')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, '')
    .replace(/[0-9a-f]{8,}/ig, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  normalized = normalized
    .split(/\s+/)
    .filter((part) => !isGenericChannelToken(part))
    .join(' ')
    .trim();

  if (!normalized) return null;
  return toTitleCase(normalized);
}

function deriveReadableChannelNameFromDescription(description) {
  const raw = String(description || '').trim();
  if (!raw || looksTechnicalChannelName(raw)) return null;
  const leading = raw.split(/[.,:;-]/)[0].trim();
  if (!leading) return null;
  const normalized = leading
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part && !isGenericChannelToken(part))
    .slice(0, 4)
    .join(' ')
    .trim();
  if (!normalized) return null;
  return toTitleCase(normalized);
}

function canonicalChannelName(row) {
  const type = String(row.type || '').toLowerCase();
  if (type === 'dm' || type === 'direct') {
    return canonicalDmNameForContact(row.display_name || row.name, row.contact_username || row.username);
  }

  return deriveReadableChannelName(row.raw_name || row.name)
    || deriveReadableChannelNameFromDescription(row.description)
    || 'Untitled Channel';
}

function shouldNormalizeLegacyChannel(row) {
  const type = String(row.type || '').toLowerCase();
  if (type === 'dm' || type === 'direct') {
    return shouldNormalizeLegacyDm(row);
  }

  const rawName = String(row.raw_name || row.name || '');
  const canonicalName = canonicalChannelName(row);
  if (!rawName || !canonicalName) return false;
  if (rawName.toLowerCase() === canonicalName.toLowerCase()) return false;
  return looksTechnicalChannelName(rawName);
}

function shouldNormalizeLegacyDm(row) {
  if (String(row.type || '').toLowerCase() !== 'dm' && String(row.type || '').toLowerCase() !== 'direct') {
    return false;
  }

  const rawName = String(row.raw_name || row.name || '');
  const canonicalName = canonicalDmNameForContact(row.display_name || row.name, row.contact_username || row.username);
  if (!rawName || !canonicalName) return false;
  if (rawName.toLowerCase() === canonicalName.toLowerCase()) return false;

  return looksTechnicalDmName(rawName) || /^dm-/i.test(rawName) || isUuidLike(rawName);
}

async function ensureChatPreferencesTable(pg, schema = DEFAULT_SCHEMA) {
  if (!chatPreferencesSchemaPromise) {
    chatPreferencesSchemaPromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(pg, schema, 'chat_channel_preferences', {
          label: 'Chat channel preferences table',
        });
        await assertColumnsExist(pg, schema, 'chat_channel_preferences', CHAT_PREFERENCE_COLUMNS, {
          label: 'Chat channel preferences table',
        });
        return;
      }

      await pg.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.chat_channel_preferences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          channel_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          pinned BOOLEAN NOT NULL DEFAULT FALSE,
          muted BOOLEAN NOT NULL DEFAULT FALSE,
          archived BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (workspace_id, channel_id, user_id)
        )
      `);
      await pg.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_channel_preferences_workspace_user
        ON ${schema}.chat_channel_preferences (workspace_id, user_id)
      `);
    })().catch((err) => {
      chatPreferencesSchemaPromise = null;
      throw err;
    });
  }

  return chatPreferencesSchemaPromise;
}

async function findExistingDmChannelId(pg, { schema = DEFAULT_SCHEMA, workspaceId, currentUserId, contactId }) {
  const existing = await pg.query(
    `SELECT c.id
     FROM ${schema}.chat_channels c
     WHERE c.workspace_id = $1
       AND c.type = 'dm'
       AND EXISTS (
         SELECT 1
         FROM ${schema}.chat_channel_members target_cm
         WHERE target_cm.channel_id = c.id
           AND target_cm.user_id = $3
       )
       AND (
         EXISTS (
           SELECT 1
           FROM ${schema}.chat_channel_members self_cm
           WHERE self_cm.channel_id = c.id
             AND self_cm.user_id = $2
         )
         OR c.created_by = $2
       )
       AND NOT EXISTS (
         SELECT 1
         FROM ${schema}.chat_channel_members unexpected_cm
         WHERE unexpected_cm.channel_id = c.id
           AND unexpected_cm.user_id NOT IN ($2, $3)
       )
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [workspaceId, currentUserId, contactId]
  );

  return existing.rows[0]?.id || null;
}

async function normalizeLegacyDmRows(pg, rows, { schema = DEFAULT_SCHEMA } = {}) {
  const nextRows = [];
  const normalized = [];

  for (const row of rows) {
    if (!shouldNormalizeLegacyChannel(row)) {
      nextRows.push(row);
      continue;
    }

    const canonicalName = canonicalChannelName(row);
    const canonicalDescription = String(row.type || '').toLowerCase() === 'dm' || String(row.type || '').toLowerCase() === 'direct'
      ? `Direct message with ${row.display_name || row.name}`
      : (row.description || '');
    await pg.query(
      `UPDATE ${schema}.chat_channels
       SET name = $2, description = $3, updated_at = NOW()
       WHERE id = $1`,
      [row.id, canonicalName, canonicalDescription]
    );

    normalized.push({
      id: row.id,
      previous_name: row.raw_name || row.name,
      canonical_name: canonicalName,
    });
    nextRows.push({
      ...row,
      name: canonicalName,
      raw_name: canonicalName,
      description: canonicalDescription,
    });
  }

  return { rows: nextRows, normalized };
}

async function listLegacyDmRows(pg, { schema = DEFAULT_SCHEMA, workspaceId }) {
  const result = await pg.query(
    `SELECT
        c.id,
        c.name,
        c.name AS raw_name,
        c.description,
        c.type,
        contact.display_name,
        contact.contact_username,
        contact.contact_type
     FROM ${schema}.chat_channels c
     LEFT JOIN LATERAL (
       SELECT
         CASE
           WHEN a.id IS NOT NULL THEN a.name
           WHEN ua.id IS NOT NULL THEN COALESCE(NULLIF(ua.name, ''), ua.email)
           ELSE cm.user_id
         END AS display_name,
         a.username AS contact_username,
         CASE
           WHEN a.id IS NOT NULL THEN 'agent'
           WHEN ua.id IS NOT NULL THEN 'user'
           ELSE 'unknown'
         END AS contact_type
       FROM ${schema}.chat_channel_members cm
       LEFT JOIN ${schema}.agents a ON a.id::text = cm.user_id AND a.workspace_id = c.workspace_id
       LEFT JOIN ${schema}.users_auth ua ON ua.id::text = cm.user_id
       WHERE cm.channel_id = c.id
       ORDER BY
         CASE WHEN c.created_by IS NOT NULL AND cm.user_id = c.created_by::text THEN 1 ELSE 0 END,
         CASE WHEN a.id IS NOT NULL THEN 0 ELSE 1 END,
         cm.joined_at ASC
       LIMIT 1
     ) contact ON TRUE
     WHERE c.workspace_id = $1
       AND c.type IN ('dm', 'direct', 'channel', 'group', 'public', 'private')`,
    [workspaceId]
  );

  return result.rows;
}

async function normalizeLegacyDmChannels(pg, { schema = DEFAULT_SCHEMA, workspaceId }) {
  const rows = await listLegacyDmRows(pg, { schema, workspaceId });
  const result = await normalizeLegacyDmRows(pg, rows, { schema });
  return {
    normalized_count: result.normalized.length,
    normalized: result.normalized,
  };
}

async function listTechnicalDmChannels(pg, { schema = DEFAULT_SCHEMA, workspaceId }) {
  const result = await pg.query(
    `SELECT id, name, description, created_at
     FROM ${schema}.chat_channels
     WHERE workspace_id = $1
       AND type IN ('dm', 'direct')
     ORDER BY created_at DESC`,
    [workspaceId]
  );

  return result.rows.filter((row) => looksTechnicalDmName(row.name));
}

async function archiveTechnicalDmChannels(pg, { schema = DEFAULT_SCHEMA, workspaceId }) {
  await ensureChatPreferencesTable(pg, schema);
  const channels = await listTechnicalDmChannels(pg, { schema, workspaceId });
  if (channels.length === 0) {
    return { archived_channel_count: 0, archived_preference_count: 0, channels: [] };
  }

  const membersResult = await pg.query(
    `SELECT DISTINCT user_id::text AS user_id
     FROM ${schema}.workspace_members
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  const memberIds = membersResult.rows.map((row) => row.user_id).filter(Boolean);
  if (memberIds.length === 0) {
    return { archived_channel_count: 0, archived_preference_count: 0, channels: [] };
  }

  for (const channel of channels) {
    await pg.query(
      `INSERT INTO ${schema}.chat_channel_preferences (
         workspace_id, channel_id, user_id, pinned, muted, archived, updated_at
       )
       SELECT $1, $2, wm.user_id::text, FALSE, FALSE, TRUE, NOW()
       FROM ${schema}.workspace_members wm
       WHERE wm.workspace_id = $1
       ON CONFLICT (workspace_id, channel_id, user_id)
       DO UPDATE SET
         archived = TRUE,
         updated_at = NOW()`,
      [workspaceId, String(channel.id)]
    );
  }

  return {
    archived_channel_count: channels.length,
    archived_preference_count: channels.length * memberIds.length,
    channels: channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
    })),
  };
}

async function getChatMaintenanceStatus(pg, { schema = DEFAULT_SCHEMA, workspaceId }) {
  const [legacyRows, technicalChannels] = await Promise.all([
    listLegacyDmRows(pg, { schema, workspaceId }),
    listTechnicalDmChannels(pg, { schema, workspaceId }),
  ]);

  const legacyCandidates = legacyRows
    .filter((row) => shouldNormalizeLegacyChannel(row))
    .map((row) => ({
      id: row.id,
      current_name: row.raw_name || row.name,
      canonical_name: canonicalChannelName(row),
      contact_type: row.contact_type || 'unknown',
      channel_type: row.type || 'channel',
    }));

  const technicalWorkspaceChannels = legacyRows
    .filter((row) => {
      const type = String(row.type || '').toLowerCase();
      return type !== 'dm' && type !== 'direct' && looksTechnicalChannelName(row.raw_name || row.name);
    })
    .map((row) => ({
      id: row.id,
      name: row.raw_name || row.name,
      description: row.description || '',
      channel_type: row.type || 'channel',
    }));

  return {
    legacy_count: legacyCandidates.length,
    technical_count: technicalChannels.length,
    legacy_channels: legacyCandidates,
    technical_channels: technicalChannels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      description: channel.description || '',
    })),
    technical_workspace_channel_count: technicalWorkspaceChannels.length,
    technical_workspace_channels: technicalWorkspaceChannels,
  };
}

module.exports = {
  getChatMaintenanceStatus,
  canonicalDmNameForContact,
  canonicalChannelName,
  ensureChatPreferencesTable,
  findExistingDmChannelId,
  looksTechnicalChannelName,
  looksTechnicalDmName,
  normalizeLegacyDmChannels,
  normalizeLegacyDmRows,
  archiveTechnicalDmChannels,
};
