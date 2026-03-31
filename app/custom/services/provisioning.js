'use strict';

/**
 * Workspace provisioning helpers for Drive storage and canonical folder layout.
 */

const path = require('path');
const { pool } = require('../lib/postgres');
const s3Driver = require('./s3Driver');

const SCHEMA = 'tenant_vutler';
const DEFAULT_DRIVE_ROOT = '/projects/Vutler';
const DRIVE_ROOT_SETTING_KEY = 'drive_root';
const DRIVE_FOLDER_SCAFFOLD = [
  '/projects',
  '/projects/Vutler',
  '/projects/Vutler/Generated',
  '/projects/Vutler/Generated/Docs',
  '/projects/Vutler/Generated/Marketing',
  '/projects/Vutler/Generated/Meetings',
  '/projects/Vutler/Generated/Tasks',
  '/projects/Vutler/Generated/Finance',
  '/projects/Vutler/Generated/HR',
  '/projects/Vutler/Generated/Ops',
  '/projects/Vutler/Generated/Mail',
  '/projects/Vutler/Generated/Calendar',
];

function normalizeFolderPath(inputPath) {
  const normalized = path.posix.normalize(String(inputPath || '/').replace(/\\/g, '/'));
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function parentPathFor(folderPath) {
  const parent = path.posix.dirname(folderPath);
  return parent === '.' ? '/' : parent;
}

async function getWorkspace(workspaceId) {
  const result = await pool.query(
    `SELECT id, slug, name, storage_bucket
     FROM ${SCHEMA}.workspaces
     WHERE id = $1
     LIMIT 1`,
    [workspaceId]
  );

  if (!result.rows[0]) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  return result.rows[0];
}

async function ensureWorkspaceBucketRecord(workspace) {
  const bucketName = workspace.storage_bucket || s3Driver.getBucketName(workspace.slug || 'default');
  await s3Driver.ensureBucket(bucketName);

  if (workspace.storage_bucket !== bucketName) {
    await pool.query(
      `UPDATE ${SCHEMA}.workspaces
       SET storage_bucket = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [bucketName, workspace.id]
    );
  }

  return bucketName;
}

async function ensureDriveRootSetting(workspaceId, driveRoot = DEFAULT_DRIVE_ROOT) {
  const updated = await pool.query(
    `UPDATE ${SCHEMA}.workspace_settings
     SET value = $3::jsonb,
         updated_at = NOW()
     WHERE workspace_id = $1
       AND key = $2`,
    [workspaceId, DRIVE_ROOT_SETTING_KEY, JSON.stringify(driveRoot)]
  );

  if (updated.rowCount > 0) return;

  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::jsonb, NOW(), NOW())`,
    [workspaceId, DRIVE_ROOT_SETTING_KEY, JSON.stringify(driveRoot)]
  );
}

async function ensureDriveFolderScaffold(workspaceId, folders = DRIVE_FOLDER_SCAFFOLD) {
  for (const folder of folders) {
    const normalized = normalizeFolderPath(folder);
    const existing = await pool.query(
      `SELECT id
         FROM ${SCHEMA}.drive_files
        WHERE workspace_id = $1
          AND path = $2
        LIMIT 1`,
      [workspaceId, normalized]
    );

    if (existing.rows[0]?.id) {
      await pool.query(
        `UPDATE ${SCHEMA}.drive_files
         SET is_deleted = false,
             updated_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id]
      );
      continue;
    }

    await pool.query(
      `INSERT INTO ${SCHEMA}.drive_files
       (id, workspace_id, name, path, parent_path, mime_type, size_bytes, uploaded_by, s3_key, is_deleted, type)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'inode/directory', 0, NULL, NULL, false, 'folder')`,
      [workspaceId, path.posix.basename(normalized), normalized, parentPathFor(normalized)]
    );
  }
}

async function ensureWorkspaceDriveSetup(workspaceId, options = {}) {
  const driveRoot = options.driveRoot || DEFAULT_DRIVE_ROOT;
  const workspace = await getWorkspace(workspaceId);
  const bucketName = await ensureWorkspaceBucketRecord(workspace);
  await ensureDriveRootSetting(workspaceId, driveRoot);
  await ensureDriveFolderScaffold(workspaceId);

  return {
    workspaceId: workspace.id,
    slug: workspace.slug,
    bucketName,
    driveRoot,
  };
}

async function provisionWorkspace(workspace) {
  console.log(`[Provisioning] Provisioning workspace: ${workspace.slug} (${workspace.id})`);
  const result = await ensureWorkspaceDriveSetup(workspace.id);
  console.log(`[Provisioning] Workspace provisioned successfully: ${workspace.slug} with bucket ${result.bucketName}`);
  return result;
}

async function ensureWorkspaceBucket(workspaceId) {
  const workspace = await getWorkspace(workspaceId);
  return ensureWorkspaceBucketRecord(workspace);
}

async function initializeExistingWorkspaces() {
  console.log('[Provisioning] Initializing storage for existing workspaces...');

  const result = await pool.query(
    `SELECT id, slug, name, storage_bucket
     FROM ${SCHEMA}.workspaces
     ORDER BY created_at ASC NULLS LAST, id ASC`
  );

  for (const workspace of result.rows) {
    try {
      await provisionWorkspace(workspace);
    } catch (err) {
      console.error(`[Provisioning] Failed to provision workspace ${workspace.slug}:`, err.message);
    }
  }

  console.log('[Provisioning] Existing workspace initialization complete');
}

module.exports = {
  DEFAULT_DRIVE_ROOT,
  DRIVE_FOLDER_SCAFFOLD,
  provisionWorkspace,
  ensureWorkspaceBucket,
  ensureWorkspaceDriveSetup,
  ensureDriveFolderScaffold,
  initializeExistingWorkspaces,
};
