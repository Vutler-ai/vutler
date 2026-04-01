'use strict';

/**
 * Vault Service — secure credential storage & LLM-powered extraction
 *
 * Secrets are encrypted at rest with AES-256-GCM via CryptoService.
 * Only getSecret() ever decrypts; all other queries return '••••••••'.
 *
 * Table: tenant_vutler.vault_secrets
 */

const { CryptoService } = require('./crypto');
const { pool } = require('../lib/postgres');
const { chat } = require('./llmRouter');
const { assertTableExists, runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');

const crypto = new CryptoService();

// ── DDL ───────────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS tenant_vutler.vault_secrets (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID         NOT NULL,
  label          TEXT         NOT NULL,
  type           TEXT         NOT NULL CHECK (type IN (
                   'ssh', 'api_token', 'smtp', 'database',
                   'password', 'certificate', 'custom'
                 )),
  host           TEXT,
  port           INTEGER,
  username       TEXT,
  secret_encrypted TEXT       NOT NULL,
  tags           TEXT[]       DEFAULT '{}',
  notes          TEXT,
  source_file    TEXT,
  extracted_by   TEXT,
  last_used_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_workspace
  ON tenant_vutler.vault_secrets (workspace_id);

CREATE INDEX IF NOT EXISTS idx_vault_tags
  ON tenant_vutler.vault_secrets USING gin (tags);
`;

let _tableEnsured = false;

/**
 * Lazily create the vault_secrets table (idempotent).
 */
async function ensureVaultTable() {
  if (_tableEnsured) return;
  if (!runtimeSchemaMutationsAllowed()) {
    await assertTableExists(pool, 'tenant_vutler', 'vault_secrets', {
      label: 'Vault secrets table',
    });
    _tableEnsured = true;
    return;
  }
  await pool.query(CREATE_TABLE_SQL);
  _tableEnsured = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Replace the actual secret with a masked placeholder for safe responses. */
function maskRow(row) {
  if (!row) return null;
  return { ...row, secret_encrypted: '••••••••' };
}

const VALID_TYPES = new Set([
  'ssh', 'api_token', 'smtp', 'database', 'password', 'certificate', 'custom',
]);

function assertType(type) {
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Invalid vault secret type: "${type}". Must be one of: ${[...VALID_TYPES].join(', ')}`);
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Store an encrypted secret in the vault.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.label       — human-readable name
 * @param {string} params.type        — ssh | api_token | smtp | database | password | certificate | custom
 * @param {string} [params.host]
 * @param {number} [params.port]
 * @param {string} [params.username]
 * @param {string} params.secret      — plaintext secret (will be encrypted)
 * @param {string[]} [params.tags]
 * @param {string} [params.notes]
 * @param {string} [params.sourceFile]
 * @param {string} [params.extractedBy]
 * @param {string} [params.expiresAt]
 * @returns {object} Stored row (secret masked)
 */
async function storeSecret({
  workspaceId, label, type,
  host, port, username, secret,
  tags, notes, sourceFile, extractedBy, expiresAt,
}) {
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!label)       throw new Error('label is required');
  if (!secret)      throw new Error('secret is required');
  assertType(type);

  await ensureVaultTable();

  const encryptedSecret = crypto.encrypt(secret);

  const result = await pool.query(
    `INSERT INTO tenant_vutler.vault_secrets
       (workspace_id, label, type, host, port, username,
        secret_encrypted, tags, notes, source_file, extracted_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      workspaceId,
      label,
      type,
      host   || null,
      port   || null,
      username || null,
      encryptedSecret,
      tags   || [],
      notes  || null,
      sourceFile   || null,
      extractedBy  || null,
      expiresAt    || null,
    ],
  );

  return maskRow(result.rows[0]);
}

/**
 * Retrieve a secret by ID or exact label and DECRYPT it.
 * This is the ONLY function that returns the plaintext secret.
 * Updates last_used_at on each access.
 *
 * @param {string} workspaceId
 * @param {string} labelOrId   — UUID or exact label
 * @returns {object|null} Row with decrypted `secret` field (secret_encrypted removed)
 */
async function getSecret(workspaceId, labelOrId) {
  if (!workspaceId || !labelOrId) throw new Error('workspaceId and labelOrId are required');

  await ensureVaultTable();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(labelOrId);

  const result = await pool.query(
    `UPDATE tenant_vutler.vault_secrets
     SET last_used_at = NOW(), updated_at = NOW()
     WHERE workspace_id = $1
       AND (${isUuid ? 'id = $2' : 'label = $2'})
     RETURNING *`,
    [workspaceId, labelOrId],
  );

  const row = result.rows[0];
  if (!row) return null;

  // Decrypt — never log the result
  const secret = crypto.decrypt(row.secret_encrypted);

  const { secret_encrypted: _removed, ...rest } = row;
  return { ...rest, secret };
}

/**
 * Search secrets by tags, type, or label substring.
 * NEVER returns decrypted secrets.
 *
 * @param {string} workspaceId
 * @param {object} [filters]
 * @param {string[]} [filters.tags]   — must contain ALL listed tags
 * @param {string}   [filters.type]
 * @param {string}   [filters.query]  — partial match on label or notes
 * @returns {object[]} Metadata rows (secret masked)
 */
async function findSecrets(workspaceId, { tags, type, query } = {}) {
  if (!workspaceId) throw new Error('workspaceId is required');

  await ensureVaultTable();

  const conditions = ['workspace_id = $1'];
  const params = [workspaceId];
  let idx = 2;

  if (tags && tags.length > 0) {
    conditions.push(`tags @> $${idx}::text[]`);
    params.push(tags);
    idx++;
  }
  if (type) {
    conditions.push(`type = $${idx}`);
    params.push(type);
    idx++;
  }
  if (query) {
    conditions.push(`(label ILIKE $${idx} OR notes ILIKE $${idx})`);
    params.push(`%${query}%`);
    idx++;
  }

  const result = await pool.query(
    `SELECT id, workspace_id, label, type, host, port, username,
            tags, notes, source_file, extracted_by,
            last_used_at, expires_at, created_at, updated_at
     FROM tenant_vutler.vault_secrets
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC`,
    params,
  );

  return result.rows.map(r => ({ ...r, secret_encrypted: '••••••••' }));
}

/**
 * List all secrets for a workspace.
 * NEVER returns decrypted secrets.
 */
async function listSecrets(workspaceId) {
  if (!workspaceId) throw new Error('workspaceId is required');

  await ensureVaultTable();

  const result = await pool.query(
    `SELECT id, workspace_id, label, type, host, port, username,
            tags, notes, source_file, extracted_by,
            last_used_at, expires_at, created_at, updated_at
     FROM tenant_vutler.vault_secrets
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId],
  );

  return result.rows.map(r => ({ ...r, secret_encrypted: '••••••••' }));
}

/**
 * Delete a secret by ID (workspace-scoped).
 * @returns {boolean} true if deleted, false if not found
 */
async function deleteSecret(workspaceId, id) {
  if (!workspaceId || !id) throw new Error('workspaceId and id are required');

  await ensureVaultTable();

  const result = await pool.query(
    `DELETE FROM tenant_vutler.vault_secrets
     WHERE workspace_id = $1 AND id = $2
     RETURNING id`,
    [workspaceId, id],
  );

  return result.rows.length > 0;
}

/**
 * Partially update a vault secret (label, type, host, port, username,
 * tags, notes, expiresAt). To rotate the secret itself pass `secret`.
 * @returns {object|null} Updated row (masked) or null if not found
 */
async function updateSecret(workspaceId, id, updates = {}) {
  if (!workspaceId || !id) throw new Error('workspaceId and id are required');

  await ensureVaultTable();

  const allowed = ['label', 'type', 'host', 'port', 'username', 'secret', 'tags', 'notes', 'expires_at'];
  const setClauses = [];
  const params = [workspaceId, id];
  let idx = 3;

  for (const key of allowed) {
    const value = key === 'expires_at' ? (updates.expiresAt ?? undefined) : updates[key];
    if (value === undefined) continue;

    if (key === 'type') assertType(value);

    if (key === 'secret') {
      setClauses.push(`secret_encrypted = $${idx}`);
      params.push(crypto.encrypt(value));
    } else {
      setClauses.push(`${key} = $${idx}`);
      params.push(value);
    }
    idx++;
  }

  if (setClauses.length === 0) throw new Error('No valid fields to update');

  setClauses.push(`updated_at = NOW()`);

  const result = await pool.query(
    `UPDATE tenant_vutler.vault_secrets
     SET ${setClauses.join(', ')}
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    params,
  );

  return maskRow(result.rows[0] || null);
}

// ── LLM-powered Credential Extractor ─────────────────────────────────────────

const EXTRACT_SYSTEM_PROMPT = `You are a security credential extraction specialist.
Your job is to read raw text and extract ALL credentials, secrets, and access tokens you find.

You MUST output a valid JSON array only — no prose, no markdown fences, no explanation.
Each item must match this schema exactly:
{
  "label": "string — short descriptive name (e.g. 'AWS prod access key', 'MySQL staging DB')",
  "type": "one of: ssh | api_token | smtp | database | password | certificate | custom",
  "host": "string | null — hostname or IP if present",
  "port": "number | null — port number if present",
  "username": "string | null — login/username if present",
  "secret": "string — the actual secret: password, token, private key, connection string, etc.",
  "tags": ["string array of relevant tags, e.g. ['aws', 'production', 's3']"],
  "notes": "string | null — any useful context (e.g. 'expires 2025-12-31', 'read-only access')"
}

Rules:
- Extract EVERY credential you find, even partial ones
- For SSH private keys, put the full key block in secret
- For .env-style files, extract each KEY=value pair that looks like a secret
- For database connection strings, parse host/port/username/password individually
- Do NOT fabricate credentials — only extract what is explicitly in the text
- If the text contains no credentials at all, return: []
- Output ONLY the JSON array, nothing else`;

/**
 * Use the LLM to extract credentials from raw text (already parsed from a document).
 * Returns proposed credentials for human review BEFORE any storage.
 *
 * @param {string} text      — raw document text
 * @param {string} [agentId] — agent performing the extraction (for audit)
 * @param {object} [llmConfig] — optional { model, provider, apiKey, db, workspaceId }
 * @returns {object[]} Array of extracted credential objects (NOT yet stored)
 */
async function extractCredentialsFromText(text, agentId, llmConfig = {}) {
  if (!text || !text.trim()) return [];

  const {
    model    = process.env.VAULT_EXTRACT_MODEL    || 'claude-haiku-4-5',
    provider = process.env.VAULT_EXTRACT_PROVIDER || 'anthropic',
    apiKey   = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
    db       = pool,
    workspaceId = null,
  } = llmConfig;

  // Truncate extremely long texts to avoid token limits (~100k chars ≈ 25k tokens)
  const MAX_CHARS = 100_000;
  const truncated = text.length > MAX_CHARS
    ? text.slice(0, MAX_CHARS) + '\n\n[... text truncated for extraction ...]'
    : text;

  const agentSpec = {
    model,
    provider,
    system_prompt: EXTRACT_SYSTEM_PROMPT,
    workspace_id: workspaceId,
    // Provide api_key directly so llmRouter can use it without DB lookup
    ...(apiKey ? { api_key: apiKey } : {}),
  };

  const messages = [
    { role: 'user', content: `Extract all credentials from the following text:\n\n${truncated}` },
  ];

  let rawContent;
  try {
    const result = await chat(agentSpec, messages, db);
    rawContent = result?.content || '';
  } catch (err) {
    throw new Error(`[Vault] LLM extraction failed: ${err.message}`);
  }

  // Parse the JSON array response
  let credentials;
  try {
    // Strip accidental markdown fences if present
    const cleaned = rawContent
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    credentials = JSON.parse(cleaned);
  } catch (_) {
    // LLM returned something unparseable — return empty rather than crash
    console.warn('[Vault] extractCredentialsFromText: could not parse LLM response', rawContent.slice(0, 200));
    return [];
  }

  if (!Array.isArray(credentials)) return [];

  // Validate & sanitise each item
  return credentials
    .filter(c => c && typeof c.secret === 'string' && c.secret.trim())
    .map(c => ({
      label:    String(c.label  || 'Unnamed credential').trim(),
      type:     VALID_TYPES.has(c.type) ? c.type : 'custom',
      host:     c.host     ? String(c.host).trim()     : null,
      port:     c.port     ? Number(c.port)             : null,
      username: c.username ? String(c.username).trim() : null,
      secret:   String(c.secret).trim(),
      tags:     Array.isArray(c.tags) ? c.tags.map(String) : [],
      notes:    c.notes    ? String(c.notes).trim()    : null,
      // Provenance — filled in by caller before storing
      extractedBy: agentId || null,
    }));
}

module.exports = {
  ensureVaultTable,
  storeSecret,
  getSecret,
  findSecrets,
  listSecrets,
  deleteSecret,
  updateSecret,
  extractCredentialsFromText,
};
