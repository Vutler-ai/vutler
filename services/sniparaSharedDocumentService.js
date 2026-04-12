'use strict';

const pool = require('../lib/vaultbrix');
const { assertTableExists, runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
let ensureTablePromise = null;

function ensureTable(db = pool) {
  if (!db) return null;
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(db, SCHEMA, 'snipara_shared_document_uploads', {
          label: 'Snipara shared document uploads table',
        });
        return;
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.snipara_shared_document_uploads (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id TEXT NOT NULL,
          collection_id TEXT NOT NULL,
          collection_name TEXT,
          remote_document_id TEXT,
          title TEXT NOT NULL,
          category TEXT,
          priority INTEGER NOT NULL DEFAULT 0,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          action TEXT,
          content_length INTEGER NOT NULL DEFAULT 0,
          content_preview TEXT,
          created_by_user_id TEXT,
          created_by_email TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_snipara_shared_document_uploads_workspace_created
        ON ${SCHEMA}.snipara_shared_document_uploads (workspace_id, created_at DESC)
      `);
    })().catch((err) => {
      ensureTablePromise = null;
      throw err;
    });
  }

  return ensureTablePromise;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 20);
}

function buildContentPreview(content) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, 280);
}

async function recordSharedDocumentUpload({
  workspaceId,
  collectionId,
  collectionName = null,
  remoteDocumentId = null,
  title,
  category = null,
  priority = 0,
  tags = [],
  action = null,
  content = '',
  createdByUserId = null,
  createdByEmail = null,
  db = pool,
} = {}) {
  if (!workspaceId || !collectionId || !title || !db) {
    throw new Error('workspaceId, collectionId, title, and db are required');
  }

  await ensureTable(db);

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.snipara_shared_document_uploads (
       workspace_id,
       collection_id,
       collection_name,
       remote_document_id,
       title,
       category,
       priority,
       tags,
       action,
       content_length,
       content_preview,
       created_by_user_id,
       created_by_email
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      workspaceId,
      collectionId,
      collectionName,
      remoteDocumentId,
      title,
      category,
      Math.max(0, Math.min(100, Number(priority) || 0)),
      JSON.stringify(normalizeTags(tags)),
      action,
      Math.max(0, String(content || '').length),
      buildContentPreview(content),
      createdByUserId,
      createdByEmail,
    ]
  );

  return result.rows[0] || null;
}

async function listSharedDocumentUploads(workspaceId, { limit = 20, db = pool } = {}) {
  if (!workspaceId || !db) return [];

  try {
    await ensureTable(db);
    const result = await db.query(
      `SELECT *
         FROM ${SCHEMA}.snipara_shared_document_uploads
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [workspaceId, Math.max(1, Math.min(50, Number(limit) || 20))]
    );
    return result.rows || [];
  } catch (error) {
    if (error?.code === '42P01') return [];
    throw error;
  }
}

module.exports = {
  ensureTable,
  listSharedDocumentUploads,
  recordSharedDocumentUpload,
};
