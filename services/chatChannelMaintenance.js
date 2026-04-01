'use strict';

const DEFAULT_SCHEMA = 'tenant_vutler';

const TECHNICAL_DM_PATTERNS = [
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

let chatPreferencesSchemaEnsured = false;

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
  const token = slugifyContactToken(username || contactName);
  return token ? `DM-${token}` : null;
}

function looksTechnicalDmName(name) {
  return TECHNICAL_DM_PATTERNS.some((pattern) => pattern.test(String(name || '')));
}

function shouldNormalizeLegacyDm(row) {
  if (String(row.type || '').toLowerCase() !== 'dm' && String(row.type || '').toLowerCase() !== 'direct') {
    return false;
  }
  if (String(row.contact_type || '').toLowerCase() !== 'agent') return false;

  const rawName = String(row.raw_name || row.name || '');
  const canonicalName = canonicalDmNameForContact(row.display_name || row.name, row.contact_username || row.username);
  if (!rawName || !canonicalName) return false;
  if (rawName.toLowerCase() === canonicalName.toLowerCase()) return false;
  if (rawName.startsWith('dm__agent__') || rawName.startsWith('dm__user__')) return false;

  return looksTechnicalDmName(rawName) || /^dm-/i.test(rawName) || isUuidLike(rawName);
}

async function ensureChatPreferencesTable(pg, schema = DEFAULT_SCHEMA) {
  if (chatPreferencesSchemaEnsured) return;

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
  chatPreferencesSchemaEnsured = true;
}

async function findExistingDmChannelId(pg, { schema = DEFAULT_SCHEMA, workspaceId, currentUserId, contactId }) {
  const existing = await pg.query(
    `SELECT c.id
     FROM ${schema}.chat_channels c
     JOIN ${schema}.chat_channel_members target_cm
       ON target_cm.channel_id = c.id
      AND target_cm.user_id = $3
     LEFT JOIN ${schema}.chat_channel_members self_cm
       ON self_cm.channel_id = c.id
      AND self_cm.user_id = $2
     WHERE c.workspace_id = $1
       AND c.type = 'dm'
       AND (self_cm.user_id IS NOT NULL OR c.created_by = $2)
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
    if (!shouldNormalizeLegacyDm(row)) {
      nextRows.push(row);
      continue;
    }

    const canonicalName = canonicalDmNameForContact(row.display_name || row.name, row.contact_username || row.username);
    const canonicalDescription = `Direct message with ${row.display_name || row.name}`;
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

async function listLegacyAgentDmRows(pg, { schema = DEFAULT_SCHEMA, workspaceId }) {
  const result = await pg.query(
    `SELECT DISTINCT ON (c.id)
        c.id,
        c.name,
        c.name AS raw_name,
        c.description,
        c.type,
        a.name AS display_name,
        a.username AS contact_username,
        'agent' AS contact_type
     FROM ${schema}.chat_channels c
     JOIN ${schema}.chat_channel_members cm ON cm.channel_id = c.id
     JOIN ${schema}.agents a ON a.id::text = cm.user_id AND a.workspace_id = c.workspace_id
     WHERE c.workspace_id = $1
       AND c.type = 'dm'
     ORDER BY c.id, cm.joined_at ASC`,
    [workspaceId]
  );

  return result.rows;
}

async function normalizeLegacyDmChannels(pg, { schema = DEFAULT_SCHEMA, workspaceId }) {
  const rows = await listLegacyAgentDmRows(pg, { schema, workspaceId });
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
       AND type = 'dm'
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

module.exports = {
  canonicalDmNameForContact,
  ensureChatPreferencesTable,
  findExistingDmChannelId,
  looksTechnicalDmName,
  normalizeLegacyDmChannels,
  normalizeLegacyDmRows,
  archiveTechnicalDmChannels,
};
